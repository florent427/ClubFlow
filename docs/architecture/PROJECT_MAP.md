# ClubFlow Project Map

> Point d'entrée humain pour comprendre l'architecture de ClubFlow en quelques
> minutes. Cette carte reste volontairement condensée : pour le détail (qui
> appelle quoi, qui lit quel modèle, quel guard protège quel resolver), on
> interroge le graphe Graphify (voir [Knowledge Graph](#knowledge-graph) et
> [GRAPHIFY_GUIDE.md](GRAPHIFY_GUIDE.md)).
>
> Rédigée le 2026-09-17 à partir du graphe construit sur le commit `9ea082b`
> et d'un audit mémoire/code du même jour. Les versions des technologies ne
> sont pas répétées ici : voir [stack.md](../knowledge/stack.md).

ClubFlow est un SaaS multi-tenant de gestion de clubs sportifs et associatifs :
adhésions, familles, facturation et paiements, comptabilité, boutique,
planning, messagerie, site vitrine public, agent IA. Un seul backend GraphQL
sert six clients.

---

## Applications

Chaque app est autonome avec son propre `package.json` : pas de workspaces npm
([ADR-0004](../memory/decisions/0004-no-monorepo-workspaces.md)).

| App | Rôle | Techno (cf. stack) |
|---|---|---|
| [`apps/api`](../../apps/api) | Backend unique : GraphQL, quelques contrôleurs REST (webhooks, OAuth, PDF), WebSocket `/chat` | NestJS + Prisma |
| [`apps/admin`](../../apps/admin) | Back-office des clubs (hôte `app.`) | React + Vite + Apollo |
| [`apps/member-portal`](../../apps/member-portal) | Portail membre / payeur | React + Vite + Apollo |
| [`apps/vitrine`](../../apps/vitrine) | Site public de chaque club (domaine custom ou sous-domaine), édition inline | Next.js SSR |
| [`apps/landing`](../../apps/landing) | Landing marketing ClubFlow + inscription d'un nouveau club | Next.js |
| [`apps/mobile`](../../apps/mobile) | App mobile membre | Expo / React Native |
| [`apps/mobile-admin`](../../apps/mobile-admin) | App mobile d'administration du club | Expo / React Native |

Ports de dev, domaines et environnements : [infra-dev.md](../knowledge/infra-dev.md),
[infra-network.md](../knowledge/infra-network.md), et le tableau Production de
[CLAUDE.md](../../CLAUDE.md). Arborescence : [repo-structure.md](../knowledge/repo-structure.md)
(partiellement périmée, voir divergences plus bas).

Graphify :
- `graphify explain "apps/admin/src/App.tsx"` : routes et pages de l'admin.
- `graphify query "quelles pages composent le portail membre"`

## Shared packages

Un seul package partagé : [`packages/mobile-shared`](../../packages/mobile-shared)
(client Apollo, stockage, documents GraphQL d'auth et de messagerie, design
system mobile, types dont `ModuleCode`).

Points à connaître :
- **Seule `apps/mobile-admin` le consomme.** TypeScript le résout via les `paths`
  du tsconfig vers `packages/`, mais au runtime un alias Babel pointe
  `@clubflow/mobile-shared` vers une **copie vendorisée** commitée dans
  `apps/mobile-admin/src/_shared/`. Cette copie est exclue du graphe
  (`.graphifyignore`) : le graphe montre le package, le bundle embarque la copie.
  Toute modification du package doit donc être recopiée.
- **`apps/mobile` n'importe pas `mobile-shared`** : son code (Apollo, storage,
  formatage) est dupliqué localement.
- Les apps web (admin, portail) ne partagent aucun composant.

Graphify :
- `graphify affected "packages/mobile-shared/src/index.ts" --depth 1`
- `graphify explain "createApolloClient()"` (label ambigu : préciser le fichier si besoin)

## Backend

`apps/api/src` est découpé en modules NestJS par domaine (une soixantaine de
modules). Regroupement utile :

