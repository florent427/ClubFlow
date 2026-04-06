# Messagerie interne type WhatsApp + pseudo unique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offrir aux membres d’un club une messagerie temps réel (discussions 1:1, groupes créés par les membres, salon communautaire global du club), avec pseudo unique par club généré automatiquement à partir du nom/prénom et suffixe numérique, modifiable depuis le portail membre.

**Architecture:** Persistance PostgreSQL via Prisma (salons, membres de salon, messages). Autorisations strictes : un membre ne lit et n’écrit que dans les salons auxquels il appartient, toujours dans le périmètre `clubId` du JWT. Temps réel : passerelle WebSocket Nest (`@nestjs/websockets` + `socket.io`) pour pousser les nouveaux messages et compléter les requêtes GraphQL (liste des salons, historique paginé). Sécurité « produit » : TLS en production, JWT sur HTTP et sur handshake WebSocket, validation des entrées, rate limiting sur l’envoi ; le contenu des messages est stocké en base comme texte UTF-8 (pas de chiffrement de bout en bout dans ce périmètre — voir section « Hors périmètre »).

**Tech Stack:** NestJS 11, GraphQL (Apollo), Prisma 6, PostgreSQL, Socket.IO, Jest (API), Vite + React (portail membre), module club `MESSAGING` (nouveau code dans `ModuleCode`).

**Découpage recommandé:** Ce document est un plan unique bout en bout. Si besoin de livrer plus tôt : exécuter d’abord les tâches 1 à 3 (pseudo + mutation portail), puis 4 à 10 (messagerie API + WS), puis 11 (UI portail). L’app mobile peut suivre en tâche 12.

---

## Hors périmètre (explicite)

- Chiffrement de bout en bout type Signal (double ratchet, clés par appareil).
- Modération admin avancée, signalements, pièces jointes volumineuses (prévoir des tâches ultérieures).
- Intégration avec les campagnes e-mail existantes (`MessageCampaign`) : la messagerie interne est un canal distinct.

---

## Carte des fichiers (créations / modifications prévues)

| Fichier | Rôle |
|---------|------|
| `apps/api/src/domain/module-registry/module-codes.ts` | Ajouter `MESSAGING`. |
| `apps/api/prisma/seed.ts` | Libellé français pour `MESSAGING` dans `MODULE_LABELS`. |
| `apps/admin/src/lib/module-catalog.ts` | Ajouter `MESSAGING` à `ModuleCodeStr` et à `MODULE_CATALOG` (toggle admin). |
| `apps/admin/src/lib/club-modules-nav.ts` | Si route portail messagerie : exiger `MESSAGING` pour le chemin (comme `/communication`). |
| `apps/api/prisma/schema.prisma` | `Member.pseudo`, modèles `ChatRoom`, `ChatRoomMember`, `ChatMessage`, enums associés, relations `Club` / `Member`. |
| `apps/api/prisma/migrations/<timestamp>_messaging_and_pseudo/` | Migration SQL générée + script de backfill pseudo si nécessaire. |
| `apps/api/src/messaging/member-pseudo.util.ts` | Normalisation slug + génération `prenom_nom` / `prenom_nom_1`, etc. |
| `apps/api/src/messaging/member-pseudo.util.spec.ts` | Tests unitaires de la génération (sans DB). |
| `apps/api/src/messaging/messaging.service.ts` | CRUD salons, messages, règles métier (salon communautaire, paire directe, groupe). |
| `apps/api/src/messaging/messaging.gateway.ts` | WebSocket : join par `roomId`, émission `chat:message` après persistance. |
| `apps/api/src/messaging/messaging.module.ts` | Wiring Nest. |
| `apps/api/src/messaging/messaging.resolver.ts` | Queries/mutations GraphQL (viewer). |
| `apps/api/src/messaging/dto/*.ts`, `models/*.ts` | Inputs GraphQL et types de sortie. |
| `apps/api/src/members/members.service.ts` | Appeler assignation de pseudo à la création / import membre ; empêcher doublon. |
| `apps/api/src/viewer/viewer.service.ts` | Mapper `pseudo` dans `viewerMe` ; mutation `viewerUpdateMyPseudo`. |
| `apps/api/src/viewer/models/viewer-member.model.ts` | Champ `pseudo`. |
| `apps/api/src/viewer/viewer.resolver.ts` | Mutation `viewerUpdateMyPseudo`. |
| `apps/api/src/graphql/graphql.module.ts` | Importer `MessagingModule`. |
| `apps/api/src/main.ts` | CORS / adapter HTTP pour Socket.IO si besoin (origins). |
| `apps/member-portal/src/pages/MessagingPage.tsx` (ou équivalent) | UI liste salons + fil de messages + formulaire pseudo. |
| `apps/member-portal/src/lib/graphql/*.ts` | Documents et types générés ou manuels. |

