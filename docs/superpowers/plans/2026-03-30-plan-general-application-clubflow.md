# Plan général d’implémentation — Application ClubFlow

> **Pour agents :** SOUS-COMPÉTENCE REQUISE : utiliser @superpowers/subagent-driven-development (recommandé) ou @superpowers/executing-plans pour exécuter les plans **détaillés** référencés ci-dessous, tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Ordonner le développement de **l’ensemble de la plateforme ClubFlow** (conception v0.2) en phases testables, en réutilisant le **socle back-end et l’admin** déjà ciblés par le plan existant, puis en enchaînant les modules métiers selon le **graphe de dépendances** (section 5 du document de conception).

**Architecture :** Un **monorepo** avec API **NestJS + GraphQL (code-first) + Prisma + PostgreSQL** comme source de vérité multi-club (tenants). Les clients (admin web, site public, espace membre, app mobile) consomment la même API **GraphQL** ; l’activation des modules par club pilote l’exposition des schémas et des fonctionnalités (registre des modules déjà amorcé dans le socle). Chaque **domaine métier** (membres, familles, planning, etc.) correspond idéalement à un **bounded context** avec migrations Prisma et resolvers dédiés, reliés au `ModuleCode` existant.

**Stack technique (alignée conception §6) :** Node.js 20+, NestJS, Apollo GraphQL, Prisma, PostgreSQL ; auth **JWT** puis **OAuth2/OIDC** ; intégrations futures (Stripe, PayPal, FCM, connecteurs messagerie) encapsulées en services/connecteurs.

**Références :**

- Spécification fonctionnelle : `ClubFlow_Conception_Provisoire.md`
- Plan socle déjà rédigé : `docs/superpowers/plans/2026-03-30-socle-backend-general-clubflow.md`
- **Avancement (réalisé / reste à faire), mis à jour sur demande :** `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-realise.md` et `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-reste.md`
- Compétences d’exécution : @superpowers/writing-plans, @superpowers/subagent-driven-development, @superpowers/executing-plans, @superpowers/test-driven-development pour tout plan détaillé par module

---

## 1. Périmètre et découpage des plans

La conception couvre **plusieurs sous-systèmes largement indépendants** après le socle. Ce document est la **feuille de route principale** ; les implémentations détaillées (fichiers, tests, commandes) doivent vivre dans des **plans enfants** (un par module ou groupe soudé), pour respecter DRY/YAGNI et éviter un document ingérable.

| Plan enfant (à créer au fil de l’eau) | Document cible | Dépendances conception |
|---------------------------------------|------------------|-------------------------|
| Socle back-end général | `2026-03-30-socle-backend-general-clubflow.md` (existant) | §3.1, §5, §6 |
| Membres, grades, groupes dynamiques | `docs/superpowers/plans/YYYY-MM-DD-module-membres-clubflow.md` | §4.1 |
| Familles & payeur / profils | `docs/superpowers/plans/YYYY-MM-DD-module-familles-profils-clubflow.md` | §4.2, §3.4–3.5 — voir **frontière Membres / Familles** (§4 ci-dessous) |
| Auth OAuth2 / OIDC (connexion sociale) | `docs/superpowers/plans/YYYY-MM-DD-auth-oauth-clubflow.md` (ou section dans plan Familles) | §3.4, §6.2 — **Phase L** |
| Planning & cours | idem `...-module-planning-clubflow.md` | §4.3 |
| Paiement | idem `...-module-paiement-clubflow.md` | §4.4, §6.4 |
| Communication & notifications | idem `...-module-communication-clubflow.md` | §4.5, §6.5–6.6 |
| Comptabilité | idem `...-module-comptabilite-clubflow.md` | §4.6 |
| Subventions & sponsoring | idem (2 plans ou 1 plan « finance externe ») | §4.7–4.8 |
| Site web, blog, boutique | idem « front public » (possible découpage 3 plans) | §4.9–4.11 |
| Vie du club, événements, réservation | 3 plans ou 1 plan « vie associative » selon charge — **voir Phase K** | §4.12–4.14 |
| App mobile | idem `...-app-mobile-clubflow.md` | §3.6, §6.1 |

---

## 2. État actuel du dépôt (cohérence avec le travail réalisé)

> **Source détaillée :** le tableau vivant et les preuves dans le repo sont maintenus dans  
> `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-realise.md` (fait) et  
> `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-reste.md` (à faire).  
> La section ci-dessous est un **résumé** ; en cas de divergence, les fichiers roadmap font foi jusqu’à prochaine mise à jour.

