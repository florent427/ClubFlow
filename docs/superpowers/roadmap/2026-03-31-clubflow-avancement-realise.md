# ClubFlow — Avancement réalisé

> **Dernière mise à jour :** 2026-03-31 (roadmap : inscription **contact** + vérif e-mail + OAuth **Google** (MVP portail) ; synchro tests API)  
> **Vérification API :** `apps/api` — `npm run test` : **93** / 93 (23 suites) ; `npm run test:e2e` : **14** / 14 (rejoués ce jour).  
> **Source de vérité fonctionnelle :** `ClubFlow_Conception_Provisoire.md` (v0.2)  
> **Feuille de route technique :** `docs/superpowers/plans/2026-03-30-plan-general-application-clubflow.md` (phases A–L)  
> **Complément :** ne pas supprimer les specs/plans dans `docs/superpowers/specs/` et `plans/` ; ce fichier résume l’état, ils détaillent les décisions.

Ce document est mis à jour **sur demande** lors des revues d’avancement. Chaque entrée « réalisé » devrait idéalement pointer vers du code ou un livrable vérifiable.

---

## I. Méthodologie (conception §7.2)

| Phase | Étape | Réalisé (constat) |
| :---: | --- | --- |
| **1** | Validation du périmètre | Document de conception v0.2 rédigé et présent dans le dépôt ; pas de trace formelle de validation multi-parties dans le repo. |
| **2** | Spécifications fonctionnelles | Specs partielles et ciblées : voir `docs/superpowers/specs/` (adhésion, champs membre, annuaire, familles, groupes dynamiques adhésion, **inscription contact / OAuth** `2026-03-31-inscription-contact-oauth-design.md`, etc.). |
| **3** | Architecture technique | Stack actée dans le monorepo : NestJS, GraphQL code-first, Prisma, PostgreSQL, JWT ; alignement large avec conception §6. |
| **4** | Maquettage UI/UX | Référence design externe (Stitch / plan socle) ; pas de livrable maquette versionné dans ce dépôt. |
| **5** | Développement du socle | **Oui :** API multi-club, registre des modules, auth JWT de base, dashboard admin avec agrégations branchées sur les données réelles (voir phase A ci-dessous). |
| **6** | Itérations successives modules | **En cours :** modules métier B–E partiellement livrés côté API + admin (détail section II). |

---

## II. Implémentation (plan général — phases A à L)

### Phase A — Gouvernance monorepo et socle

- Monorepo avec `apps/api` (NestJS) et `apps/admin` (Vite/React).
- PostgreSQL via `docker-compose.yml` ; schéma Prisma et migrations sous `apps/api/prisma/`.
- Registre des codes modules et graphe de dépendances : `apps/api/src/domain/module-registry/*`.
- Auth : `apps/api/src/auth/*` (login GraphQL, JWT, `viewerProfiles` / `switchProfile` — voir phase C).
- Contexte club et guards : `apps/api/src/common/guards/`, décorateurs.
- Dashboard : `apps/api/src/dashboard/*` (compteurs membres actifs, modules actifs, séances à venir, impayés, CA du mois — branchés sur Prisma).
- Plan socle : `docs/superpowers/plans/2026-03-30-socle-backend-general-clubflow.md`.
- **CLUB_ID (MVP portail contact)** : variable d’environnement club unique pour les parcours hors contexte admin — `apps/api/src/config/club-env.ts`, `club-id-bootstrap.service.ts`, assert au boot dans `app.module.ts` (aligné plan `docs/superpowers/plans/2026-03-31-inscription-contact-oauth-implementation.md`).

### Phase B — Membres (référentiel + groupes dynamiques)

- Domaine membre : `apps/api/src/members/` (CRUD, grades, rôles club, champs personnalisés configurables).
- Groupes dynamiques : résolveurs / pages admin (ex. `MembersDynamicGroupsPage.tsx`, règles métier côté API).
- Specs / plans associés : `docs/superpowers/specs/2026-03-30-parametres-fiche-membre-champs-configurables-design.md`, `2026-03-30-admin-adhesion-dynamic-groups-design.md`, plans d’implémentation correspondants.

### Phase C — Familles, payeur, sélection de profil (MVP API)

- Domaine : `apps/api/src/families/*` (familles, rattachements, règle « un payeur » — tests dédiés).
- JWT : charge utile avec profil actif ; `viewerProfiles` et bascule de profil côté `auth.service.ts` / resolvers.
- Admin : flux familles (ex. `FamiliesPage.tsx`, `NewFamilyPage.tsx`, `FamilyDetailDrawer.tsx`).
- Specs : `docs/superpowers/specs/2026-03-30-familles-membres-rattachement-recherche-design.md`, etc.

### Phase D — Planning et cours

- Domaine : `apps/api/src/planning/*` — lieux (`Venue`), créneaux (`CourseSlot`), liaison groupe dynamique optionnelle.
- Détection de conflit d’horaire pour un même professeur (`assertNoCoachOverlap`).
- Compteur « séances à venir » du dashboard alimenté par les créneaux.

### Phase E — Paiement (MVP)

