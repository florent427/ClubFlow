# ClubFlow — Reste à faire

> **Dernière mise à jour :** 2026-03-31 (inscription contact + OAuth Google MVP reflétés en phases I / L)  
> **Dernière preuve tests API :** `npm run test` 93 / 93 (23 suites) ; `npm run test:e2e` 14 / 14 (`apps/api`, rejoués ce jour).  
> **Paires avec :** `2026-03-31-clubflow-avancement-realise.md`  
> **Conception :** `ClubFlow_Conception_Provisoire.md` §4–§7  
> **Plan technique :** `docs/superpowers/plans/2026-03-30-plan-general-application-clubflow.md`

Mettre à jour ce fichier **sur demande** : retirer ou réduire une ligne seulement quand le critère de fin est atteint et vérifiable (code, test, doc produit).

---

## I. Méthodologie (conception §7.2)

| Phase | Étape | Reste à faire |
| :---: | --- | --- |
| **1** | Validation du périmètre | Formaliser la validation du document v0.2 (ou version suivante) par les parties prenantes ; tracer la décision (minutes, issue, ou section dans ce fichier datée). |
| **2** | Spécifications fonctionnelles | Couvrir par user stories / critères d’acceptation les modules **non** encore spécifiés (communication, compta, site public, mobile, vie du club, etc.) ou scoper explicitement un report. |
| **3** | Architecture technique | ADR ou doc court pour : OAuth **au-delà de Google** (autres fournisseurs, stratégie générique OIDC), hébergement FCM / files d’attente com, choix SSR/SSG pour le front public, stratégie PayPal si requis §4.4. |
| **4** | Maquettage UI/UX | Maquettes ou prototypes pour parcours §3.4–3.5 (sélection de profil), espace membre, paiement flexible, écrans mobile — si non couverts par le design Stitch seul. |
| **5** | Développement du socle | Revue finale du **plan socle** (cases `- [ ]` restantes) ; les tests API passent (voir preuve en tête de ce fichier). |
| **6** | Itérations modules | Poursuivre selon phases F–L et compléter les MVP ouverts en B–E (voir section II). |

---

## II. Implémentation (plan général — phases A à L)

### Phase A — Gouvernance monorepo et socle

- [x] Tests unitaires + e2e API **verts** (consignés en tête des fichiers roadmap ; commandes : `cd apps/api` puis `npm run test` et `npm run test:e2e`).
- [ ] Fermeture explicite des tâches `- [ ]` **ouvertes** dans `docs/superpowers/plans/2026-03-30-socle-backend-general-clubflow.md` si encore pertinentes.
- [ ] Optionnel : workspaces racine `package.json`, CI, politique de branches — si exigées par l’équipe.

### Phase B — Membres

- [ ] Périmètre complet §4.1 : alertes certificats médicaux, exports, règles fines non encore couvertes par les specs existantes.
- [ ] Cohérence « doc conception ↔ code » : revue des écarts résiduels après lecture des specs dans `docs/superpowers/specs/`.

### Phase C — Familles et profils

- [x] **MVP portail web** : `apps/member-portal` (login, choix de profil, dashboard, planning, famille) branché sur les queries `viewer*`.
- [ ] **UI portail « Netflix »** (suite) : affinements produit, contenus segmentés grade / âge (voir phase I), parité mobile.
- [ ] Affinage des droits profil principal vs secondaire sur **toutes** les queries/mutations concernées (conception §3.4–3.5).

### Phase D — Planning et cours

- [ ] Diffusion automatique des changements de planning vers les membres concernés (canaux à brancher avec phase F).
- [ ] Parcours admin complet (calendrier, duplication de créneaux, etc.) si non encore satisfait côté produit.

### Phase E — Paiement

- [x] Enregistrement **hors ligne** espèces / chèque / virement avec **paiements partiels**, solde sur facture et référence optionnelle (MVP trésorerie).
- [ ] PayPal (en ligne), rapprochement bancaire avancé et scénarios §4.4 au-delà du MVP ci-dessus.
- [ ] Tarification dynamique complète (modes et fréquences), relances configurables, intégration boutique quand **H** sera là.
- [ ] Couverture tests / sandbox documentée pour tous les moyens de paiement cibles (dont PayPal).

### Phase F — Communication et notifications

