# Envoi d’e-mails (domaine club + DNS) — Implementation Plan

> **Pour exécution agentique :** skill recommandé : `@superpowers:subagent-driven-development` ou `@superpowers:executing-plans`. Étapes en `- [ ]`.

**Objectif :** Brancher un **ESP managé** (un seul au MVP) pour que chaque club envoie depuis un **domaine vérifié** (SPF/DKIM côté ESP) ; **transactionnel** + **campagnes** ; **aucun envoi** si domaine non vérifié ; webhooks bounce/plainte → suppression campagnes.

**Architecture :** Couche `MailTransport` dans `apps/api` + adaptateur concret (variable d’environnement). Persistance `ClubSendingDomain` (+ optionnel `EmailSuppression`). `CommsService.sendCampaign` vérifie le domaine **CAMPAIGN** ou **BOTH**, envoie via transport, garde journal minimal. Route webhook signée pour l’ESP. Admin : page paramètres domaine + mutations GraphQL.

**Tech stack :** NestJS, Prisma, GraphQL, ESP HTTP (REST), `apps/admin` Apollo.

**Spec source :** `docs/superpowers/specs/2026-04-01-envoi-mails-domaine-club-design.md`

**Fichiers existants clés :**

| Fichier | Rôle |
|---------|------|
| `apps/api/src/comms/comms.service.ts` | `sendCampaign` (stub log aujourd’hui) |
| `apps/api/src/comms/comms.resolver.ts` | Mutations campagnes |
| `apps/api/prisma/schema.prisma` | `MessageCampaign`, `Club` |
| `apps/api/src/common/guards/club-admin-role.guard.ts` | Garde back-office |

**Choix MVP — Tâche 1 :** Trancher **un** ESP : **Resend** (API domaines + envoi, doc DNS) *ou* **Postmark** (transactionnel très mature). Le code expose `MailTransport` pour un futur second fournisseur.

---

### Tâche 1 : Choix ESP + variables d’environnement

**Fichiers :**
- Créer ou modifier : `apps/api/.env.example`
- Si présent : compléter `README` racine API

- [ ] **Étape 1 :** Choisir Resend ou Postmark ; documenter `MAIL_PROVIDER`, clé API, secret webhook, URL publique du webhook.

- [ ] **Étape 2 :** Commit `chore(api): env exemple provider mail`

---

### Tâche 2 : Prisma — domaines d’envoi + suppressions

**Fichiers :**
- Modifier : `apps/api/prisma/schema.prisma`
- Créer : migration sous `apps/api/prisma/migrations/`

Modèles suggérés :

- Enum `ClubSendingDomainPurpose` : `TRANSACTIONAL`, `CAMPAIGN`, `BOTH`
- Enum `ClubSendingDomainVerificationStatus` : `PENDING`, `VERIFIED`, `FAILED`
- `ClubSendingDomain` : `id`, `clubId`, `fqdn`, `purpose`, `status`, `providerDomainId` (nullable), `dnsRecordsJson` (nullable), `lastCheckedAt`, timestamps, `@@unique([clubId, fqdn])`
- `EmailSuppression` : `id`, `clubId`, `emailNormalized`, `reason`, `createdAt`, `@@unique([clubId, emailNormalized])`

- [ ] **Étape 1 :** Migration + `prisma generate` ; `npm run build` dans `apps/api`.

- [ ] **Étape 2 :** Commit `feat(api): prisma club sending domain + email suppression`

---

### Tâche 3 : `MailTransport` + implémentation provider

**Fichiers :**
- Créer : `apps/api/src/mail/mail-transport.interface.ts`
- Créer : `apps/api/src/mail/providers/resend-mail.transport.ts` (ou postmark)
- Créer : `apps/api/src/mail/mail.module.ts`
- Test : `apps/api/src/mail/providers/*.spec.ts` avec mocks HTTP