| Groupe | Dossiers principaux |
|---|---|
| Socle | `auth`, `viewer`, `clubs`, `club-team`, `system-admin`, `common` (guards, décorateurs), `domain` (registre des modules club), `graphql`, `prisma`, `config`, `infra` (Caddy), `scheduling` (jobs, verrous) |
| Membres et adhésion | `members`, `families`, `membership` (panier, saisons, formules) |
| Argent | `payments` (Stripe, échéanciers, crédit du payeur), `accounting` (écritures, OCR, rapprochement), `cheques`, `external-finance` (subventions, sponsoring) |
| Activité | `planning`, `booking`, `events`, `projects`, `club-life` (annonces, sondages) |
| Communication | `comms` (campagnes), `mail`, `messaging` (chat WS), `push`, `notifications`, `telegram` |
| Contenus | `vitrine`, `public-site`, `blog`, `media`, `documents`, `pdf` |
| Commerce | `shop` (plus gros domaine : variantes, stock, précommandes, remboursements, fournisseurs) |
| IA | `agent` (assistant Aïko), `ai` |
| Pilotage | `dashboard` |

Chaîne typique : resolver GraphQL → service → `PrismaService`. Le hub réel du
câblage GraphQL est `graphql.module.ts` plutôt que `app.module.ts`. Le schéma
`schema.gql` est généré (gitignoré, exclu du graphe).

Graphify :
- `graphify explain "MembershipCartService"`
- `graphify path "MembersResolver" "PrismaService"`

## Frontends

Tous les clients parlent à l'API **uniquement via des documents GraphQL**
(constantes `gql` dans `lib/documents*.ts`, `*-documents.ts`, ou
`lib/documents/*.ts` côté mobile-admin). Pas de SDK généré. Dans le graphe,
chaque document est relié au champ de resolver qu'il appelle par une arête
`calls_api` (couche d'enrichissement ClubFlow).

- **admin** : `App.tsx` + `ModuleRouteGuard` (masque les pages des modules
  désactivés) ; `lib/storage.ts` porte jeton, club courant et slug.
- **member-portal** : même structure, avec sélection de profil et de club.
- **vitrine** : App Router Next (`app/sites/[host]/…`), résolution du club par
  l'hôte (`lib/club-resolution.ts`), client GraphQL léger, revalidation ISR.
  Pièges de cache : [pitfall ISR](../memory/pitfalls/nextjs-isr-cache-stale.md),
  [pitfall force-dynamic](../memory/pitfalls/nextjs-route-force-dynamic-headers-cookies.md).
- **landing** : pages statiques + formulaire d'inscription (hCaptcha).

Vérification de types : toujours `npm run typecheck` dans l'app (règle 8 de
[CLAUDE.md](../../CLAUDE.md), [pitfall](../memory/pitfalls/typecheck-noop-solution-tsconfig.md)).

Graphify :
- `graphify path "CLUB_EVENTS" ".clubEvents()"` : document → resolver en 1 saut.
- `graphify affected ".clubEvents()" --relation calls_api --depth 1` : quels écrans utilisent ce champ.

## Mobile

Deux apps Expo distinctes, navigation par `RootNavigator` → onglets → stacks.

- **`apps/mobile`** (membre) : panier, boutique, documents, messagerie,
  politique d'expiration de session. Code client autonome (pas de mobile-shared).
- **`apps/mobile-admin`** : dashboard, membres, activités, compta, boutique ;
  s'appuie sur `mobile-shared` (via la copie `_shared`, voir plus haut).

Pièges : [module natif hors Metro](../memory/pitfalls/module-natif-ne-passe-pas-par-metro.md),
[retour de paiement et schéma custom](../memory/pitfalls/openauthsession-exige-scheme-custom.md).
Déploiement : [mobile-deploy-staging.md](../runbooks/mobile-deploy-staging.md).

Graphify :
- `graphify explain "apps/mobile-admin/App.tsx"`
- `graphify query "comment l'app mobile membre gère l'expiration de session"`

## Database

PostgreSQL ([ADR-0001](../memory/decisions/0001-postgresql-16.md)) via Prisma,
schéma unique [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)
(environ 140 modèles et 90 enums, tous scopés par club).

- **Déploiement du schéma par `prisma db push`**, pas `migrate deploy`
  ([ADR-0003](../memory/decisions/0003-prisma-db-push.md)). Le dossier
  `migrations/` n'est plus alimenté (voir divergences).
- Toutes les lectures/écritures passent par `PrismaService` injecté dans les
  services.