| Zone | Statut (2026-03-31) | Rappel |
|------|---------------------|--------|
| Socle API + registre modules + JWT + dashboard | **Réalisé** | Agrégations dashboard branchées sur membres, créneaux, factures, paiements |
| Membres + groupes dynamiques + champs configurables | **Réalisé (principal)** | Voir `apps/api/src/members/`, admin membre |
| Familles + payeur + profils viewer / JWT | **MVP API + admin + portail web** | Affinages UX portail, mobile → roadmap « reste » |
| Planning (lieux, créneaux, anti-chevauchement coach) | **Réalisé (cœur API)** | Diffusion automatique → phase F |
| Paiements (Stripe webhook, adhésion / facturation) | **MVP** | Partiels + hors ligne (admin famille) faits ; PayPal, relances, boutique → roadmap « reste » |
| Communication (campagnes, e-mail SMTP/domaines, groupes) + compta MVP + finance externe stub | **MVP API (+ SMTP club)** | WhatsApp / SMS / FCM, DKIM prod avancée, compta complète, dossiers subventions/sponsoring → roadmap « reste » |
| Site public, mobile, OAuth (autres IdP), IA, vie du club (hors planning API) | **Partiel** : OAuth **Google** + inscription **contact** / vérif e-mail sur `apps/member-portal` et `apps/api/src/auth` (spec `docs/superpowers/specs/2026-03-31-inscription-contact-oauth-design.md`) ; **H** (site public), mobile, autres fournisseurs OAuth, IA, vie du club → encore ouverts |

**Alignement continu :** exécuter `cd apps/api && npm run test && npm run test:e2e` après tout changement majeur ; mentionner le résultat dans le roadmap réalisé ou une PR.

---

## 3. Structure monorepo cible (évolution)

Les **nouveaux** livrables majeurs devraient suivre cette grille (à ajuster si le repo adopte un autre layout, mais garder la même **séparation des responsabilités**) :

| Chemin | Rôle |
|--------|------|
| `apps/api/src/members/` (ou équivalent) | Domaine **Membres** : entités, resolvers, services, politiques de visibilité |
| `apps/api/src/families/` | Familles, liens payeur, règles « un seul payeur » |
| `apps/api/src/planning/` | Créneaux, cours, conflits professeurs, liaison groupes dynamiques |
| `apps/api/prisma/schema.prisma` + `migrations/` | Évolution unique du modèle ; une migration par plan métier validé |
| `apps/web-public/` (à créer) | Site vitrine + blog + boutique (ou split `apps/web`, `apps/blog` si nécessaire) |
| `apps/member-portal/` | Espace membre web **MVP** (auth, sélection de profil, viewer GraphQL, **inscription contact / vérif e-mail / Google**) — plans portail MVP + `docs/superpowers/plans/2026-03-31-inscription-contact-oauth-implementation.md` ; **accès validé** (03/2026). |
| `apps/mobile/` (à créer) | Client GraphQL mobile, notifications |
| `packages/graphql-schema/` (optionnel) | Types partagés ou fragments si duplication devient doublereuse |

**Fichiers transverses existants à réutiliser :** `module-codes.ts`, `module-dependencies.ts`, `club-context.guard.ts`, seed des `ModuleDefinition`.

---

## 4. Ordre de réalisation recommandé (chemin critique)

L’ordre respecte le **tableau 5.2** et les **chaînes 5.3** du document de conception :

```text
Back-end général + Membres (obligatoire)
    → Planning | Communication | Familles/profils | Vie du club | Événements | Réservation
    → Paiement
        → Comptabilité
            → Subventions, Sponsoring
Back-end général
    → Site web
        → Blog
        → Boutique (avec Paiement déjà actif)
```

**Synthèse :** après stabilisation du socle, la **priorité n°1 métier** est le **module Membres** (référentiel + groupes dynamiques + rôles). En parallèle ou juste après : **Familles / profils** pour débloquer l’expérience « Netflix » et le module **Paiement**. Le **front public** peut démarrer après le socle mais avant la boutique complète.

**Frontière Membres / Familles (spec §4.2 vs §4.1) :** dans la conception, les **familles** sont transverses Membres ↔ facturation. En implémentation, garder **toutes les données d’identité et d’appartenance au club** dans le domaine **Membres** ; placer **Family**, **payeur désigné** et **rattachements parent/enfant** dans le domaine **Familles** avec FK vers `Member` (ou vers `User` uniquement pour contacts externes si le plan enfant le prévoit). Les plans enfants **Membres** et **Familles** doivent lister les mêmes entités dans un seul schéma Prisma (migrations coordonnées) pour éviter les cycles et les doublons.