Interface indicative : `registerDomain`, récupération enregistrements DNS, `verifyDomain` / statut, `sendEmail({ to, from, replyTo?, subject, html, text?, tags })`.

- [ ] **Étape 1 :** `npm run test -- --testPathPatterns=mail`

- [ ] **Étape 2 :** Commit `feat(api): mail transport + provider`

---

### Tâche 4 : Service domaine club + GraphQL

**Fichiers :**
- Créer : `apps/api/src/mail/club-sending-domain.service.ts`
- Créer : models GraphQL + inputs + resolver (guards : `GqlJwtAuthGuard`, `ClubContextGuard`, `ClubAdminRoleGuard`)
- Queries : liste domaines du club ; Mutations : créer domaine (appel ESP + persist), `refreshVerification`

Règle **recommandée** : au plus **un** domaine `VERIFIED` par `purpose` par club, sauf `BOTH` qui couvre transactionnel + campagne.

- [ ] **Étape 1 :** Tests service (mock Prisma + transport).

- [ ] **Étape 2 :** Commit `feat(api): graphql domaines envoi club`

---

### Tâche 5 : Webhook bounce / plainte

**Fichiers :**
- Créer : `apps/api/src/mail/mail-webhook.controller.ts` — `POST /webhooks/mail/...`, vérif signature, `EmailSuppression` upsert
- Enregistrer dans `AppModule` ou `MailModule`

- [ ] **Étape 1 :** Test avec payload exemple (unit ou e2e léger).

- [ ] **Étape 2 :** Commit `feat(api): webhook mail + suppressions`

---

### Tâche 6 : `CommsService.sendCampaign`

**Fichiers :**
- Modifier : `apps/api/src/comms/comms.service.ts`
- Modifier : `apps/api/src/comms/comms.module.ts` — importer `MailModule`

- Au début : si aucun domaine `CAMPAIGN` ou `BOTH` en `VERIFIED` → `BadRequestException` message aligné spec (« terminez la configuration DNS »).
- Remplacer stub `comms.push_stub` par envois réels ; **sauter** destinataires sans e-mail ou présents dans `EmailSuppression` (campagnes).
- Politique **SENT** : ne marquer la campagne `SENT` qu’après stratégie validée (ex. tous les envois tentés sans erreur fatale globale — à documenter dans le code).

- [ ] **Étape 1 :** Test unitaire `sendCampaign` sans domaine → exception.

- [ ] **Étape 2 :** Commit `feat(api): envoi campagnes via mail transport`

---

### Tâche 7 : Transactionnel minimal

**Fichiers :**
- Créer : `apps/api/src/mail/transactional-mail.service.ts` (ou équivalent)
- Mutation admin **test** : envoi à une adresse saisie, domaine `TRANSACTIONAL` ou `BOTH` `VERIFIED` requis

- [ ] **Étape 1 :** Commit `feat(api): envoi transactionnel test`

---

### Tâche 8 : Admin UI

**Fichiers :**
- Créer : `apps/admin/src/pages/settings/MailDomainSettingsPage.tsx`
- Modifier : `apps/admin/src/App.tsx`, `AdminLayout` (lien Paramètres)
- `apps/admin/src/lib/documents.ts` : GraphQL domaines

- [ ] **Étape 1 :** `npm run build` admin.

- [ ] **Étape 2 :** Commit `feat(admin): paramètres domaine envoi mail`

---

### Tâche 9 : Vérification globale

- [ ] **Étape 1 :** `cd apps/api && npm run test && npm run test:e2e`
- [ ] **Étape 2 :** Test manuel sandbox ESP + domaine de test

---

## Notes spec

- Aucun envoi sans `VERIFIED` ; pas de repli domaine ClubFlow ; pas de file auto au statut verified.
- Tags / métadonnées distincts **campaign** vs **transactional** sur chaque envoi.

---

**Plan enregistré ici.** Exécution possible en mode subagent ou inline (`executing-plans`).