- Le graphe expose chaque modèle en nœud `prisma_model_<nom>` avec les arêtes
  `relates_to` (relations), `uses_enum`, `reads_model` / `writes_model`
  (méthodes de service qui y accèdent).
- Restauration et snapshots : [restore-db.md](../runbooks/restore-db.md),
  [snapshot-prod-vers-clone.md](../memory/workflows/snapshot-prod-vers-clone.md),
  [backup-strategy.md](../knowledge/backup-strategy.md).

Graphify :
- `graphify affected prisma_model_member --relation reads_model --relation writes_model --depth 1`
- `graphify explain prisma_model_invoice`

## Authentication

- **Jeton** : JWT Bearer (`AuthService`, `JwtStrategy`, `GqlJwtAuthGuard`).
  Connexion e-mail + mot de passe avec vérification d'e-mail et reset, Google
  OAuth (contrôleur dédié), hCaptcha sur l'inscription. Pas de refresh token
  implémenté dans le code actuel.
- **Multi-tenant** : le client envoie le header `x-club-id` ; `ClubContextGuard`
  vérifie l'appartenance de l'utilisateur au club et le décorateur
  `@CurrentClub()` injecte le club dans le resolver. Côté navigateur, le club
  courant vit dans le stockage local (pas de préfixe `/<slug>/` dans les routes
  admin). Le header n'est pas une frontière de confiance à lui seul :
  voir [agent-ia-acces-donnees.md](../runbooks/agent-ia-acces-donnees.md).
- **Modules club activables** : `@RequireClubModule(ModuleCode.X)` au niveau
  resolver + `ClubModuleEnabledGuard` ; côté admin, `ModuleRouteGuard`.
- **Rôles** : guards `ClubAdminRoleGuard`, `ClubCommManagerRoleGuard`,
  `ClubProjectAccessGuard`, `EmailVerifiedGuard`, `ViewerActiveProfileGuard` ;
  plateforme : `SystemAdminGuard` / `SuperAdminGuard`. Bascule admin ↔ membre
  via `viewerAdminSwitch`.
- Rate limiting : [pitfall throttler derrière Caddy](../memory/pitfalls/throttler-sans-trust-proxy.md).
- Emplacement des secrets : [auth-secrets.md](../knowledge/auth-secrets.md).