- [x] **MVP** : campagnes + audience via **groupes dynamiques** (`apps/api/src/comms/`, e2e).
- [x] **E-mail transactionnel (SMTP)** : transport réel (Nodemailer), domaines d’envoi club, DNS suggérés, admin et runbook — preuves : `apps/api/src/mail/*`, `apps/admin/src/pages/settings/MailDomainSettingsPage.tsx`, `docs/runbooks/smtp-relay-production.md`, `docker-compose.yml` (profil `relay`), spec/plan Postfix sous `docs/superpowers/specs|plans/2026-03-31-envoi-mail-prod-postfix-*`.
- [ ] **Autres canaux** messagers : API WhatsApp, Telegram, SMS, etc. (hors SMTP).
- [ ] **Durcissement e-mail prod** : DKIM opérationnel côté relais ou fournisseur, DMARC/reputation au-delà des enregistrements suggérés par l’API, selon cible hébergement.
- [ ] Notifications push + agrégation parent ↔ enfants en production (**FCM** ou équivalent) §3.6, §6.5.

### Phase G — Comptabilité, subventions, sponsoring

- [x] **MVP** : écritures depuis paiements si module compta activé (`apps/api/src/accounting/`) ; entités stub subventions / sponsoring (`apps/api/src/external-finance/`).
- [ ] Comptabilité **complète** §4.6 (rapprochements, notes de frais, obligations associatives à valider avec le client).
- [ ] Subventions et sponsoring **fonctionnels** (PDF, pièces, chaîne §5.2) au-delà des mutations e2e.

### Phase H — Site web, blog, boutique

- [ ] Créer le client public (`apps/web-public` ou équivalent), thème par club, pages institutionnelles.
- [ ] Blog (dépend `WEBSITE`), boutique (dépend `WEBSITE` + `PAYMENT`).

### Phase I — Espace membre web et mobile

- [x] `apps/member-portal` : socle livré **et accessible** (auth profil, viewer GraphQL, layout MVP) — preuves : chemins `apps/member-portal/`, plan `docs/superpowers/plans/2026-03-31-portail-membre-mvp-implementation.md`, **accès utilisateur validé** (2026-03-31).
- [x] **Inscription contact + vérif e-mail + OAuth Google (MVP)** — spec `docs/superpowers/specs/2026-03-31-inscription-contact-oauth-design.md`, plan `docs/superpowers/plans/2026-03-31-inscription-contact-oauth-implementation.md` ; API `apps/api/src/auth/*`, `apps/api/src/auth/oauth/*`, portail `RegisterPage`, `VerifyEmailPage`, `OAuthCallbackPage`, `MemberOrContactShell` ; e2e register → verify (suite `apps/api/test/`).
- [ ] `apps/member-portal` : contenus segmentés grade / âge (§3.5), réservation cours, et itérations UX au-delà du MVP.
- [ ] `apps/mobile` : GraphQL, réservation, notifications (réemploi logique phase F).

### Phase J — IA, SEO, raffinement

- [ ] `LlmClient` et scénarios blog / site / événements sans exposer de secrets dans le repo.

### Phase K — Vie du club, événements, réservation

- [ ] AG, bureau, bilan annuel ; événements et communication dédiée ; réservation créneaux privés (§4.12–4.14).
- [ ] Rédiger ou fusionner les plans détaillés mentionnés en phase K du plan général.

### Phase L — OAuth2 / OIDC

- [x] **MVP Google** + parcours contact (documenté et testé) — voir spec/plan `2026-03-31-inscription-contact-oauth-*`, routes `GET /auth/google`, `GET /auth/google/callback`, throttle + garde e-mail vérifié selon règles produit.
- [ ] Autres fournisseurs (Facebook, LinkedIn, …) et **OIDC générique** si requis par la cible produit.
- [ ] Maturation **fusion de comptes** (edge cases, UI admin, critères d’acceptation au-delà du MVP spec).

---

## III. Dépendances inter-phases (rappel)

Respecter le graphe conception §5 : ex. boutique **après** site + paiement ; subventions **après** comptabilité ; diffusion planning **souvent après** socle communication.

---

*Après chaque livraison majeure, reporter les points terminés dans `2026-03-31-clubflow-avancement-realise.md` et raccourcir cette liste.*