---

### Phase A : Gouvernance du monorepo et socle

**Fichiers :** racine `package.json` workspaces (optionnel), `docker-compose.yml`, `docs/superpowers/plans/2026-03-30-socle-backend-general-clubflow.md`.

- [ ] **Étape A.1 : Vérifier l’exécution complète du plan socle**

Run : `cd c:\Users\flore\ClubFlow\apps\api && npm run test && npm run test:e2e`  
Attendu : **PASS** (ajuster seed/env si échec).

- [ ] **Étape A.2 : Cartographier l’écart « doc → code »**

Créer une courte liste dans une issue ou dans le plan enfant Membres : champs dashboard encore en stub (`upcomingSessionsCount`, etc.) — **ne pas** les implémenter avant le module concerné (YAGNI).

- [ ] **Étape A.3 : Commit de stabilisation** (si correctifs)

```bash
git add -A
git commit -m "chore: align api with socle plan verification"
```

---

### Phase B : Module Membres (référentiel + groupes dynamiques)

**Fichiers (cible pour le plan détaillé) :**

- Créer : `docs/superpowers/plans/YYYY-MM-DD-module-membres-clubflow.md`
- Modifier : `apps/api/prisma/schema.prisma` (modèles `Member`, `Grade`, `DynamicGroup`, critères, liaisons `Club`)
- Créer : `apps/api/src/members/**` (resolvers, services, DTO)
- Test : `apps/api/src/members/**/*.spec.ts`, `apps/api/test/members.e2e-spec.ts` (nom exact au choix, mais **préfixe cohérent**)

**Principes TDD :** chaque règle métier (appartenance à un groupe dynamique recalculée quand âge ou grade change) commence par un **test unitaire** sur une fonction pure de calcul de critères, puis intégration Prisma.

**Graines de tâches (à détailler dans le plan enfant) :**

- [ ] **Étape B.1 : Rédiger le plan détaillé Membres** (skill @superpowers/writing-plans) avec schéma Prisma complet et liste des queries/mutations GraphQL minimales (CRUD membre, gestion grades, CRUD groupes dynamiques, résolution « membres d’un groupe »).

- [ ] **Étape B.2 : Première migration Prisma « members_core »** — test d’échec : e2e `createMember` inexistant → après implémentation, mutation réussie.

- [ ] **Étape B.3 : Brancher `ModuleCode.MEMBERS`** — le module reste `isRequired` ; les routes métier exigent `MEMBERS` actif (déjà vrai par conception).

- [ ] **Étape B.4 : Commit**

```bash
git add apps/api/prisma apps/api/src/members apps/api/test docs/superpowers/plans/*.md
git commit -m "feat(members): core member registry and dynamic groups"
```

---

### Phase C : Familles, payeur, sélection de profil (MVP)

**Fichiers :**

- Créer : `docs/superpowers/plans/YYYY-MM-DD-module-familles-profils-clubflow.md`
- Modifier : `schema.prisma` (`Family`, `FamilyMember`, liens payeur)
- Créer : `apps/api/src/families/**`
- Modifier : `apps/api/src/auth/*` (claims JWT : `activeProfileId`, distinction principal / secondaire — **spécifier dans le plan enfant**)

- [ ] **Étape C.1 : Modèle de données famille + contrainte un payeur**

Tests : unitaire sur règle « un seul `PAYER` par famille » ; e2e création famille invalide → erreur.

- [ ] **Étape C.2 : Adapter login / refresh** pour liste des profils disponibles (MVP : champs GraphQL `viewerProfiles`).

- [ ] **Étape C.3 : Commit**

```bash
git add apps/api/src/families apps/api/src/auth prisma
git commit -m "feat(families): household payer and profile selection api"
```

---

### Phase D : Planning & cours

**Fichiers :** plan détaillé `...-module-planning-clubflow.md`, `apps/api/src/planning/**`, évolution Prisma (`CourseSlot`, `Venue`, liaisons `DynamicGroup`).

- [ ] **Étape D.1 : Tests de conflit professeur** — deux cours chevauchants même prof → rejet.

- [ ] **Étape D.2 : Alimenter `upcomingSessionsCount`** dans `dashboard.service.ts` (remplacer stub).