Graphify (relations d'enrichissement `guarded_by`, `requires_module`, `sets_header`, `reads_header`) :
- `graphify affected ClubModuleEnabledGuard --relation guarded_by --depth 1`
- `graphify affected http_header_x_club_id --relation sets_header --relation reads_header --depth 1`

## Main domain concepts

Entités centrales : **Club** (tenant, modules activés via `ClubModule`),
**User** (compte) relié à un club par **ClubMembership**, **Member** (fiche
d'adhérent), **Family** / **FamilyMember** (foyer), **Contact** (tiers non
membre), **ClubSeason**, **MembershipProduct** et panier d'adhésion,
**Invoice** / **InvoiceLine** / **Payment** / **PaymentSchedule**, écritures
comptables, **ClubEvent**, **CourseSlot** / **CourseSlotBooking**, produits et
commandes **Shop***, pages **Vitrine***, salons de chat, campagnes.

Ce qui **n'est pas** une entité (erreur de lecture fréquente) :
- **Enfant** : un `Member` rattaché à une `Family` ; notion d'interface seulement.
- **Payeur** : un rôle de lien (`FamilyMember` avec rôle payeur/copayeur, ou
  payeur d'un panier), porté par un Member ou un Contact.
- **Licence / grade** : champ du membre, niveau de grade, type de frais ; pas
  de module dédié.
- **Cotisation** : produit + règle tarifaire + ligne de facture ; pas de modèle
  « abonnement ».
- **Crédit du payeur** : un usage de `Invoice` (dépôt de crédit) et non une
  table ([ADR-0022](../memory/decisions/0022-credit-du-payeur.md)).
- **Présence / pointage** : **absent du produit** (les réservations de créneau
  n'ont pas d'état « présent/absent »).
- `scheduling` désigne l'infrastructure de jobs, pas le planning des cours.

Décisions métier finance et boutique : ADR 0008 à 0022 dans
[decisions/](../memory/decisions/) (Stripe Connect, échéancier, compte de
transit, rapprochement bancaire, chèques, frais bénévoles, boutique…).

Graphify :
- `graphify explain prisma_model_familymember`
- `graphify query "comment le crédit du payeur règle une facture"`

## External services

| Service | Usage | Où regarder |
|---|---|---|
| Stripe (Connect) | Paiements en ligne, webhooks, compte de transit | `apps/api/src/payments`, [ADR-0008](../memory/decisions/0008-stripe-connect-express.md), [ADR-0010](../memory/decisions/0010-compte-transit-stripe.md) |
| Brevo (SMTP relay) / Mailpit en dev | E-mails transactionnels et campagnes | `apps/api/src/mail`, `comms` |
| Web Push (VAPID) | Notifications navigateur | `apps/api/src/push` |
| OpenRouter (LLM vision) | OCR des justificatifs, agent IA | `accounting`, `agent`, `ai` |
| Google OAuth | Connexion | `apps/api/src/auth` |
| hCaptcha | Inscription / formulaires publics | `auth`, `apps/landing` |
| Telegram | Liaison de compte et notifications | `apps/api/src/telegram` |
| Caddy (Admin API, TLS on demand) | Vhosts des vitrines par club | `apps/api/src/infra`, [ADR-0007](../memory/decisions/0007-caddy-admin-api-vs-caddyfile.md) |
| Cloudflare (DNS only), Hetzner | DNS, VPS prod/staging, Storage Box de sauvegarde | [ADR-0002](../memory/decisions/0002-cloudflare-dns-only.md), [infra-prod.md](../knowledge/infra-prod.md) |

Provisionnement tiers : skill `/provision` et
[provision-third-party-secrets.md](../runbooks/provision-third-party-secrets.md).

Graphify :
- `graphify query "comment un webhook Stripe crée un paiement et une écriture"`
- `graphify explain "PaymentsService"`

## Important flows

| Flux | Chemin résumé | Référence |
|---|---|---|
| Connexion | page Login → document `LOGIN` → `AuthResolver.login` → `AuthService` → JWT, puis choix de profil/club → `x-club-id` sur chaque requête | `graphify explain "AuthService"` (le label `LOGIN` existe dans plusieurs apps : `path` depuis lui est ambigu) |
| Adhésion en ligne | portail/mobile : panier d'adhésion → facture → paiement Stripe ou échéancier → écriture comptable | [ADR-0009](../memory/decisions/0009-echeancier-paiement-clubflow.md), [pitfall compta non seedée](../memory/pitfalls/compta-non-seedee-webhook-500.md) |
| Rapprochement bancaire | import de relevé → lignes → rapprochement (chèques, caisse) | [ADR-0014](../memory/decisions/0014-rapprochement-bancaire-par-releves.md) |
| Création d'un club | inscription landing → club + admin → vhost vitrine via Caddy API | [creation-club-multi-tenant.md](../memory/workflows/creation-club-multi-tenant.md), [add-new-club.md](../runbooks/add-new-club.md) |
| Vitrine | hôte → résolution du club → pages SSR → revalidation après édition | [seed-vitrine-pages.md](../runbooks/seed-vitrine-pages.md) |
| Modification → prod | commit conventionnel → `staging` (VPS staging) → promotion vers `main` → deploy + release-please | [modif-locale-vers-prod.md](../memory/workflows/modif-locale-vers-prod.md), [promouvoir-une-branche-partagee.md](../memory/workflows/promouvoir-une-branche-partagee.md), [deploy.md](../runbooks/deploy.md), [release.md](../runbooks/release.md) |

Graphify :
- `graphify path "CLUB_SEARCH" prisma_model_clubevent` (document → resolver → service → modèle)
- `graphify query "parcours d'une adhésion du panier jusqu'à l'écriture comptable"`

## Documentation & memory

| Dossier | Rôle |
|---|---|
| [`docs/memory/`](../memory/INDEX.md) | Mémoire vivante. `decisions/` = ADR (rationale des choix tranchés), `pitfalls/` = pièges déjà rencontrés (à consulter **avant** de redébugger), `workflows/` = parcours de bout en bout. `INDEX.md` est généré par `bin/memory-index` et vérifié en CI (`validate-memory.yml`). Skills `/add-pitfall`, `/add-decision`, `/learn`, `/dream`. |
| [`docs/knowledge/`](../knowledge/stack.md) | État statique du système : stack, structure, conventions, infra, secrets, sauvegardes. |
| [`docs/runbooks/`](../runbooks/deploy.md) | Procédures opérationnelles pas à pas (deploy, rollback, restore, rotation de secrets, onboarding club…). |
| [`docs/superpowers/`](../superpowers/) | Plans, specs et roadmap **historiques** issus des sessions de conception (mars à septembre 2026). Utiles pour le contexte, mais **possiblement périmés** : le code et les ADR font foi. |

La carte des règles d'or et du playbook d'incident reste [CLAUDE.md](../../CLAUDE.md).

### Divergences doc/code connues (audit 2026-09-17)

Audit en lecture seule : **rien n'a été modifié dans la mémoire ni la
documentation**. À trancher au cas par cas.

CONFLICT (7) :
- [contacts-ids.md](../knowledge/contacts-ids.md) : donne l'admin sur le domaine racine, alors que l'admin est sur `app.` et le domaine racine sert la landing.
- [modif-locale-vers-prod.md](../memory/workflows/modif-locale-vers-prod.md) : prescrit `npx tsc --noEmit` dans admin, no-op contraire à la règle 8.
- [add-new-app.md](../runbooks/add-new-app.md) : présente le port 5176 comme libre, alors qu'il est pris par la landing.
- [add-new-club.md](../runbooks/add-new-club.md) : édition manuelle du Caddyfile présentée comme procédure normale, alors que le code provisionne en self-service via l'Admin API (et cite un fichier vitrine inexistant).
- [rotate-secrets.md](../runbooks/rotate-secrets.md) : place la clé Brevo dans le `.env` de l'API, contrairement au runbook de provisionnement (fichier de secrets serveur).
- [smtp-relay-production.md](../runbooks/smtp-relay-production.md) : relais Postfix « prod », alors que la prod utilise Brevo (probablement historique).
- Specs [`superpowers/specs`](../superpowers/specs/) gestion-contacts vs contact-payeur-foyer : désaccord sur la coexistence Contact + Member ; le code suit gestion-contacts.

NEEDS REVIEW (état actuel du code ≠ intention documentée) :
- [ADR-0003](../memory/decisions/0003-prisma-db-push.md) : `db push` toujours actif, baseline de sortie jamais créée, dossier migrations figé.
- [ADR-0006](../memory/decisions/0006-path-based-multi-tenant.md) : pas de préfixe `/<slug>/` dans les routes admin, pas de `ClubMembershipGuard` (seul `ClubContextGuard`), pas de cookies `__Host-`.
- [ADR-0007](../memory/decisions/0007-caddy-admin-api-vs-caddyfile.md) : API du service Caddy différente, pas de réconciliation périodique ni au démarrage.
- [phase1-bootstrap-multi-tenant.md](../runbooks/phase1-bootstrap-multi-tenant.md) vs [wildcard-vitrine-subdomain.md](../runbooks/wildcard-vitrine-subdomain.md) : deux mécanismes de vhost wildcard coexistent ; vérifier lequel sert réellement en prod.

Également signalés comme possiblement périmés (STALE?) : `stack.md` (Redis
listé sans dépendance, landing absente), `repo-structure.md`,
`infra-network.md`, `infra-dev.md`, ADR-0005 (le tag n'est pas coupé sans
intervention), l'en-tête de `INDEX.md` (aucun hook git ne le régénère).

## Knowledge Graph

Le graphe Graphify (`graphify-out/graph.json`, rapport `graphify-out/GRAPH_REPORT.md`)
couvre tout le code et les docs, avec une couche d'enrichissement ClubFlow
(modèles Prisma, `calls_api`, `guarded_by`, `requires_module`, header
`x-club-id`) produite par `bin/graphify-enrich.py` et rafraîchie par
`bin/graphify-refresh`. Les nouvelles relations ne sont suivies par `affected`
qu'avec `--relation`. Comparer le commit du rapport à `git rev-parse HEAD` avant
de s'y fier. Mode d'emploi complet : [GRAPHIFY_GUIDE.md](GRAPHIFY_GUIDE.md).
