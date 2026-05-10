# Changelog

Toutes les versions notables de ClubFlow sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versioning [Semantic Versioning](https://semver.org/lang/fr/).

Ce fichier est **régénéré automatiquement** par
[release-please](https://github.com/googleapis/release-please) à partir des
commits Conventional Commits sur `main`. Ne pas l'éditer à la main.

## [0.16.0](https://github.com/florent427/ClubFlow/compare/v0.15.0...v0.16.0) (2026-05-10)


### ✨ Features

* **adhesion:** frais ponctuels typés (LICENSE/MANDATORY/OPTIONAL) + UI mobile + panier complet ([4307981](https://github.com/florent427/ClubFlow/commit/4307981bd36854a2d3556bd2aac091b4a734194a))
* **adhesion:** frais ponctuels typés + UI mobile panier complet ([91dbe14](https://github.com/florent427/ClubFlow/commit/91dbe14edb4dd87d782b0c5b106b4dbc59cec646))
* **auth/vitrine:** banner club /login + lien Connexion vitrine ([84af7f9](https://github.com/florent427/ClubFlow/commit/84af7f9de4e97f8c65b5735736609a9c4fc9886e))
* **auth/vitrine:** banner club sur /login + lien Connexion vitrine + propage ?club= entre /login et /register ([69ef0fe](https://github.com/florent427/ClubFlow/commit/69ef0fe022796fc12ed7dd220496d44141efd226))
* **mobile/auth:** parité web — AuthClubBanner + Forgot/ResetPassword + lien forgot dans Login ([aa6689d](https://github.com/florent427/ClubFlow/commit/aa6689d2c00bbdc106e3fcae663d83d0d4c7fff1))
* **mobile/auth:** parité web — AuthClubBanner + Forgot/ResetPassword + lien forgot Login ([d5b2a8f](https://github.com/florent427/ClubFlow/commit/d5b2a8f0c3642f946cc8ffcc928dabd26d85675f))
* **mobile/cart:** LICENSE en checkbox cochée par défaut ([1c83775](https://github.com/florent427/ClubFlow/commit/1c837750d829f2d4f8c82c280089bc8c397d0dee))
* **mobile/cart:** LICENSE en checkbox cochée par défaut, décocher ouvre modale numéro ([63f275f](https://github.com/florent427/ClubFlow/commit/63f275f69352cd28c924039f6ee1f157253bda18))
* **mobile:** écran Admin WebView pour accéder au backoffice depuis l'app ([ce01130](https://github.com/florent427/ClubFlow/commit/ce0113026468fdca81d6d62987fca57e75db2d78))
* **multi-tenant:** sélection club explicite — portail ?club=, vitrine CTA, mobile SelectClub ([bb2a43c](https://github.com/florent427/ClubFlow/commit/bb2a43c23afd30c794b0f7f4b2724732510ecbe9))
* **multi-tenant:** sélection du club explicite — portail ?club=, vitrine CTA, mobile SelectClub ([a2ed08e](https://github.com/florent427/ClubFlow/commit/a2ed08e1bd94a03906fced729736b2884c18100b))
* **portal/cart:** section frais ponctuels typés — parité mobile ([1f1a241](https://github.com/florent427/ClubFlow/commit/1f1a2410ddb962f387bc1bd583758242bcb267fb))
* **portal/cart:** section frais ponctuels typés (LICENSE/MANDATORY/OPTIONAL) — parité mobile ([f256287](https://github.com/florent427/ClubFlow/commit/f25628770c82cddce6f7828534b01efeb00f824d))
* **portal/dashboard:** parité mobile — bannière panier + KPIs payeur + CTAs inscriptions ([e6bef03](https://github.com/florent427/ClubFlow/commit/e6bef036d6582598a24ca8098a7fd1dd4e43320b))
* **portal/dashboard:** parité mobile — bannière panier + KPIs payeur + CTAs inscriptions famille ([e82f578](https://github.com/florent427/ClubFlow/commit/e82f578945544254913b8cd829a852c04e57a1be))
* **portal/topbar:** UserMenu compact + admin gating club courant + SSO cross-domain ([f904394](https://github.com/florent427/ClubFlow/commit/f904394151d6f77af7d0f0c517632323c08807a3))
* **portal/topbar:** UserMenu compact + admin gating club courant + SSO cross-domain ([d1831fe](https://github.com/florent427/ClubFlow/commit/d1831fe6d6316361e78768fc02919fa2438ba0c9))
* **register:** lien 'Changer' dans le banner club ([208a0a8](https://github.com/florent427/ClubFlow/commit/208a0a80cce1724e031ee30bb73c56684de94915))
* **register:** lien 'Changer' dans le banner club du formulaire ([fa0258f](https://github.com/florent427/ClubFlow/commit/fa0258f2da65a683d6be033c1b7ef418f721d881))
* **register:** sélecteur club inline si pas de ?club= (web) + clubSlug mobile ([029976f](https://github.com/florent427/ClubFlow/commit/029976f5acecb709aa8437591c903a3234e38dde))
* **register:** sélecteur club inline si pas de ?club= + fix mobile clubSlug ([43e7570](https://github.com/florent427/ClubFlow/commit/43e757054a784e647b5a45664d37a244dddace82))
* **select-profile:** affiche le club sur chaque carte (parité web/mobile) ([03f61fd](https://github.com/florent427/ClubFlow/commit/03f61fd2506590fffde169c90572a3bf14a7d477))
* **select-profile:** affiche nom + logo du club sur chaque carte ([a3c4c2b](https://github.com/florent427/ClubFlow/commit/a3c4c2b0f3e591e8292ec1f295b692251a42d8c2))


### 🐛 Bug Fixes

* **api:** documenter API_PUBLIC_URL dans le template .env staging ([5d55782](https://github.com/florent427/ClubFlow/commit/5d557820843dcf510410e9730c90095afb74ca6d))
* **api:** rewrite mediaAssetUrl localhost→API_PUBLIC_URL au query time ([72b06cb](https://github.com/florent427/ClubFlow/commit/72b06cbf550ed269e0107f089bc00d263f40244d))
* **auth/register:** crée Family + FamilyMember PAYER au signup Contact ([ad42514](https://github.com/florent427/ClubFlow/commit/ad42514ca3a1f732a2b228deae06771246ecc486))
* **auth/register:** crée Family + FamilyMember PAYER au signup Contact ([44419b9](https://github.com/florent427/ClubFlow/commit/44419b9ead17c0a0a68abc0b72f8a49f6d1b5e06))
* **auth/register:** User existant + email vérifié peut rejoindre un nouveau club sans re-vérif ([1fad056](https://github.com/florent427/ClubFlow/commit/1fad056667221d15e694340a4afc0d228eca5cfb))
* **auth/register:** User existant + email vérifié peut rejoindre un nouveau club sans re-vérif ([310c972](https://github.com/florent427/ClubFlow/commit/310c9722c4c74ae6bed37e4c5db13bc766b3d37c))
* bug Documents admin failed-to-fetch + feature mobile Admin WebView ([d258b05](https://github.com/florent427/ClubFlow/commit/d258b05d392a5f5d003539a06bdb361799350bad))
* **cart/finalize:** un mineur ne peut JAMAIS être PAYER + check identité sur migration ([ed850c9](https://github.com/florent427/ClubFlow/commit/ed850c9e4ee9418fe1bcf4e7d51cb8bec96574ec))
* **cart:** mineur jamais PAYER + check identité sur migration Contact→Member ([6992360](https://github.com/florent427/ClubFlow/commit/6992360faec760382fa9ac3e93ea37b1d1aba81d))
* **mobile-admin:** add babel-preset-expo devDep top-level pour EAS ([c751df6](https://github.com/florent427/ClubFlow/commit/c751df6745235298ee7c7c74606d69a9aaddba73))
* **mobile-admin:** align deps SDK 55 (worklets 0.7.4) ([2241e6c](https://github.com/florent427/ClubFlow/commit/2241e6cbaf93abfa8e63348207b9f8e55e90eda9))
* **mobile-admin:** align deps to Expo SDK 55 — react-native-worklets 0.8.1→0.7.4 ([853c7b0](https://github.com/florent427/ClubFlow/commit/853c7b034d662fff7b30580f2dcc117138de207d))
* **mobile-admin:** babel-preset-expo top-level pour EAS ([438afa6](https://github.com/florent427/ClubFlow/commit/438afa65d8a6ef22e58e78a39de1dde89c018f30))
* **mobile-admin:** copie locale de mobile-shared pour EAS Build ([7d262f4](https://github.com/florent427/ClubFlow/commit/7d262f48b9a8ceac485bb08b7455fb67a866fd2c))
* **mobile-admin:** copie locale mobile-shared pour EAS Build ([52da623](https://github.com/florent427/ClubFlow/commit/52da6233f14bebde2d7235a7312df5ca5b134830))
* **mobile:** EAS preview env complet — GRAPHQL_HTTP + ADMIN_APP_URL (et pas juste API_BASE) ([913a7bd](https://github.com/florent427/ClubFlow/commit/913a7bd6aac6ad647eb64777a66fb35b5b45257e))
* **mobile:** export VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS query (manquait, oublié dans commit précédent) ([14ae785](https://github.com/florent427/ClubFlow/commit/14ae785db81991f0dea152ad657135a88374445f))
* **mobile:** RegisterChildMemberCta — fetch formules + sélection (api requires ≥1 formule) ([6896671](https://github.com/florent427/ClubFlow/commit/6896671252af709a22c7a03d5da4efebe7091cd3))
* **mobile:** RegisterChildMemberCta — schema membershipProductIds + date picker visuel ([b84e2ac](https://github.com/florent427/ClubFlow/commit/b84e2acbd1289d8c6c29fc400deb1058e01c3351))
* **mobile:** SelectProfile pour Contact PAYER → setMemberContactSession (pas setMemberSession) ([948b8c7](https://github.com/florent427/ClubFlow/commit/948b8c75af65d22fc6b6f06e6251cae2857931e2))
* **portal/usermenu:** "Profils du foyer" filtre sur le club courant uniquement ([eecb21a](https://github.com/florent427/ClubFlow/commit/eecb21a2c789d7ebba932a9d8c3be286f956baf7))
* **portal/usermenu:** "Profils du foyer" filtre sur le club courant uniquement ([a32a5c1](https://github.com/florent427/ClubFlow/commit/a32a5c1264e6dca2650cbd6a4dca4002ff3cb726))
* **staging:** apps/member-portal/.env.staging.example manquant ("Failed to fetch" sur portail) ([70f2291](https://github.com/florent427/ClubFlow/commit/70f2291f8345d74391d85e7049c8a55c84398727))
* **viewer/profiles:** listViewerProfiles ne réconcilie plus un mineur ni une identité différente ([d9d5bcc](https://github.com/florent427/ClubFlow/commit/d9d5bcc07b156ef7411fed911ff011f188d61591))
* **viewer:** listViewerProfiles ne réconcilie plus un mineur ni une identité différente ([86c8304](https://github.com/florent427/ClubFlow/commit/86c830436516f41240584fb542ebd12423fa37a2))

## [0.15.0](https://github.com/florent427/ClubFlow/compare/v0.14.0...v0.15.0) (2026-05-04)


### ✨ Features

* **mobile:** EAS Build setup staging Android (APK installable) ([#56](https://github.com/florent427/ClubFlow/issues/56)) ([dc2846e](https://github.com/florent427/ClubFlow/commit/dc2846efd897a1dc7d08ea82a97b5b5dde4660da))

## [0.14.0](https://github.com/florent427/ClubFlow/compare/v0.13.2...v0.14.0) (2026-05-04)


### ✨ Features

* **staging:** environnement staging dédié sur 2e VPS Hetzner ([#53](https://github.com/florent427/ClubFlow/issues/53)) ([d1489f3](https://github.com/florent427/ClubFlow/commit/d1489f3a2ed3fc98222ed5bc5aa7068a2744c132))

## [0.13.2](https://github.com/florent427/ClubFlow/compare/v0.13.1...v0.13.2) (2026-05-04)


### 🐛 Bug Fixes

* **vitrine:** /api/edit/enter redirect via x-forwarded-host ([#51](https://github.com/florent427/ClubFlow/issues/51)) ([8cb7155](https://github.com/florent427/ClubFlow/commit/8cb7155f39657ecbdc037159391789a261ac0c48))

## [0.13.1](https://github.com/florent427/ClubFlow/compare/v0.13.0...v0.13.1) (2026-05-04)


### 🐛 Bug Fixes

* **admin:** URL vitrine dynamique par club (boutons Ouvrir/Éditer) ([#49](https://github.com/florent427/ClubFlow/issues/49)) ([e4d392d](https://github.com/florent427/ClubFlow/commit/e4d392de9415b5c7bd0215f907efc9507091ff61))

## [0.13.0](https://github.com/florent427/ClubFlow/compare/v0.12.0...v0.13.0) (2026-05-04)


### ✨ Features

* **admin:** mot de passe oublié end-to-end + toggle show password ([#46](https://github.com/florent427/ClubFlow/issues/46)) ([c1c531b](https://github.com/florent427/ClubFlow/commit/c1c531b706e30213b3422af65fec4f7112da469c))

## [0.12.0](https://github.com/florent427/ClubFlow/compare/v0.11.1...v0.12.0) (2026-05-04)


### ✨ Features

* **signup:** seed 4 pages vitrine + vitrinePublished=true par défaut ([#44](https://github.com/florent427/ClubFlow/issues/44)) ([b99ed0b](https://github.com/florent427/ClubFlow/commit/b99ed0bde44e5bdc84f1d43edca468176e59d7f0))

## [0.11.1](https://github.com/florent427/ClubFlow/compare/v0.11.0...v0.11.1) (2026-05-04)


### 🐛 Bug Fixes

* **api:** MyAdminClubGraph — types explicites pour @Field ([#41](https://github.com/florent427/ClubFlow/issues/41)) ([34af35e](https://github.com/florent427/ClubFlow/commit/34af35eb5a1b1c33acd46ab4a2a8af0cc3d06a9c))

## [0.11.0](https://github.com/florent427/ClubFlow/compare/v0.10.3...v0.11.0) (2026-05-04)


### ✨ Features

* **admin:** club switcher + login sans clubId + page /select-club + 403 handling ([#39](https://github.com/florent427/ClubFlow/issues/39)) ([d7ced6d](https://github.com/florent427/ClubFlow/commit/d7ced6d8ef1fc439add96f5aa0f96fb63596297d))

## [0.10.3](https://github.com/florent427/ClubFlow/compare/v0.10.2...v0.10.3) (2026-05-04)


### 🐛 Bug Fixes

* **caddy:** force Origin header sur fetch admin API (403 fix) ([#36](https://github.com/florent427/ClubFlow/issues/36)) ([b0f33a1](https://github.com/florent427/ClubFlow/commit/b0f33a1ccf95659814a6888be4c9c52e45a21746))

## [0.10.2](https://github.com/florent427/ClubFlow/compare/v0.10.1...v0.10.2) (2026-05-04)


### 🐛 Bug Fixes

* **check-domain:** autoriser tous les sous-domaines de clubflow.topdigital.re ([#34](https://github.com/florent427/ClubFlow/issues/34)) ([4791c8e](https://github.com/florent427/ClubFlow/commit/4791c8e2fff6c470acc8bc7327910a3b96a6a2db))

## [0.10.1](https://github.com/florent427/ClubFlow/compare/v0.10.0...v0.10.1) (2026-05-04)


### 🐛 Bug Fixes

* **bootstrap:** Caddy v2.10 on_demand_tls + SQL UUID→TEXT ([#32](https://github.com/florent427/ClubFlow/issues/32)) ([1d16efd](https://github.com/florent427/ClubFlow/commit/1d16efd283511fad7c408167804f16b114841c86))

## [0.10.0](https://github.com/florent427/ClubFlow/compare/v0.9.0...v0.10.0) (2026-05-04)


### ✨ Features

* **provision:** script setup interactif tokens API + skill clarifié ([#29](https://github.com/florent427/ClubFlow/issues/29)) ([19597e2](https://github.com/florent427/ClubFlow/commit/19597e22b90fc8ca01358bd261db36a52d244ba4))

## [0.9.0](https://github.com/florent427/ClubFlow/compare/v0.8.1...v0.9.0) (2026-05-04)


### ✨ Features

* **skill,docs:** /provision + runbook + pitfall safety MCP ([#27](https://github.com/florent427/ClubFlow/issues/27)) ([91629c2](https://github.com/florent427/ClubFlow/commit/91629c2b552bdc89498c73fb0f446a0924f592a3))

## [0.8.1](https://github.com/florent427/ClubFlow/compare/v0.8.0...v0.8.1) (2026-05-04)


### 🐛 Bug Fixes

* **admin:** TS strict — 16 erreurs corrigées, npm run build sans bypass ([#24](https://github.com/florent427/ClubFlow/issues/24)) ([a391262](https://github.com/florent427/ClubFlow/commit/a391262d211d6a13f4eb5fb0c7f660c62c2923b5))

## [0.8.0](https://github.com/florent427/ClubFlow/compare/v0.7.0...v0.8.0) (2026-05-04)


### ✨ Features

* **api:** cron AbandonedClubsCron — détection clubs abandonnés (signup spam) ([#21](https://github.com/florent427/ClubFlow/issues/21)) ([fd52987](https://github.com/florent427/ClubFlow/commit/fd5298738c1fa079118cdbb620743990c7f0be7c))

## [0.7.0](https://github.com/florent427/ClubFlow/compare/v0.6.0...v0.7.0) (2026-05-04)


### ✨ Features

* **admin:** onboarding banner enrichi (Phase 2.2 — Sprint 2) ([#17](https://github.com/florent427/ClubFlow/issues/17)) ([2156110](https://github.com/florent427/ClubFlow/commit/215611096563fb7a41ca27b5c692f024337cebac))
* **api,landing:** captcha hCaptcha sur /signup (anti-bot) ([#19](https://github.com/florent427/ClubFlow/issues/19)) ([43c187c](https://github.com/florent427/ClubFlow/commit/43c187c687a0c570790c5049f94f2fc738327201))

## [0.6.0](https://github.com/florent427/ClubFlow/compare/v0.5.1...v0.6.0) (2026-05-04)


### ✨ Features

* **api,vitrine:** wildcard subdomain vitrine fallback (signup self-service) ([#16](https://github.com/florent427/ClubFlow/issues/16)) ([3a98789](https://github.com/florent427/ClubFlow/commit/3a98789dba993984b7bdec1c865ad5804d4184e8))

## [0.5.1](https://github.com/florent427/ClubFlow/compare/v0.5.0...v0.5.1) (2026-05-04)


### 🐛 Bug Fixes

* **api:** VitrineDomainStateGql nullable fields need explicit @Field type ([#13](https://github.com/florent427/ClubFlow/issues/13)) ([e7dfba5](https://github.com/florent427/ClubFlow/commit/e7dfba543e3a12a2af62c40a66358bb71f870ffa))

## [0.5.0](https://github.com/florent427/ClubFlow/compare/v0.4.0...v0.5.0) (2026-05-04)


### ✨ Features

* **api,admin:** Phase 3 — config domaine vitrine self-service via Caddy API ([#10](https://github.com/florent427/ClubFlow/issues/10)) ([b3045cb](https://github.com/florent427/ClubFlow/commit/b3045cb03aa4d2e8d56410fb359f1e4a25e2fa4b))

## [0.4.0](https://github.com/florent427/ClubFlow/compare/v0.3.0...v0.4.0) (2026-05-04)


### ✨ Features

* **api,landing:** Phase 2.1 — signup self-service createClubAndAdmin ([#8](https://github.com/florent427/ClubFlow/issues/8)) ([0a0002f](https://github.com/florent427/ClubFlow/commit/0a0002fbb127974600624ae049b7731b2db425c5))

## [0.3.0](https://github.com/florent427/ClubFlow/compare/v0.2.1...v0.3.0) (2026-05-04)


### ✨ Features

* **landing,api:** Phase 1 multi-tenant — apps/landing + ADR + URLs cible ([#6](https://github.com/florent427/ClubFlow/issues/6)) ([fe42fad](https://github.com/florent427/ClubFlow/commit/fe42fad1e50954a6a16517d39e7b4c2f93e60cc4))

## [0.2.1](https://github.com/florent427/ClubFlow/compare/v0.2.0...v0.2.1) (2026-05-03)


### 🐛 Bug Fixes

* **ci:** release-please auto-merge step — passer JSON via env (bash quoting) ([#3](https://github.com/florent427/ClubFlow/issues/3)) ([7b95484](https://github.com/florent427/ClubFlow/commit/7b954843735b1915dd1c6ee19aef5e10ddb58b9a))

## [0.2.0](https://github.com/florent427/ClubFlow/compare/v0.1.0...v0.2.0) (2026-05-03)


### ✨ Features

* **admin:** app Vite back-office Stitch, Apollo GraphQL et CORS API ([6272a12](https://github.com/florent427/ClubFlow/commit/6272a12e08636b1451e63a5e241fb57cde0212b1))
* **admin:** calendrier planning (vues mois/semaine/jour, DnD, pas 15 min) ([4b4db0b](https://github.com/florent427/ClubFlow/commit/4b4db0b0682f9fc99c23b5cd11c8740f6335c5e0))
* **admin:** Contacts portail — liste, drawer, GraphQL ([49164b6](https://github.com/florent427/ClubFlow/commit/49164b671cc987bd3724f6aef15808e63cf92f6e))
* **admin:** documents GraphQL adhesion et groupes dynamiques ([0df6aca](https://github.com/florent427/ClubFlow/commit/0df6aca098a7d00650c4345bb755486cc6912f91))
* **admin:** groupes dynamiques, parametres adhesion, cotisation fiche membre ([8dc5dec](https://github.com/florent427/ClubFlow/commit/8dc5dec4bdad3c15e01621f869585b1d5ca12520))
* **admin:** page communication campagnes et navigation ([25f5a2a](https://github.com/florent427/ClubFlow/commit/25f5a2a4d2823e62e765230a0d516dd3526b8bf6))
* **admin:** switch vers portail membre + désactivation sans profils ([cbce38d](https://github.com/florent427/ClubFlow/commit/cbce38de1651457e54406035b01ad7a6890d30d5))
* **api,admin:** suppression des formules d'adhesion (membershipProduct) ([338568b](https://github.com/florent427/ClubFlow/commit/338568b22921e1034646cc30f1fc6c9315558068))
* **api:** assignedDynamicGroups sur MemberGraph pour le back-office ([86c506e](https://github.com/florent427/ClubFlow/commit/86c506ea51f4dad24405ad2b3793cc880e4806b2))
* **api:** canAccessClubBackOffice sur viewerMe + helper rôle back-office ([d009cba](https://github.com/florent427/ClubFlow/commit/d009cba50e5e4e94c9f558a2ef632f1cc693c440))
* **api:** garde viewer profil actif pour portail membre ([e2d7a4f](https://github.com/florent427/ClubFlow/commit/e2d7a4f216f670e239c9f8c18033a4bf4a1aff84))
* **api:** GraphQL clubContacts et mutations admin ([0f8a4e2](https://github.com/florent427/ClubFlow/commit/0f8a4e2de40214d1ee0d304444882574493ca915))
* **api:** GraphQL socle, JWT, dashboard admin, modules club, seed et e2e ([a2ff441](https://github.com/florent427/ClubFlow/commit/a2ff4411207ec90440fcc416f869eaf4d59a855d))
* **api:** household group schema and payment paidByMemberId ([e5375b2](https://github.com/florent427/ClubFlow/commit/e5375b2361ef10a5c99cde1033a11a21fedd2227))
* **api:** lien automatique contact vers membre payeur (e-mail identique) ([547bce5](https://github.com/florent427/ClubFlow/commit/547bce5d1467b2ba9254d163530c62bd281d7234))
* **api:** module adhésion — saisons, groupes persistés, formules, factures DRAFT/OPEN ([fb8087f](https://github.com/florent427/ClubFlow/commit/fb8087f5a64d31e8246bba2c23c02255e6682cc4))
* **api:** module club MESSAGING pour la messagerie interne ([599fab4](https://github.com/florent427/ClubFlow/commit/599fab4708ccad36df7b01a106bd2cda837e45f3))
* **api:** schéma Contact, OAuth identities et vérif email ([408334d](https://github.com/florent427/ClubFlow/commit/408334d06ad66ad22b2c09c76a1011cc343a04d3))
* **api:** service contacts club et règles métier ([ebb854f](https://github.com/florent427/ClubFlow/commit/ebb854f0ddd070f646dd33187c73dd02fa1ce073))
* **api:** validation quarts d'heure UTC pour créneaux cours ([d3f4557](https://github.com/florent427/ClubFlow/commit/d3f4557a18780b5380c14431e7b564e882159bcb))
* **api:** ViewerModule et queries GraphQL portail membre ([1597576](https://github.com/florent427/ClubFlow/commit/1597576273ee6b77d5002a88635b740e8c153db1))
* ClubFlow v0.2.0 — Vitrine SKSR + Comms refonte + déploiement prod + CI/CD ([#1](https://github.com/florent427/ClubFlow/issues/1)) ([e30e209](https://github.com/florent427/ClubFlow/commit/e30e209dcc3751e6844a6e68a39c78b279659d6f))
* **contacts:** bouton admin pour resynchroniser liaisons contact/membres payeurs ([a2712f7](https://github.com/florent427/ClubFlow/commit/a2712f7e9320e0ac8f2b5d66977e012bc057f8a3))
* **db:** prisma schema club, user, modules, refresh tokens ([77f4c5a](https://github.com/florent427/ClubFlow/commit/77f4c5a21df30ed61007a3d3a16e232d9c04c193))
* **families:** payeur Contact — schéma, migration, admin, billing ([4e0c602](https://github.com/florent427/ClubFlow/commit/4e0c602049dabf8fd12e13e523855b272f6ded2c))
* foyer étendu (HouseholdGroup), profils viewer, facturation partagée, paidByMemberId ([feb4730](https://github.com/florent427/ClubFlow/commit/feb4730af12b131783f580f8b9a83d2a8ef05f98))
* inscription contact, vérification e-mail, OAuth Google (MVP) ([a84ede2](https://github.com/florent427/ClubFlow/commit/a84ede26f4e67aebdf88671955610fcb8a46a4ee))
* **mail:** enregistrements SPF/DMARC suggérés pour mode SMTP ([f4275d9](https://github.com/florent427/ClubFlow/commit/f4275d97e5db0e56b205f011b5077cbe5b781fd1))
* **mail:** option SMTP_DNS_SPF_CHECK pour vérification domaine ([9d2918d](https://github.com/florent427/ClubFlow/commit/9d2918da175dfb6e2d2c244036ad2e674d1f49c3))
* **member-portal:** bouton Back-office visible dans le header + viewerMe réseau ([409d02a](https://github.com/florent427/ClubFlow/commit/409d02a61137de47f7c00a7dab3081dbe9b6f541))
* **member-portal:** libellé Administration + visibilité strictement côté droits API ([639c43e](https://github.com/florent427/ClubFlow/commit/639c43ed5f64412ebd70c7b432870d5c72c67a3c))
* **member-portal:** login et sélection de profil ([60b5ea0](https://github.com/florent427/ClubFlow/commit/60b5ea031b679b268f45a0f59474393c32bc26ee))
* **member-portal:** toggle Admin + synchro session vers clés admin ([c16cad2](https://github.com/florent427/ClubFlow/commit/c16cad2e0cf0da3c498ebbe6c9ece8b9017a3170))
* **membership:** dual tarif annuel/mensuel, critères formule, enum lignes subscription ([89f00e9](https://github.com/florent427/ClubFlow/commit/89f00e9db3591c477b33d06e7469395ff3c9a182))
* messagerie interne (salons, communauté, direct, groupes), pseudo unique et portail ([7385258](https://github.com/florent427/ClubFlow/commit/73852582d3c0b6240ff2d68553fba3d1272c942a))
* modules admin reactifs, messagerie rapide, planning, Telegram et app mobile Expo ([87c0dab](https://github.com/florent427/ClubFlow/commit/87c0dab903512b249557f2cc1690c76f801f7302))
* **modules:** dependency validation for module activation ([c87267c](https://github.com/florent427/ClubFlow/commit/c87267cbc5d1c3d255229494cc23dd0815099281))
* **planning:** créneaux à venir filtrés pour membre portail ([8aa8817](https://github.com/florent427/ClubFlow/commit/8aa881753df746ac1985cf717398164b5fae7081))
* **ux:** implement 19 UX/ergonomie improvements ([3d38a98](https://github.com/florent427/ClubFlow/commit/3d38a9857df8bc67f77288180c9018681e8ec03e))


### 🐛 Bug Fixes

* **admin:** liens sidebar directs groupes dynamiques et adhesion ([8a267e7](https://github.com/florent427/ClubFlow/commit/8a267e729bfa715a5b793df15d1f694e99ab5f35))
* **api,portail:** bascule admin avec club workspace (multi-club) ([f46398a](https://github.com/florent427/ClubFlow/commit/f46398aabb3544706ec559dc62db6ea1ece7e727))
* **api:** CORS dev pour tout port localhost et origines multiples ([d7b3277](https://github.com/florent427/ClubFlow/commit/d7b32775d97536305a9ab676aa94b57b9b5b262a))
* **api:** Prisma shutdown hooks Nest 11, dep Apollo express5, seed et e2e ([653ff41](https://github.com/florent427/ClubFlow/commit/653ff416aa2443794b4273fd6b5c6f8e100f4155))
* **api:** types GraphQL explicites sur inputs adhésion (bootstrap Nest) ([171e590](https://github.com/florent427/ClubFlow/commit/171e590396c5767a4b3318193857692cbd0f6114))
* **member-portal:** toggle Admin/Personnel sur le tableau de bord + topbar ([1f78d7a](https://github.com/florent427/ClubFlow/commit/1f78d7a025a92296d2d2e08bed4dcddfaa75fb17))
* **members:** message clair si groupe lié à anciennes formules, chargement schéma MemberGraph ([09ce91f](https://github.com/florent427/ClubFlow/commit/09ce91f2dec03295d18faa0bf7f3e2320aa75978))
* **portail:** viewerAdminSwitch sans garde profil pour bouton back-office ([5ce4958](https://github.com/florent427/ClubFlow/commit/5ce49588c076e999225698315f05289919372b91))

## 0.1.0 (2026-05-03)

### ✨ Initial production release

- Stack NestJS + GraphQL + Prisma + PostgreSQL 16
- Front admin (React + Vite) + portail membre + vitrine Next.js
- Mobile membre (Expo SDK 55) + mobile-admin (en cours)
- Module Communication multi-canal (email + messagerie interne + push)
- Module Comptabilité avec OCR par IA (3-call pipeline)
- Module Adhésions, Familles, Billing, Planning, Events, Projects, Booking,
  Shop, Sponsoring, Subsidies, Site vitrine, Blog, Settings, Agent IA Aïko
- Déploiement prod sur Hetzner CX33 (Helsinki) — TLS auto Let's Encrypt
- Backups quotidiens pg_dump → Hetzner Storage Box
- Mail prod via Brevo (multi-domaine)
- Vitrine SKSR live sur sksr.re
