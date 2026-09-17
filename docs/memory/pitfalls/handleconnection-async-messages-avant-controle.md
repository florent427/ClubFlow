# Piège — `handleConnection` asynchrone : les messages arrivent avant la fin du contrôle

## Symptôme

Aucune erreur. Après avoir rendu `handleConnection` asynchrone (un contrôle en
base à la connexion), le client se connecte mais ne reçoit plus rien : son
`joinRoom`, émis dans le handler `connect`, a été traité avant que
`client.data` soit rempli, puis ignoré en silence.

## Contexte

Passerelle Socket.IO `MessagingGateway` (namespace `/chat`), 2026-09-17, audit
1.5 : la connexion devait vérifier le statut du membre, son profil et le module
Messagerie, donc lire la base. Le portail (`MessagingPage.tsx`), l'appli et
`packages/mobile-shared` émettent tous `joinRoom` dès `connect`.

## Cause root

Dans `@nestjs/websockets` (`web-sockets-controller.js`, `getConnectionHandler`),
la connexion appelle `instance.handleConnection(...)` par un `subscribe` qui
ignore la promesse rendue, puis branche aussitôt les écouteurs de messages
(`subscribeMessages`). Rien n'attend la fin d'un `handleConnection` asynchrone.

## Solution

Ranger la promesse du contrôle dans `client.data`, et la faire attendre par
chaque handler de message :

```ts
handleConnection(client: Socket): void {
  (client.data as ChatSocketState).ready = this.admit(client); // Promise<ctx | null>
}

@SubscribeMessage('joinRoom')
async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() p: { roomId: string }) {
  const ctx = await (client.data as ChatSocketState).ready;
  if (!ctx) return;
  // …
}
```

Le test qui le garde appelle `handleConnection` puis `joinRoom` **sans attendre
entre les deux**, et exige que le salon soit rejoint
(`messaging.gateway.spec.ts`).

## Pourquoi NE PAS faire

- ❌ Lire `client.data.member` dans le handler : vide tant que le contrôle tourne.
- ❌ Contrôler seulement dans `joinRoom` : une connexion déjà ouverte garde ses
  salons ; il faut aussi recontrôler les sockets ouvertes (ici toutes les 60 s).

## Lié

- [pitfalls/une-supposition-survit-a-la-decision.md](une-supposition-survit-a-la-decision.md) — poser la règle au goulot
- [roadmap/2026-09-14-audit-anciens-plans.md](../../superpowers/roadmap/2026-09-14-audit-anciens-plans.md) — point 1.5