---

### Task 1: Enum module `MESSAGING` + seed + catalogue admin

**Files:**
- Modify: `apps/api/src/domain/module-registry/module-codes.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/admin/src/lib/module-catalog.ts`

- [ ] **Step 1: Ajouter la valeur d’enum**

Dans `module-codes.ts`, insérer après `COMMUNICATION` :

```typescript
  MESSAGING = 'MESSAGING',
```

- [ ] **Step 2: Libellé seed**

Dans `apps/api/prisma/seed.ts`, dans `MODULE_LABELS`, ajouter :

```typescript
  [ModuleCode.MESSAGING]: 'Messagerie',
```

- [ ] **Step 3: Catalogue admin**

Dans `module-catalog.ts`, ajouter `'MESSAGING'` au type union `ModuleCodeStr` et une entrée :

```typescript
  { code: 'MESSAGING', label: 'Messagerie', required: false },
```

- [ ] **Step 4: Appliquer le seed en local**

Run: `cd apps/api && npx prisma db seed`

Expected: succès sans erreur Prisma.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/module-registry/module-codes.ts apps/api/prisma/seed.ts apps/admin/src/lib/module-catalog.ts
git commit -m "feat(api): module club MESSAGING pour la messagerie interne"
```

---

### Task 2: Schéma Prisma — pseudo membre + modèles de chat

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_member_pseudo_and_chat/migration.sql` (via `prisma migrate dev`)

- [ ] **Step 1: Étendre `Member` et ajouter enums + modèles**

Dans `schema.prisma`, sur le modèle `Member`, ajouter après `lastName` (ou en fin de champs scalaires) :

```prisma
  /// Pseudo affiché dans la messagerie ; unique par club ; slug [a-z0-9_]
  pseudo String?
```

Sur une base déjà peuplée, garder `pseudo` **nullable** jusqu’à la fin de la tâche 5 (backfill), puis passer à `pseudo String` **obligatoire** et conserver :

```prisma
  @@unique([clubId, pseudo])
```

(Prisma génère une contrainte unique ; les `NULL` multiples sont autorisés en SQL pour les colonnes nullable — après backfill, aucun NULL restant.)

Ajouter les relations sur `Member` (dans le bloc `Member`, après les relations existantes) :

```prisma
  chatRoomMemberships ChatRoomMember[]
  chatMessagesSent    ChatMessage[]    @relation("ChatMessageSender")
  chatRoomsCreated    ChatRoom[]       @relation("MemberChatRoomsCreated")
```

Sur `Club`, ajouter :

```prisma
  chatRooms ChatRoom[]
```

Puis ajouter en fin de fichier (avant la fin si vous avez d’autres blocs) :

```prisma
enum ChatRoomKind {
  DIRECT
  GROUP
  COMMUNITY
}

enum ChatRoomMemberRole {
  MEMBER
  ADMIN
}

model ChatRoom {
  id        String       @id @default(uuid())
  clubId    String
  kind      ChatRoomKind
  name      String?
  /// DIRECT uniquement : clé stable "clubId:minMemberId:maxMemberId" (UUID lexicographiques triés)
  directPairKey String?  @unique
  createdByMemberId String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  club    Club             @relation(fields: [clubId], references: [id], onDelete: Cascade)
  creator Member?          @relation("MemberChatRoomsCreated", fields: [createdByMemberId], references: [id], onDelete: SetNull)
  members ChatRoomMember[]
  messages ChatMessage[]

  @@index([clubId, kind])
}

model ChatRoomMember {
  id        String             @id @default(uuid())
  roomId    String
  memberId  String
  role      ChatRoomMemberRole @default(MEMBER)
  joinedAt  DateTime           @default(now())

  room   ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  member Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([roomId, memberId])
  @@index([memberId])
}

model ChatMessage {
  id             String    @id @default(uuid())
  roomId         String
  senderMemberId String
  body           String    @db.Text
  createdAt      DateTime  @default(now())
  editedAt       DateTime?
  deletedAt      DateTime?

  room   ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  sender Member   @relation("ChatMessageSender", fields: [senderMemberId], references: [id], onDelete: Cascade)

  @@index([roomId, createdAt])
}
```