- Domaine : `apps/api/src/payments/*`, facturation liée au module adhésion.
- Stripe : webhook avec vérification de signature et idempotence (`stripe-webhook.controller.ts`, tests unitaires associés) ; le montant attendu est le **solde restant** si des encaissements manuels partiels existent déjà.
- Encaissements **manuel** (espèces, chèque, virement) : **paiements partiels** jusqu’au solde, `externalRef` optionnel ; factures exposent `totalPaidCents` et `balanceCents` ; saisie côté admin dans la fiche membre (`MemberAdhesionPanels`) pour les factures **OPEN** de la **famille** du membre.
- Module adhésion / cotisations : `apps/api/src/membership/*`, paramètres admin (saisons, produits, tarifs) ; specs `docs/superpowers/specs/2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md`, `2026-03-30-formules-cotisation-frais-uniques-design.md`.

### Phases F à L — Périmètre réel dans le dépôt (nuancé)

- **F** Communication : **MVP API** — `apps/api/src/comms/` (campagnes, résolution d’audience à l’envoi via **groupes dynamiques**, e2e création / envoi) ; agrégateur de notifications en tests (`notification-aggregator.spec.ts`). **E-mail transactionnel (SMTP)** : module `apps/api/src/mail/*` (transport Nodemailer, domaines d’envoi par club, `buildSmtpMailFrom` / normalisation expéditeur, enregistrements DNS suggérés type SPF/DMARC, contrôle SPF optionnel `spf-dns-check`, tests unitaires sous `mail/`) ; admin **Domaine d’envoi** : `apps/admin/src/pages/settings/MailDomainSettingsPage.tsx` (routes paramètres). **Infra / doc production** : profil Docker `relay` dans `docker-compose.yml` (image Postfix), runbook `docs/runbooks/smtp-relay-production.md`, spec `docs/superpowers/specs/2026-03-31-envoi-mail-prod-postfix-design.md`, plan `docs/superpowers/plans/2026-03-31-envoi-mail-prod-postfix-implementation.md`. **Pas** encore : WhatsApp, SMS, FCM, ni durcissement e-mail prod complet (ex. DKIM opérationnel côté relais pour tous les déploiements).
- **G** Comptabilité / finance : **MVP** — `apps/api/src/accounting/` (écritures de revenu liées aux paiements si module `ACCOUNTING` actif pour le club) ; **stubs métier** subventions / sponsoring — `apps/api/src/external-finance/*` (mutations / modèles utilisés en e2e). **Pas** la compta associative complète §4.6 ni dossiers PDF §4.7–4.8.
- **H** Site public, blog, boutique : pas d’application `apps/web-public` (ni équivalent).
- **I** Espace membre (**MVP web**) : application `apps/member-portal` (Vite/React) — login, sélection de profil, layout type Stitch, `viewerMe`, `viewerUpcomingCourseSlots`, `viewerFamilyBillingSummary`, garde `ViewerActiveProfileGuard` côté API (`apps/api/src/viewer/`). **Inscription contact (e-mail + mot de passe)** : mutations GraphQL `registerContact`, `verifyEmail`, `resendVerificationEmail` ; login bloqué sans `emailVerifiedAt` (`apps/api/src/auth/*`, `TransactionalMailService.sendEmailVerificationLink`). **Portail** : `RegisterPage`, `VerifyEmailPage`, `OAuthCallbackPage`, cohabitation session membre / contact (`MemberOrContactShell`, etc.). **Accès effectif au portail vérifié** (parcours connexion + tableau de bord, 2026-03-31). Doc locale : `apps/member-portal/README.md` ; lien compte ↔ fiche membre (`viewerProfiles`) : seed `apps/api/prisma/seed.ts` + `Member.userId`. Modèle Prisma : `Contact`, `UserIdentity`, `EmailVerificationToken`, champs `User.emailVerifiedAt` / `passwordHash` nullable — migration `20260331120000_contact_auth_oauth` (ou équivalent dans `apps/api/prisma/migrations/`). **Pas** encore `apps/mobile` ni application « native ».
- **J** IA (LLM) intégrée produit : non.
- **K** Vie du club, événements, réservation : pas de domaines dédiés type `club-life/`, `events/`, `booking/` (hors **planning** §4.3 déjà couvert en phase D).
- **L** OAuth2 / OIDC (connexion sociale) : **MVP Google** — `GoogleOAuthService`, `GoogleOAuthController` (`/auth/google`, `/auth/google/callback`), `upsertUserFromGoogleOAuth` dans `auth.service.ts` ; redirection vers `MEMBER_PORTAL_ORIGIN` avec fragment `#access_token=…`. Throttle sur auth GraphQL et contrôleur Google (`ThrottlerModule`, `GqlThrottlerGuard`). **Pas** encore Facebook / LinkedIn ni couverture OIDC « générique ».

---

## III. Admin web (transversal)

- Application `apps/admin` : login, tableau de bord, paramètres club, membres, familles, adhésion, groupes dynamiques, UX annuaire (tiroir, palette de commandes) — voir fichiers sous `apps/admin/src/pages/`.

---

*Fin du fichier — pour le reste à faire, voir `2026-03-31-clubflow-avancement-reste.md`.*
