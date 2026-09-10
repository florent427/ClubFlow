/**
 * Invitation « ne rien manquer » : quel écran proposer à l'adhérent connecté,
 * et quand se taire. Logique pure, sans DOM, pour être testable.
 *
 * Deux gestes sont encouragés, dans cet ordre :
 *  1. ajouter le portail à l'écran d'accueil (téléphones et tablettes) —
 *     indispensable sur iPhone et iPad pour recevoir des notifications.
 *     « Plus tard » met cette suggestion en pause quelques jours ;
 *  2. autoriser les notifications, tant que l'adhérent n'a pas tranché
 *     (autorisation « default »). Cette question revient à chaque ouverture
 *     jusqu'à la décision : l'application installée doit obtenir sa propre
 *     autorisation système, même après un accord dans le navigateur, et une
 *     information manquée coûte plus cher qu'une question répétée.
 *     Accord ou refus : on n'y revient pas.
 */

export type EngagementEnvironment = {
  /** Navigateur capable de Web Push (service worker, PushManager, Notification). */
  pushSupported: boolean;
  /** `Notification.permission`, ou 'unsupported' quand l'API n'existe pas. */
  permission: NotificationPermission | 'unsupported';
  /** L'API publie une clé VAPID : null tant qu'on ne sait pas encore. */
  serverReady: boolean | null;
  /** Portail ouvert depuis l'écran d'accueil (application installée). */
  standalone: boolean;
  ios: boolean;
  android: boolean;
  /** Chrome a annoncé l'installabilité : un bouton peut installer. */
  canPromptInstall: boolean;
};

export type EngagementStep = 'install-android' | 'install-ios' | 'notifications';

export const INSTALL_PAUSE_STORAGE_KEY =
  'clubflow_member_install_invite_paused_until';
export const INSTALL_PAUSE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function decideEngagementStep(
  env: EngagementEnvironment,
  installPausedUntil: number | null,
  now: number,
): EngagementStep | null {
  const installPaused = installPausedUntil !== null && now < installPausedUntil;
  if (!env.standalone && !installPaused) {
    // Sur iPhone et iPad, Safari n'expose Web Push qu'au portail installé :
    // l'installation passe avant, même quand rien d'autre n'est possible.
    if (env.ios) return 'install-ios';
    if (env.android && env.canPromptInstall) return 'install-android';
  }
  return wantsNotifications(env) ? 'notifications' : null;
}

/**
 * Vrai quand demander l'autorisation a un sens : le navigateur sait faire,
 * l'adhérent n'a encore rien décidé et l'API est en mesure d'envoyer.
 */
export function wantsNotifications(env: EngagementEnvironment): boolean {
  return (
    env.pushSupported && env.permission === 'default' && env.serverReady === true
  );
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readInstallPausedUntil(storage: StorageLike | null): number | null {
  try {
    const raw = storage?.getItem(INSTALL_PAUSE_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Met la suggestion d'installation en pause et renvoie l'échéance (ms epoch). */
export function pauseInstallInvite(
  storage: StorageLike | null,
  now: number,
  durationMs: number = INSTALL_PAUSE_DURATION_MS,
): number {
  const until = now + durationMs;
  try {
    storage?.setItem(INSTALL_PAUSE_STORAGE_KEY, String(until));
  } catch {
    // Stockage indisponible (navigation privée stricte) : la suggestion
    // reviendra simplement à la prochaine visite.
  }
  return until;
}