- [ ] **Étape D.3 : Commit** — message du type `feat(planning): weekly schedule and conflict detection`.

---

### Phase E : Module paiement (indépendant, tarification dynamique)

**Fichiers :** plan `...-module-paiement-clubflow.md`, `apps/api/src/payments/**`, tables `Invoice`, `PaymentMethod`, `InstallmentPlan`, rattachement famille.

**Rappel spec §4.4 (périmètre à couvrir progressivement) :** Stripe **et** PayPal pour le en ligne ; **virement, chèque, espèces** avec enregistrement / rapprochement manuel ou semi-auto ; **fréquences** (comptant, 2–4 échéances, prélèvement mensuel) ; **tarification dynamique** selon mode et fréquence ; **remises** (famille, promo) ; **relances** configurables. Un MVP peut commencer par **Stripe + enregistrement manuel hors ligne**, mais le plan enfant doit nommer explicitement les reports (ex. PayPal v2) pour éviter un « terminé » trompeur.

- [ ] **Étape E.1 : Intégration Stripe (webhooks)** en sandbox — TDD avec mocks HTTP (pas d’appel réseau en CI).

- [ ] **Étape E.2 : Règles tarifaires** paramétrables (pourcentage ou montant selon mode de paiement).

- [ ] **Étape E.3 : Dashboard** — `outstandingPaymentsCount`, `revenueCentsMonth` alimentés ou documentés comme « partiel » selon choix produit.

- [ ] **Étape E.4 : Commit** — `feat(payments): stripe hooks and dynamic pricing`.

---

### Phase F : Communication multi-canal + agrégation notifications

**Fichiers :** `apps/api/src/comms/**`, connecteurs (`TelegramConnector`, `EmailConnector`, …), jobs file d’attente (ex. BullMQ + Redis — **à trancher dans le plan détaillé**).

- [ ] **Étape F.1 : Modèle campagne + audience résolue via groupes dynamiques** (snapshot ou résolution à l’envoi — documenter le choix).

- [ ] **Étape F.2 : Agrégation parent / enfants** pour payload FCM (stub acceptable en MVP avec log structuré).

- [ ] **Étape F.3 : Commit**

---

### Phase G : Comptabilité → Subventions / Sponsoring

**Fichiers :** `apps/api/src/accounting/**`, imports relevés, liaison écritures ↔ paiements.

- [ ] **Étape G.1 : Plan détaillé comptabilité** avec obligations associatives françaises (périmètre légal à valider avec le client — **ne pas sur-spécifier** sans validation).

- [ ] **Étape G.2 : Après comptabilité stable**, plans Subventions et Sponsoring (PDF, pièces jointes).

---

### Phase H : Site web, blog, boutique (front public)

**Fichiers :** `apps/web-public/**` (SSR/SSG au choix : Next.js ou Nuxt — **décision dans un ADR court**), intégraph Apollo vers l’API existante.

- [ ] **Étape H.1 : Shell site + thème club** (tokens couleur depuis API `ClubTheme` — champ à ajouter côté Prisma si absent).

- [ ] **Étape H.2 : Blog** dépend de `WEBSITE` ; boutique dépend de `WEBSITE` + `PAYMENT`.

- [ ] **Étape H.3 : Commit** par increment (site, blog, shop).

---

### Phase I : Espace membre web + application mobile

**Fichiers :** `apps/member-portal/**`, `apps/mobile/**` (React Native / Flutter — choix dans plan enfant).

> **État 2026-03-31 :** le **portail web MVP** est livré et accessible (`apps/member-portal`, `apps/api/src/viewer/`). Les étapes `- [ ]` ci-dessous = **suite** (affinements §3.4–3.5, contenus segmentés, FCM, mobile).

- [ ] **Étape I.1 : Parcours sélection profil** aligné §3.4.

- [ ] **Étape I.2 : Contenus segmentés** (visibilité par grade/âge) — réutiliser règles des groupes dynamiques.

- [ ] **Étape I.3 : FCM** pour notifications réelles (remplacer stubs Phase F si nécessaire).

---

### Phase J : IA (LLM), SEO, raffinement

**Fichiers :** services `apps/api/src/ai/**` ou workers séparés ; clés API via env ; **pas** de clé dans le repo.

- [ ] **Étape J.1 : Interface `LlmClient`** + impl OpenAI-compatible (mock en test).

- [ ] **Étape J.2 : Scénarios Blog / Site / Événements** selon §4.9–4.11 et §4.13.