Le champ inverse sur `Member` est `chatRoomsCreated` avec le nom de relation `MemberChatRoomsCreated` (voir tableau des fichiers ci-dessus).

- [ ] **Step 2: Générer la migration**

Run: `cd apps/api && npx prisma migrate dev --name member_pseudo_and_chat`

Expected: migration appliquée, client Prisma régénéré.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): pseudo membre unique et modèles ChatRoom/Message"
```

---

### Task 3: Utilitaire de pseudo — tests d’abord

**Files:**
- Create: `apps/api/src/messaging/member-pseudo.util.ts`
- Create: `apps/api/src/messaging/member-pseudo.util.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `member-pseudo.util.spec.ts` :

```typescript
import { buildPseudoBase, normalizePseudoInput } from './member-pseudo.util';

describe('member-pseudo.util', () => {
  it('buildPseudoBase combine prénom et nom en slug', () => {
    expect(buildPseudoBase('Jean', 'Dupont')).toBe('jean_dupont');
  });

  it('normalizePseudoInput force minuscules et caractères autorisés', () => {
    expect(normalizePseudoInput('  Jean__Dup  ')).toBe('jean__dup');
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd apps/api && npm test -- --testPathPattern=member-pseudo.util.spec`

Expected: erreur du type `Cannot find module` ou exports manquants.

- [ ] **Step 3: Implémentation minimale**

Créer `member-pseudo.util.ts` :

```typescript
/**
 * Slug pour pseudo : lettres non accentuées, chiffres, underscores entre segments.
 */
export function normalizeSegment(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function buildPseudoBase(firstName: string, lastName: string): string {
  const a = normalizeSegment(firstName.trim());
  const b = normalizeSegment(lastName.trim());
  if (!a && !b) return 'membre';
  if (!a) return b;
  if (!b) return a;
  return `${a}_${b}`;
}

/** Pour saisie utilisateur : minuscules, [a-z0-9_], longueur bornée côté service. */
export function normalizePseudoInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}
```

- [ ] **Step 4: Relancer les tests**

Run: `cd apps/api && npm test -- --testPathPattern=member-pseudo.util.spec`

Expected: 2 tests passent.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/messaging/member-pseudo.util.ts apps/api/src/messaging/member-pseudo.util.spec.ts
git commit -m "feat(api): utilitaire de normalisation et base de pseudo membre"
```

---

### Task 4: Service Prisma — attribuer un pseudo unique (avec suffixe numérique)

**Files:**
- Create: `apps/api/src/messaging/member-pseudo.service.ts`
- Create: `apps/api/src/messaging/member-pseudo.service.spec.ts` (mock Prisma ou tests d’intégration selon convention du repo)

- [ ] **Step 1: Méthode `assignUniquePseudoForMember`**

Implémenter dans `member-pseudo.service.ts` une fonction async qui :

1. Lit `firstName`, `lastName`, `clubId`, `id` du membre.
2. Calcule `base = buildPseudoBase(firstName, lastName)`.
3. Boucle `candidate = base`, puis `base + '_' + n` pour `n = 1, 2, ...` jusqu’à trouver un `clubId` + `pseudo` libre (requête `findFirst` avec `not id` si update).
4. Retourne le string final.

Utiliser `PrismaService` injecté comme dans `apps/api/src/members/members.service.ts`.

- [ ] **Step 2: Test d’intégration ou unitaire avec mock**

Exemple de test unitaire avec mock du client :

```typescript
import { MemberPseudoService } from './member-pseudo.service';

