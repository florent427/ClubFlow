import { decodeJwtPayload } from './jwt';

/** Clés distinctes de l’admin pour éviter les collisions sur le même origine. */
const TOKEN_KEY = 'clubflow_member_token';
const CLUB_ID_KEY = 'clubflow_member_club_id';
const CONTACT_ONLY_KEY = 'clubflow_member_contact_only';

/**
 * Émis à CHAQUE changement d'identité : connexion, déconnexion, changement de
 * profil. `apollo.ts` s'y abonne pour vider son cache.
 *
 * POURQUOI UN ÉVÉNEMENT ET NON UN APPEL DIRECT — `apollo.ts` importe déjà ce
 * module pour y lire le jeton ; l'appel inverse serait circulaire. L'événement
 * inverse la dépendance : le stockage annonce, Apollo écoute.
 *
 * POURQUOI ICI ET NON SUR LES APPELANTS — il y a vingt-quatre endroits qui
 * changent la session. En couvrir vingt-trois ne servirait à rien, et le
 * vingt-cinquième serait ajouté sans y penser. Le nettoyage doit être une
 * conséquence du changement de session, pas une politesse de l'appelant.
 *
 * CE QUE ÇA CORRIGE — sans lui, le cache Apollo de la session PRÉCÉDENTE
 * survivait à la connexion suivante, et l'interface affichait l'identité mise
 * en cache. Sur un poste partagé, un membre voyait les données du précédent.
 * L'admin faisait déjà ce nettoyage (AdminLayout), pas le portail.
 */
export const SESSION_CHANGED_EVENT = 'clubflow:member-session-changed';

function notifySessionChanged(): void {
  // `typeof window` : ce module est importé par des tests hors navigateur.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Écritures BRUTES, sans notification.
 *
 * Elles existent pour que les fonctions composées ci-dessous n'émettent qu'UN
 * SEUL événement, une fois la session ENTIÈREMENT écrite. Notifier depuis
 * `setToken` ferait partir l'événement alors que le jeton est posé mais pas
 * encore le club : l'abonné viderait le cache sur une session à moitié formée,
 * et la requête suivante partirait sans `x-club-id`.
 */
function writeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * `LoginPage` l'appelle SEUL dans le cas multi-profils, avant de connaître le
 * club — d'où la notification ici aussi : ne couvrir que `setMemberSession`
 * laisserait ce chemin-là avec le cache du compte précédent.
 */
export function setToken(token: string): void {
  writeToken(token);
  notifySessionChanged();
}

export function getClubId(): string | null {
  return localStorage.getItem(CLUB_ID_KEY);
}

export function setClubId(clubId: string): void {
  localStorage.setItem(CLUB_ID_KEY, clubId);
}

export function clearClubId(): void {
  localStorage.removeItem(CLUB_ID_KEY);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLUB_ID_KEY);
  localStorage.removeItem(CONTACT_ONLY_KEY);
  notifySessionChanged();
}

/** Session complète : token + club du profil actif. */
export function setMemberSession(token: string, clubId: string): void {
  // Écritures brutes puis UNE notification : voir `writeToken`.
  writeToken(token);
  localStorage.setItem(CLUB_ID_KEY, clubId);
  localStorage.removeItem(CONTACT_ONLY_KEY);
  notifySessionChanged();
}

/** Portail « contact » sans profil membre (inscription rapide). */
export function setMemberContactSession(token: string, clubId: string): void {
  // Écritures brutes puis UNE notification : voir `writeToken`.
  writeToken(token);
  localStorage.setItem(CLUB_ID_KEY, clubId);
  localStorage.setItem(CONTACT_ONLY_KEY, '1');
  notifySessionChanged();
}

export function isContactOnlySession(): boolean {
  return localStorage.getItem(CONTACT_ONLY_KEY) === '1';
}

export function hasMemberSession(): boolean {
  return Boolean(getToken() && getClubId());
}

/**
 * Vérifie que le token stocké n'est pas expiré (décodage local du claim
 * `exp`, marge de 30 s). Un token illisible est considéré invalide.
 *
 * Cf. bug QA C2 : un token expiré présent en localStorage redirigeait
 * /login vers un dashboard fantôme — reconnexion impossible sans vider
 * le localStorage à la main.
 */
export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  // `atob` seul levait sur les jetons base64url (« - » ou « _ » dans la charge
  // utile), et l'exception était lue comme « jeton invalide » : le membre se
  // retrouvait déconnecté alors que sa session était valide, de manière
  // intermittente puisque cela dépend des octets du jeton.
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload) return false;
  if (typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 > Date.now() + 30_000;
}