---

### Phase K : Vie du club, événements, réservation (§4.12–4.14)

**Ordre suggéré :** après **Membres** (et idéalement quand **Communication** est amorcé pour convocations / canaux). **Réservation** peut suivre **Planning** (calendrier profs) mais reste indépendante au niveau dépendances §5.2.

**Fichiers (cible pour plan(s) enfant(s)) :**

- Créer : `docs/superpowers/plans/YYYY-MM-DD-module-vie-club-clubflow.md` (AG, bureau, bilan annuel)
- Créer : `docs/superpowers/plans/YYYY-MM-DD-module-evenements-clubflow.md` (stages, logistics, canal dédié, résumés)
- Créer : `docs/superpowers/plans/YYYY-MM-DD-module-reservation-clubflow.md` (créneaux privés, accept/refuse prof)
- Créer : `apps/api/src/club-life/**`, `apps/api/src/events/**`, `apps/api/src/booking/**` (ou structure équivalente par domaine)

- [ ] **Étape K.1 : Rédiger (ou fusionner) les plans détaillés** §4.12–4.14 avec prérequis `MEMBERS` explicites et points d’intégration vers **Communication** (convocations AG) et **Planning** (disponibilités pour réservation).

- [ ] **Étape K.2 : Schéma Prisma minimal « vie du club »** — modèles `GeneralAssembly`, `BoardMeeting`, documents archivés ; tests e2e : création AG + liste.

- [ ] **Étape K.3 : Schéma + API « événements »** — entité événement, participants, volunteers ; critère de fin : publication d’un résumé (mock LLM acceptable en premier incrément).

- [ ] **Étape K.4 : Réservation** — demande membre → notification prof → états `PENDING`/`ACCEPTED`/`DECLINED` ; pas de double réservation sur le même créneau prof.

- [ ] **Étape K.5 : Commit** par domaine (`feat(club-life): …`, `feat(events): …`, `feat(booking): …`).

---

### Phase L : OAuth2 / OIDC (connexion sociale — §3.4, §6.2)

**Placement :** après **JWT + Familles MVP (Phase C)** pour que les `User` existent et que la stratégie « compte lié » soit stable ; peut démarrer en parallèle du **front membre** si les flows redirect sont prêts.

**Fichiers :** `apps/api/src/auth/oauth/**`, config fournisseurs (Google, etc.), tables `OAuthAccount` ou équivalent ; mise à jour plan enfant **Familles** si le linkage touche l’identité.

- [ ] **Étape L.1 : Plan détaillé OAuth** — stratégie Passport (ou équivalent), variables d’environnement, mapping vers `User` existant par email (politique de fusion documentée).

- [ ] **Étape L.2 : Première mutation `loginWithGoogle` (ou flow authorization code)** + test e2e mock du provider.

- [ ] **Étape L.3 : Commit** — `feat(auth): oauth google starter`.

---

## 5. Stratégie de test transversale

| Niveau | Responsabilité |
|--------|----------------|
| Unitaires | Règles pures (groupes dynamiques, tarification, dépendances modules) |
| Intégration | Prisma + services avec base de test (transactions rollback ou DB jetable) |
| e2e GraphQL | Scénarios « club seed → login → mutation/query » par module |
| Contrat | Optionnel : tests schema GraphQL breaking changes en CI |

Référence discipline : @superpowers/test-driven-development pour tout nouveau plan détaillé.

---

## 6. Revue auteur (checklist)

- [x] Chaque phase majeure pointe vers un **plan enfant** ou vers le plan socle **existant** (Phases K et L pour §4.12–4.14 et OAuth).
- [x] L’ordre respecte la **section 5** du document de conception.
- [x] L’**état actuel** du repo est pris en compte (pas de re-scaffold du socle).
- [x] Les stubs du dashboard sont explicitement reliés aux **modules futurs**.

---

## Fin de plan — emplacement et exécution

**Plan enregistré sous :** `docs/superpowers/plans/2026-03-30-plan-general-application-clubflow.md`

**Options d’exécution :**

1. **Subagent-driven (recommandé)** — un plan enfant à la fois avec @superpowers/subagent-driven-development.
2. **Exécution inline** — enchaîner les phases avec @superpowers/executing-plans lorsque le périmètre d’une phase est figé.

**Quelle approche souhaitez-vous pour la phase suivante (après validation du socle) : rédiger le plan détaillé « Membres » en premier ?**