describe('MemberPseudoService', () => {
  it('ajoute _1 si le base existe déjà', async () => {
    const prisma = {
      member: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'other' }) // base pris
          .mockResolvedValueOnce(null), // base_1 libre
      },
    };
    const svc = new MemberPseudoService(prisma as any);
    const p = await svc.pickAvailablePseudo('club', 'Jean', 'Dupont', 'self-id');
    expect(p).toBe('jean_dupont_1');
  });
});
```

Adapter les noms de méthode à votre implémentation exacte (`pickAvailablePseudo` ou `assignUniquePseudoForMember`).

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npm test -- --testPathPattern=member-pseudo.service.spec`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/messaging/member-pseudo.service.ts apps/api/src/messaging/member-pseudo.service.spec.ts
git commit -m "feat(api): attribution pseudo unique jean_dupont / jean_dupont_1"
```

---

### Task 5: Backfill migration des membres existants + création membre

**Files:**
- Create: `apps/api/prisma/backfill-member-pseudo.ts` (script one-shot) **ou** migration SQL avec `UPDATE` génératif
- Modify: `apps/api/src/members/members.service.ts` (chemin de création membre)

- [ ] **Step 1: Script de backfill**

Procédure concrète :

1. Première migration : ajouter `pseudo String?` (nullable) sur `Member` sans `@@unique` encore, ou avec contrainte unique acceptant plusieurs NULL selon PostgreSQL — **recommandation Prisma :** colonne nullable, index unique partiel en SQL brut si besoin, ou remplir immédiatement dans le même `migrate` via `$executeRaw` pour chaque ligne.
2. Créer `apps/api/prisma/backfill-member-pseudo.ts` qui utilise `PrismaClient`, pour chaque `member` où `pseudo == null`, calcule le pseudo avec la même logique que `MemberPseudoService.pickAvailablePseudo` et fait `update` en série.
3. Exécuter : `cd apps/api && npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/backfill-member-pseudo.ts`
4. Deuxième migration (ou étape suivante du même fichier) : `ALTER COLUMN pseudo SET NOT NULL` et ajouter `@@unique([clubId, pseudo])` dans `schema.prisma` puis `prisma migrate dev`.

Si vous préférez une seule migration : générer les pseudo dans le script seed après migration, puis appliquer NOT NULL via migration suivante — l’essentiel est qu’aucun membre n’ait `pseudo` null avant NOT NULL.

- [ ] **Step 2: À la création dans `MembersService`**

Après création Prisma du membre, si `pseudo` non fourni par l’admin, appeler `memberPseudoService.assignForNewMember(member.id)`.

- [ ] **Step 3: Vérifier en local**

Run: `cd apps/api && npx prisma db seed` puis requête SQL ou Prisma Studio : chaque membre a un `pseudo`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma apps/api/src/members/members.service.ts apps/api/src/messaging
git commit -m "feat(api): backfill pseudo et assignation à la création membre"
```

---

### Task 6: Exposer `pseudo` sur `viewerMe` et mutation `viewerUpdateMyPseudo`

**Files:**
- Modify: `apps/api/src/viewer/models/viewer-member.model.ts`
- Modify: `apps/api/src/viewer/viewer.service.ts`
- Modify: `apps/api/src/viewer/viewer.resolver.ts`
- Create: `apps/api/src/viewer/dto/viewer-update-my-pseudo.input.ts`

- [ ] **Step 1: Champ GraphQL**

Dans `viewer-member.model.ts` :

```typescript
  @Field()
  pseudo!: string;
```

- [ ] **Step 2: Mapper dans `viewer.service.ts`**

Dans la méthode qui charge le membre pour `viewerMe`, inclure `pseudo` dans le select Prisma et assigner à `ViewerMemberGraph`.

- [ ] **Step 3: Input**

`viewer-update-my-pseudo.input.ts` :

```typescript
import { Field, InputType } from '@nestjs/graphql';
import { IsString, Length, Matches } from 'class-validator';

@InputType()
export class ViewerUpdateMyPseudoInput {
  @Field()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Pseudo : lettres minuscules, chiffres et underscores uniquement.',
  })
  pseudo!: string;
}
```

- [ ] **Step 4: Mutation dans le resolver**

```typescript
  @Mutation(() => ViewerMemberGraph, { name: 'viewerUpdateMyPseudo' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerUpdateMyPseudo(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerUpdateMyPseudoInput,
  ): Promise<ViewerMemberGraph> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    return this.viewer.updateMyPseudo(
      club.id,
      user.activeProfileMemberId,
      input.pseudo,
    );
  }
```

