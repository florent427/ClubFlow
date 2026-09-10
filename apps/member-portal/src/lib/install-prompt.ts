/**
 * Installation du portail sur l'écran d'accueil (PWA).
 *
 * Chrome (Android, desktop) annonce qu'un site est installable par
 * l'événement `beforeinstallprompt`, émis tôt et une seule fois par page :
 * s'il part avant que React ne soit monté, personne ne l'entend. Ce module
 * l'écoute dès le chargement (`watchInstallability()` dans main.tsx) et
 * garde l'événement de côté ; un bouton de l'interface peut ensuite ouvrir
 * la boîte d'installation native avec `promptInstall()`.
 *
 * Safari (iPhone, iPad) n'a pas d'équivalent : l'ajout à l'écran d'accueil
 * passe par le menu Partager, l'interface ne peut qu'expliquer le geste.
 */

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

const INSTALLED_STORAGE_KEY = 'clubflow_member_app_installed';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let version = 0;
let watching = false;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

/**
 * Un navigateur ne dit pas si l'application qu'il a installée l'est
 * toujours ; on garde le souvenir d'une installation réussie depuis ce
 * navigateur pour ne plus suggérer le geste manuel.
 */
function rememberInstalled(): void {
  try {
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
  } catch {
    // Stockage indisponible : on redira le geste, ce n'est pas grave.
  }
}

export function wasInstalledFromHere(): boolean {
  try {
    return window.localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** À appeler une fois au chargement, avant le montage de React. */
export function watchInstallability(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sans preventDefault, Chrome affiche sa propre mini-barre d'installation
    // au moment où il le décide, hors de tout contexte.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    rememberInstalled();
    notify();
  });
  if (typeof window.matchMedia === 'function') {
    const standalone = window.matchMedia('(display-mode: standalone)');
    if (typeof standalone.addEventListener === 'function') {
      standalone.addEventListener('change', notify);
    }
  }
}

/** Pour `useSyncExternalStore` : la version change à chaque événement. */
export function subscribeInstallability(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallabilityVersion(): number {
  return version;
}

/** Vrai quand Chrome a annoncé l'installabilité et attend un clic. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Ouvre la boîte d'installation native. À appeler depuis un geste
 * utilisateur, sinon Chrome l'ignore.
 */
export async function promptInstall(): Promise<InstallPromptOutcome> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  // L'événement ne sert qu'une fois : quelle que soit la réponse, Chrome en
  // émettra un nouveau si le site reste installable (après refus, pas avant
  // plusieurs semaines sur Android — c'est lui qui espace les relances).
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') rememberInstalled();
    notify();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

/** Téléphone ou tablette Android (Chrome, Samsung Internet, Firefox…). */
export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}
