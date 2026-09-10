/**
 * Web Push côté navigateur : détection, abonnement, désabonnement.
 *
 * Le service worker (`public/sw.js`) reçoit les notifications ; ce module
 * ne fait que gérer l'abonnement `PushManager` et le convertir vers la
 * forme attendue par l'API (`RegisterPushSubscriptionInput`).
 */

export type PushSubscriptionPayload = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
};

/** Vrai quand le navigateur expose les trois briques nécessaires. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone / iPad (y compris iPadOS qui se présente comme un Mac tactile). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Portail ouvert depuis l'écran d'accueil (PWA installée). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const viaMedia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const viaSafari =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return viaMedia || viaSafari;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Crée l'abonnement auprès du service push du navigateur. À appeler après
 * `Notification.requestPermission()` accordée, depuis un geste utilisateur.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const reg =
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await registerServiceWorker());
  if (!reg) throw new Error('Service worker indisponible dans ce navigateur.');
  await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export function subscriptionToPayload(
  sub: PushSubscription,
): PushSubscriptionPayload {
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('Abonnement incomplet renvoyé par le navigateur.');
  }
  return {
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: navigator.userAgent.slice(0, 500),
  };
}

/** La clé VAPID publique est en base64url ; `subscribe()` veut des octets. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}