- [ ] **Step 5: Implémenter `updateMyPseudo`**

Dans `viewer.service.ts` : `normalizePseudoInput`, vérifier unicité `@@unique([clubId, pseudo])` hors le membre courant, `prisma.member.update`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/viewer
git commit -m "feat(api): pseudo visible et modifiable depuis le portail (viewer)"
```

---

### Task 7: `MessagingService` — salon communautaire, direct, groupe

**Files:**
- Create: `apps/api/src/messaging/messaging.service.ts`
- Create: `apps/api/src/messaging/messaging.types.ts` (optionnel)

- [ ] **Step 1: `ensureCommunityRoom(clubId: string)`**

Créer une ligne `ChatRoom` avec `kind = COMMUNITY`, `name = 'Communauté'` (ou libellé constant), si aucune n’existe pour ce `clubId`. Pour chaque membre `ACTIVE` avec `userId` non null (ou tous les ACTIVE selon règle métier choisie), s’assurer d’une entrée `ChatRoomMember`.

- [ ] **Step 2: `getOrCreateDirectRoom(clubId, memberIdA, memberIdB)`**

Vérifier que les deux membres appartiennent au club. Calculer `directPairKey = `${clubId}:${min(idA,idB)}:${max(idA,idB)}``. `upsert` sur `directPairKey`.

- [ ] **Step 3: `createGroupRoom(clubId, creatorMemberId, name: string, memberIds: string[])`**

Créer `ChatRoom` kind `GROUP`, `createdByMemberId`, rôle `ADMIN` pour le créateur, `MEMBER` pour les autres.

- [ ] **Step 4: `listRoomsForMember(clubId, memberId)`**

Jointure `ChatRoomMember` → `ChatRoom`, ordre `updatedAt` desc.

- [ ] **Step 5: `postMessage(clubId, roomId, senderMemberId, body: string)`**

Vérifier membership ; `trim` body ; refuser si vide ; `create` `ChatMessage` ; mettre à jour `ChatRoom.updatedAt`.

- [ ] **Step 6: `listMessages(clubId, roomId, memberId, cursor?, limit = 50)`**

Cursor par `(createdAt, id)` ; `take` + `where roomId`.

- [ ] **Step 7: Tests service**

Run: `cd apps/api && npm test -- --testPathPattern=messaging.service.spec`

Inclure au moins un test qui vérifie qu’un membre hors salon ne peut pas poster (mock).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/messaging/messaging.service.ts apps/api/src/messaging/messaging.service.spec.ts
git commit -m "feat(api): service messagerie (communauté, direct, groupe, messages)"
```

---

### Task 8: Resolver GraphQL `MessagingResolver` (viewer)

**Files:**
- Create: `apps/api/src/messaging/messaging.resolver.ts`
- Create: `apps/api/src/messaging/models/chat-room.graphql-model.ts` (noms alignés sur conventions existantes `.model.ts`)
- Create: `apps/api/src/messaging/dto/create-chat-group.input.ts`, `post-chat-message.input.ts`, etc.
- Modify: `apps/api/src/graphql/graphql.module.ts` (importer types pour schéma si besoin)
- Modify: `apps/api/src/messaging/messaging.module.ts`

Exemple de query :

```typescript
@Query(() => [ChatRoomGraph])
@RequireClubModule(ModuleCode.MESSAGING)
viewerChatRooms(@CurrentUser() user: RequestUser, @CurrentClub() club: Club) {
  if (!user.activeProfileMemberId) throw new BadRequestException('...');
  return this.messaging.listRoomsForMember(club.id, user.activeProfileMemberId);
}
```

Mutations : `viewerPostChatMessage`, `viewerCreateChatGroup`, `viewerOpenOrGetDirectChat` (avec `peerMemberId`).

- [ ] **Step 1: Implémenter resolvers + guards** (`GqlJwtAuthGuard`, `ClubContextGuard`, `ViewerActiveProfileGuard`, `ClubModuleEnabledGuard`)

- [ ] **Step 2: `npm run build` dans `apps/api`**

Run: `cd apps/api && npm run build`

