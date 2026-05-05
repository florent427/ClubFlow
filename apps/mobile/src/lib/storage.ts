import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'clubflow_member_token';
const CLUB_ID_KEY = 'clubflow_member_club_id';
const CONTACT_ONLY_KEY = 'clubflow_member_contact_only';
/**
 * Club sélectionné au 1er lancement de l'app (avant tout login).
 * Permet d'envoyer `x-club-id` côté Apollo + de pré-router toutes les
 * queries publiques (clubBranding, clubBySlug…) vers le bon tenant.
 * Stocké en JSON pour pouvoir afficher logo+nom dans le hero du Login.
 */
const SELECTED_CLUB_KEY = 'clubflow_selected_club';

export type SelectedClub = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export async function getToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(TOKEN_KEY);
  if (raw == null) return null;
  const t = raw.trim();
  return t.length === 0 ? null : t;
}

export async function setToken(token: string): Promise<void> {
  const t = token.trim();
  if (t.length === 0) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, t);
}

export async function getClubId(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(CLUB_ID_KEY);
  if (raw == null) return null;
  const id = raw.trim();
  return id.length === 0 ? null : id;
}

export async function setClubId(clubId: string): Promise<void> {
  const id = clubId.trim();
  if (id.length === 0) {
    await AsyncStorage.removeItem(CLUB_ID_KEY);
    return;
  }
  await AsyncStorage.setItem(CLUB_ID_KEY, id);
}

export async function clearClubId(): Promise<void> {
  await AsyncStorage.removeItem(CLUB_ID_KEY);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(CLUB_ID_KEY);
  await AsyncStorage.removeItem(CONTACT_ONLY_KEY);
}

export async function setMemberSession(
  token: string,
  clubId: string,
): Promise<void> {
  await setToken(token);
  await setClubId(clubId);
  await AsyncStorage.removeItem(CONTACT_ONLY_KEY);
}

export async function setMemberContactSession(
  token: string,
  clubId: string,
): Promise<void> {
  await setToken(token);
  await setClubId(clubId);
  await AsyncStorage.setItem(CONTACT_ONLY_KEY, '1');
}

export async function isContactOnlySession(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONTACT_ONLY_KEY)) === '1';
}

export async function hasMemberSession(): Promise<boolean> {
  const token = await getToken();
  const clubId = await getClubId();
  return Boolean(token && clubId);
}

/**
 * Récupère le club sélectionné par l'utilisateur au 1er lancement (ou
 * via "Changer de club" dans Settings). Null = pas encore choisi → on
 * affiche SelectClubScreen. Le `id` est utilisé comme `x-club-id`
 * header pour toutes les queries publiques (clubBranding…).
 */
export async function getSelectedClub(): Promise<SelectedClub | null> {
  const raw = await AsyncStorage.getItem(SELECTED_CLUB_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SelectedClub;
    if (!parsed.id || !parsed.slug || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setSelectedClub(club: SelectedClub): Promise<void> {
  await AsyncStorage.setItem(SELECTED_CLUB_KEY, JSON.stringify(club));
}

/** Reset le choix de club. Utilisé par "Changer de club" dans Settings. */
export async function clearSelectedClub(): Promise<void> {
  await AsyncStorage.removeItem(SELECTED_CLUB_KEY);
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(CLUB_ID_KEY);
  await AsyncStorage.removeItem(CONTACT_ONLY_KEY);
}
