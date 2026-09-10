/*
 * Service worker du portail membre : réception des notifications Web Push.
 *
 * Volontairement minimal — pas de cache applicatif, l'app reste servie par
 * le réseau. Le payload est celui produit par l'API (PushMessage) :
 * { title, body, url, tag }.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

function targetPath(data) {
  return typeof data.url === 'string' && data.url.startsWith('/')
    ? data.url
    : '/';
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const url = targetPath(data);
  const title = typeof data.title === 'string' && data.title ? data.title : 'ClubFlow';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : undefined;
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag,
    renotify: Boolean(tag) && data.renotify === true,
    data: { url },
  };

  event.waitUntil(
    (async () => {
      // Si le portail est au premier plan, déjà sur la page visée,
      // l'utilisateur voit le contenu arriver en direct : pas de doublon.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const target = new URL(url, self.location.origin);
      const alreadyVisible = clients.some((c) => {
        if (!c.focused) return false;
        const u = new URL(c.url);
        return u.pathname === target.pathname && u.search === target.search;
      });
      if (alreadyVisible) return;
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = clients.find((c) => 'focus' in c);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          try {
            await existing.navigate(target);
          } catch {
            /* certains navigateurs refusent navigate() sur un client non contrôlé */
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