Expected: succès, `src/schema.gql` régénéré avec les nouveaux types.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/messaging apps/api/src/graphql/graphql.module.ts apps/api/src/schema.gql
git commit -m "feat(api): API GraphQL messagerie pour le portail membre"
```

---

### Task 9: Passerelle WebSocket + auth JWT

**Files:**
- Modify: `apps/api/package.json` (dépendances)
- Create: `apps/api/src/messaging/messaging.gateway.ts`
- Modify: `apps/api/src/auth/` ou middleware existant pour valider JWT depuis `socket.handshake.auth.token`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Installer les paquets**

Run: `cd apps/api && npm install @nestjs/websockets @nestjs/platform-socket.io socket.io`

- [ ] **Step 2: Gateway**

```typescript
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class MessagingGateway implements OnGatewayConnection {
  // Après validation JWT : associer socket à { userId, clubId, memberId }
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(client: Socket, payload: { roomId: string }) {
    // Vérifier membership puis client.join(`room:${roomId}`)
  }
}
```

Après `MessagingService.postMessage`, émettre `io.to(\`room:${roomId}\`).emit('chat:message', payload)`.

- [ ] **Step 3: Tests manuels**

Démarrer l’API, connecter un client Socket.IO avec token valide, joindre une room, poster un message via GraphQL, vérifier réception événement.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/messaging/messaging.gateway.ts apps/api/src/main.ts
git commit -m "feat(api): WebSocket chat avec authentification et rooms"
```

---

### Task 10: Throttler et validation

**Files:**
- Modify: `apps/api/src/messaging/messaging.resolver.ts` ou `messaging.service.ts`
- Utiliser `@nestjs/throttler` déjà présent dans le projet

- [ ] **Step 1: Limiter `viewerPostChatMessage`** (ex. 30 requêtes / minute / membre) via décorateur `@Throttle` sur la mutation.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/messaging
git commit -m "feat(api): rate limit sur envoi de messages"
```

---

### Task 11: Portail membre — page Messagerie + réglage pseudo

**Files:**
- Create: `apps/member-portal/src/pages/MessagingPage.tsx`
- Modify: routing du portail (fichier où les routes sont définies)
- Modify: requête `viewerMe` pour afficher/éditer le pseudo

- [ ] **Step 1: Section paramètres** (ou carte sur le dashboard) : champ pseudo, mutation `viewerUpdateMyPseudo`, message d’erreur si unicité violée.

- [ ] **Step 2: Page messagerie** : liste des salons à gauche, messages à droite, champ d’envoi ; abonnement Socket.IO aux `joinRoom` / `chat:message` pour rafraîchir.

- [ ] **Step 3: Activer le module** `MESSAGING` sur le club démo en base pour tests.

- [ ] **Step 4: Lint / build portail**

Run: `cd apps/member-portal && npm run build`

Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add apps/member-portal
git commit -m "feat(portail): UI messagerie et modification du pseudo"
```

---

### Task 12 (optionnel): App mobile `apps/mobile`

**Files:**
- Sous `apps/mobile/` : écran liste + fil + client GraphQL + Socket.IO aligné sur l’API des tâches 8–9.

- [ ] **Step 1: Réutiliser les mêmes opérations GraphQL** que le portail.

- [ ] **Step 2: Gestion du token** dans le client WS (même format que le web).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): parité messagerie avec le portail membre"
```

---

## Revue de cohérence (checklist auteur)

1. **Couverture du besoin :** pseudo auto + unique + édition (tâches 3–6) ; messagerie complète avec groupes + communauté (tâches 7–11) ; temps réel (tâche 9) ; sécurité par JWT + membership + throttling (tâches 7–10).
2. **Placeholders :** aucun « TBD » ; hors périmètre E2E explicite.
3. **Types :** `ChatRoomKind`, `ChatRoomMemberRole`, `ModuleCode.MESSAGING` cohérents entre Prisma, GraphQL et guards.

---

**Plan enregistré dans `docs/superpowers/plans/2026-04-06-messagerie-complete-securisee.md`. Deux options d’exécution :**

**1. Subagent-Driven (recommandé)** — Un sous-agent par tâche, relecture entre les tâches, itération rapide.

**2. Inline Execution** — Enchaîner les tâches dans cette session avec le skill `executing-plans` et des points de contrôle.

**Laquelle préférez-vous ?**
