# Audit des anciens plans (mars–avril 2026) face au code

> 2026-09-14. Vingt plans d'implémentation de mars et avril 2026 relus case par
> case contre le code actuel, en lecture seule. Les constats les plus lourds ont
> été revérifiés dans le code et, en lecture seule, sur le serveur de prod.

## En bref

- **L'essentiel est livré.**
  - Sur 641 cases non cochées, 342 livraisons sont faites, 20 sont obsolètes et 240 cases ne sont que du processus (commit, build, lancer les tests, recette manuelle).
  - Il reste 24 cases partielles et 15 manquantes, surtout des tests.
- **Les vrais problèmes sont hors des cases** : ils sont apparus en vérifiant les livraisons. Cinq touchent la sécurité ou la fiabilité de la prod :
  1. un compte pas encore vérifié peut être repris par un tiers ;
  2. la limitation de débit est un compteur unique pour toute la plateforme ;
  3. une campagne e-mail de SKSR serait marquée « envoyée » sans qu'aucun mail ne parte ;
  4. le bouton « Vérifier » d'un domaine d'envoi ne vérifie rien ;
  5. un membre désactivé continue de lire la messagerie en temps réel.
- **Aucun test ne tourne en CI** : une PR ne passe que le typecheck, la validation de la mémoire et le déploiement.

Deux plans de la période n'ont pas été audités, car toutes leurs cases étaient
déjà cochées : `2026-03-30-annuaire-tiroir-creation-routes-implementation.md` et
`2026-03-30-parametres-fiche-membre-champs-configurables-implementation.md`.

## Méthode

- **Répartition** : quatre agents d'audit, cinq plans chacun, sans rien modifier ni lancer (ni tests, ni build).
- **Classement** : chaque case non cochée est FAIT, PARTIEL, MANQUANT, OBSOLÈTE ou processus, avec les fichiers et lignes qui le prouvent.
- **Preuve d'absence** : un MANQUANT cite la recherche faite.
- **Livraison ou processus** : écrire un test compte comme une livraison ; le lancer est du processus.
- **Sources des constats** :
  - **vérifié** : relu dans le code le 2026-09-14 ;
  - **prod** : confirmé par une lecture sur le serveur (configuration, Caddy, comptages en base) ;
  - **audit** : les autres constats viennent des rapports d'audit, avec leurs références, sans nouvelle relecture ligne à ligne.

## 1. Priorité 1 : sécurité et fiabilité

### 1.1 Reprise d'un compte avant vérification de l'e-mail (vérifié, prod)

Tout se passe dans `registerContact` (`apps/api/src/auth/auth.service.ts:198-308`).

- **Compte existant non vérifié** (l. 252-256) : le mot de passe et le nom sont écrasés par la nouvelle demande, sans preuve d'identité.
  1. Quelqu'un s'inscrit.
  2. Avant qu'il clique sur son lien, un tiers refait l'inscription avec la même adresse et son propre mot de passe.
  3. Un nouveau lien part chez le vrai titulaire ; l'ancien est invalidé (`apps/api/src/auth/email-verification.service.ts:25-29`).
  4. S'il clique, l'adresse est vérifiée avec le mot de passe du tiers, qui peut alors se connecter à son compte.
- **Compte existant vérifié** (l. 228-249) : un contact, et un foyer dont il est payeur, sont créés sur le club demandé, sans mot de passe. Connaître l'e-mail suffit pour rattacher ce compte à un autre club.
- **Énumération** : l'erreur `USER_ALREADY_EXISTS` (l. 233) et `requiresEmailVerification: false` (l. 249) révèlent que le compte existe. Le portail affiche ce retour (audit : `apps/member-portal/src/pages/RegisterPage.tsx:128-129`).
- **Fusion Google** (l. 419-444) : relier Google à un compte non vérifié le marque vérifié, mais laisse valide le mot de passe posé à l'inscription. C'est le schéma classique du pré-détournement de compte.
  - **Prod** : `GOOGLE_CLIENT_ID` n'est pas renseigné, donc le risque est latent aujourd'hui.
  - Le bouton Google du portail est pourtant affiché sans condition (audit : `apps/member-portal/src/pages/LoginPage.tsx:244-249`).

Pistes :
- ne jamais écraser le mot de passe d'un compte existant (prévenir plutôt le titulaire par e-mail) ;
- exiger la connexion pour rejoindre un nouveau club ;
- répondre de la même façon, que le compte existe ou non ;
- effacer le mot de passe quand Google est relié à un compte non vérifié ;
- un test par cas.

### 1.2 Limitation de débit commune à toute la plateforme (vérifié, prod)

- **Cause** : le throttler compte par `req.ip`.
  - `GqlThrottlerGuard` (`apps/api/src/common/guards/gql-throttler.guard.ts`) ne redéfinit pas cette clé.
  - `apps/api/src/main.ts` ne pose pas `trust proxy`.
- **Prod** : Caddy relaie tout vers `localhost:3000` (lignes 63-64 du Caddyfile), donc toutes les requêtes arrivent de 127.0.0.1.
- **Conséquence** : un seul compteur par opération, tous clubs et tous utilisateurs confondus (`apps/api/src/auth/auth.resolver.ts:33-82`).
  - Limites par minute : `login` 20, `registerContact` 8, `createClubAndAdmin` 5, `verifyEmail` 12, `requestPasswordReset` 6, `resetPassword` 12.
  - À la rentrée, la 21ᵉ connexion d'une même minute échoue pour tout le monde. Vingt requêtes par minute suffisent à bloquer toutes les connexions de la plateforme.
  - Les autres opérations protégées par ce garde partagent aussi leur compteur : messagerie, vitrine et événements publics, invitations familiales.

Pistes :
1. `app.set('trust proxy', 'loopback')`, puisque Caddy est local.
2. Contrôler l'IP vue par l'API.
3. Ajouter un compteur par e-mail sur `login`.

### 1.3 Campagne e-mail « envoyée » sans aucun mail (vérifié, prod)

- **Passage en SENT trop tôt** : `sendCampaign` passe la campagne en SENT avant toute diffusion (`apps/api/src/comms/comms.service.ts:581-594`). Une erreur de canal est seulement journalisée (l. 644-648).
- **Domaine exigé** : le canal e-mail exige un domaine vérifié de type CAMPAIGN ou BOTH, sans solution de repli (`comms.service.ts:674`, `apps/api/src/mail/club-sending-domain.service.ts:291-303`).
- **Prod** :
  - un seul domaine d'envoi existe, celui de SKSR (`clubflow.topdigital.re`, VERIFIED, TRANSACTIONAL) ;
  - les six autres clubs sont des clubs de test, sans aucun membre ;
  - aucune campagne n'a encore été créée.
- **Conséquence** : la première campagne e-mail de SKSR s'afficherait « envoyée » sans qu'aucun mail ne parte ; seul le journal le saurait.
- **Hors d'atteinte** : les autres mails de SKSR passent par l'usage `transactional` ou par l'expéditeur de secours de la plateforme (relances, échéanciers, documents à signer, convocations, bons boutique, alertes de stock, e-mails d'authentification).

Pistes :
- refuser une campagne e-mail sans domaine adapté, avant le passage en SENT ;
- garder la trace des envois et des échecs par destinataire ;
- décider si le domaine de SKSR sert aussi aux campagnes (BOTH). Les campagnes partageraient alors la réputation des mails transactionnels.

### 1.4 « Vérifier » un domaine d'envoi ne vérifie rien (vérifié, prod)

- **Vérification automatique** : le domaine est marqué vérifié sans aucun appel externe dès que `SMTP_AUTO_VERIFY_DOMAIN` est absent (`apps/api/src/mail/providers/smtp-mail.transport.ts:18-22, 114-120`).
- **Contrôle SPF inopérant** : ce contrôle optionnel ne cherche qu'une `ip4:`, ce qui ne marche pas avec Brevo (l. 90-113). La suggestion DNS `v=spf1 ip4:… ~all` est fausse ; avec Brevo, c'est `include:spf.brevosend.com` (`docs/runbooks/add-new-club.md:124`).
- **Prod** : ni `SMTP_AUTO_VERIFY_DOMAIN` ni `SMTP_DNS_SPF_CHECK` ne sont définis.
- **Rejet silencieux** : Brevo rejette sans erreur visible un expéditeur non authentifié (`docs/memory/pitfalls/brevo-sender-domain-must-be-authenticated.md`).
- **Conséquence** : un club qui ajoute son domaine et clique « Vérifier » perdrait tous ses mails, y compris la vérification d'adresse et la réinitialisation de mot de passe. Un domaine « vérifié » passe en effet avant l'expéditeur de secours (`club-sending-domain.service.ts:268-286`).

Piste : interroger Brevo (`GET /v3/senders/domains`) dans `refreshDomain`.

### 1.5 Un membre désactivé lit encore la messagerie (vérifié, prod)

- **Socket** : elle vérifie le JWT et l'appartenance au salon, jamais le statut du membre (`apps/api/src/messaging/messaging.gateway.ts:42-86`). Les requêtes GraphQL, elles, filtrent les membres actifs.
- **Appartenances** : elles ne sont supprimées que depuis l'administration d'un salon (`apps/api/src/messaging/messaging-admin.service.ts:488`).
- **Prod** : `JWT_EXPIRES_IN="7d"`. Un membre radié reçoit donc les nouveaux messages de ses salons tant que son jeton reste valide, jusqu'à sept jours.

Pistes : contrôler le statut à la connexion de la socket et dans `joinRoom`, et retirer le membre de ses salons quand il est désactivé.

## 2. Priorité 2 : ce qui gêne les clubs en prod

### 2.1 Page Messagerie de l'admin inaccessible sans le module Campagnes (vérifié)

- **Garde et menu divergent** : la garde de route exige COMMUNICATION pour tout `/communication…` (`apps/admin/src/lib/club-modules-nav.ts:9`), alors que le menu affiche « Messagerie » dès que MESSAGING est actif (`apps/admin/src/components/nav-config.ts:164-167`).
- **Modules indépendants** : les deux s'activent séparément (`apps/api/src/domain/module-registry/module-dependencies.ts:10`).
- **Conséquence** : un club qui a la Messagerie sans les Campagnes voit le lien, puis la garde le renvoie au tableau de bord (`apps/admin/src/components/ModuleRouteGuard.tsx:14-15`). La modération est inaccessible.
- **Correctif** : une règle `/communication/messagerie` → MESSAGING avant la règle générale, et son test.

### 2.2 Paiement par carte d'un payeur contact : payeur non enregistré (vérifié)

- **Cause** : la session Stripe ne transmet que `paidByMemberId` (`apps/api/src/payments/stripe-checkout.service.ts:92, 187-189`), et le webhook ne lit que ce champ (audit : `payments.service.ts:1002-1018, 1124`).
- **Cas typique** : le parent non adhérent qui paie en ligne la cotisation de son enfant. Le paiement n'a pas de payeur, et la facture affiche « Règlement » sans nom.
- **Déjà géré ailleurs** : la saisie manuelle et le rapprochement des virements renseignent `paidByContactId`.

### 2.3 Bascule admin → portail inopérante en prod (vérifié, prod)

- **Fonctionnement** : le bouton « Personnel » copie la session dans le `localStorage` puis ouvre `VITE_MEMBER_APP_URL`, `/membre` par défaut (`apps/admin/src/lib/member-portal-switch.ts`).
- **Prod** : `VITE_MEMBER_APP_URL` n'est pas défini, et l'admin et le portail sont deux origines qui ne partagent pas le `localStorage`. Le bouton ne mène donc pas au portail connecté.
- **Solution connue** : le sens portail → admin fonctionne, via `#sso=` (`apps/member-portal/src/lib/admin-switch.ts`, lu par `apps/admin/src/main.tsx:22-44`). Il faut faire de même dans l'autre sens.

### 2.4 Renvoi du mail de vérification sans écran (vérifié)

- **Aucun appelant** : la mutation `resendVerificationEmail` et ses documents GraphQL existent (portail `src/lib/documents.ts:80`, mobile `src/lib/documents.ts:127`), mais aucun écran ne les appelle.
- **Conséquence** : passé 48 h, le lien expire et l'utilisateur n'a aucun recours visible.
- **Reste mono-club** : le renvoi et la connexion Google utilisent encore le club `CLUB_ID` de l'environnement (`auth.service.ts:335, 390`). D'après l'audit, la réinitialisation du mot de passe aussi (l. 350).

### 2.5 Ni rebonds, ni plaintes, ni désinscription (vérifié en partie)

- **Désinscription** : les campagnes n'envoient pas d'en-tête `List-Unsubscribe` (vérifié : `comms.service.ts:705-715`).
- **Rebonds et plaintes** : aucun webhook ne les reçoit, et `upsertSuppression` n'a aucun appelant (audit : `club-sending-domain.service.ts:331`).
- **Conséquence** : la réputation du domaine d'envoi partagé se dégrade, y compris pour les mails de vérification et de réinitialisation.

### 2.6 Autres manques relevés

- **Brouillon de cotisation perdu de vue** (plan adhésion, 7.4) :
  - si l'on ferme la fiche avant « Finaliser », le brouillon disparaît, car la fiche ne liste que les factures OPEN ;
  - la garde anti-doublon refuse ensuite d'en créer un autre ;
  - il faut aller le chercher dans Facturation (audit : `apps/admin/src/pages/members/MemberAdhesionPanels.tsx:96-106`, `apps/api/src/membership/membership.service.ts:460-481`).
- **Auteur d'un encaissement non tracé** : le modèle `Payment` n'a pas d'auteur, seule la remise de chèques en garde un (audit).
- **Coût de `ensureCommunityRoom`** : chaque liste de salons relit tous les membres actifs, puis fait un `upsert` séquentiel par membre (audit : `apps/api/src/messaging/messaging.service.ts:109-125, 282-283`). Pour SKSR, cela fait jusqu'à 62 allers-retours avec la base à chaque ouverture.
- **Garde de route absente pour les modules plus récents** : `/evenements`, `/projets`, `/reservations`, `/vie-du-club`, `/blog`, `/billing`, `/settings/payments`, `/settings/pricing-rules`, `/settings/accounting`. Les pages s'ouvrent par URL directe, mais l'API refuse les données : c'est cosmétique.

## 3. Priorité 3 : le filet de tests

- **La CI ne lance aucun test** (vérifié) : aucun workflow de `.github/workflows/` n'appelle `jest` ni `npm test`. Les 1 605 tests unitaires de l'API ne tournent qu'à la main.
- **Le test e2e d'inscription contredit le code** (vérifié) :
  - `apps/api/test/app.e2e-spec.ts:273-274` attend `contactClubId` égal au club et `viewerProfiles` vide ;
  - or `registerContact` rend le contact payeur d'un foyer (`auth.service.ts:297-300`), donc `viewerProfiles` contient ce profil et `contactClubId` reste nul (l. 159) ;
  - d'après le code, ce test ne peut pas passer (il n'a pas été lancé).
- **Parcours sans test** (audit, recherches citées dans les rapports) :
  - **inscription** : `registerContact`, jetons expirés ou altérés, retour Google et fusion ;
  - **payeur contact** : refus d'un contact déjà adhérent, migration contact → membre, connexion avec seulement des profils contact, facturation de bout en bout ;
  - **foyer étendu** : `createHouseholdGroup`, `setFamilyHouseholdGroup`, `setHouseholdGroupCarrierFamily` ;
  - **adhésion** : brouillon de cotisation admin en annuel et en mensuel, frais uniques ;
  - **messagerie** : `MessagingService` (refus d'un membre hors salon), `MemberPseudoService` (suffixe `_1`) ;
  - **e-mails** : `ClubSendingDomainService`, `sendCampaign` ;
  - **socle** : STAFF refusé sur `setClubModuleEnabled`, refus de désactiver MEMBERS ;
  - **planning** : exclusion des créneaux d'un autre groupe, sur une vraie base.

## 4. Fonctionnalités prévues, jamais faites

Ce sont des choix produit, à prioriser avec les clubs.

- **Push natif sur les apps mobiles** (plan général, I.3 ; vérifié) : ni `expo-notifications` ni Firebase dans `apps/mobile/package.json`. Aujourd'hui, les alertes passent par e-mail et par le Web Push du portail.
- **Connexion Google sur mobile** (plan mobile, tâche 9.2) : à coder dans l'app et dans l'API, qui ne redirige que vers le portail web.
- **Ciblage des annonces, sondages et événements par groupe** (I.2) : ces contenus n'ont aucun champ d'audience.
- **AG et réunions de bureau** (K.2) : ni modèle, ni procès-verbal, ni archivage.
- **Cours privés validés par le coach** (K.4) : la réservation ne connaît que BOOKED, WAITLISTED et CANCELLED.
- **Bénévoles et compte rendu d'événement** (K.3) : ils n'existent qu'au niveau d'un projet.
- **Reçu ou attestation de paiement nominatif** (famille étendue) : seule la facture liste les règlements.
- **Remise exceptionnelle par frais unique** (formules, 9.3b) : l'API est prête, mais l'écran n'envoie pas le champ.
- **PayPal** : cité dans le texte de la phase E, absent du code.

## 5. Confort et dette

- **Planning** :
  - pas de mise à jour optimiste : le créneau déplacé revient à sa place jusqu'au rechargement ;
  - les poignées de redimensionnement font 10 à 14 px au lieu de 24.
- **Documentation périmée** :
  - `docs/runbooks/smtp-relay-production.md` décrit Postfix et jamais Brevo ;
  - aucun ADR ne trace le choix de Brevo ;
  - `docs/runbooks/rotate-secrets.md` ne couvre ni `GOOGLE_CLIENT_SECRET` ni `EMAIL_VERIFICATION_SECRET` ;
  - le README mobile est à reprendre.
- **Code mort ou jamais branché** :
  - `apps/mobile/src/lib/admin-switch.ts` n'est plus importé ;
  - `EmailVerifiedGuard` n'est posé nulle part ;
  - le contrôle SPF par `ip4:` est inutile avec Brevo.
- **Seed de démo** : aucun pour le foyer étendu.
- **Plans documentaires** (vie du club, événements, réservation) : jamais écrits, sans effet sur la prod.

## 6. Détail par plan

Tous les plans sont dans `docs/superpowers/plans/`. « Cases » compte les cases non
cochées au moment de l'audit.

| Plan | Cases | Fait | Partiel | Manquant | Obsolète | Processus | À retenir |
|---|---|---|---|---|---|---|---|
| 03-30 admin-adhesion-dynamic-groups | 41 | 26 | 1 | 0 | 1 | 13 | brouillon perdu de vue (2.6) |
| 03-30 familles-membres-rattachement | 30 | 26 | 0 | 0 | 0 | 4 | rien |
| 03-30 formules-cotisation-frais-uniques | 44 | 27 | 0 | 2 | 0 | 15 | e2e du brouillon, remise par frais |
| 03-30 membres-ux-drawer-palette | 26 | 23 | 0 | 0 | 0 | 3 | rien |
| 03-30 plan-general-application-clubflow | 38 | 19 | 5 | 2 | 2 | 10 | push natif, ciblage, AG, cours privés |
| 03-30 socle-backend-general-clubflow | 31 | 16 | 1 | 0 | 0 | 14 | deux scénarios e2e |
| 03-31 contact-payeur-foyer | 33 | 12 | 3 | 4 | 0 | 14 | Stripe (2.2), tests |
| 03-31 envoi-mail-prod-postfix | 22 | 3 | 0 | 0 | 10 | 9 | remplacé par Brevo |
| 03-31 famille-etendue-facturation-partagee | 34 | 15 | 0 | 1 | 1 | 17 | tests des mutations |
| 03-31 gestion-contacts-portail-admin | 28 | 12 | 0 | 0 | 0 | 16 | rien |
| 03-31 inscription-contact-oauth | 47 | 27 | 7 | 2 | 0 | 11 | 1.1, 1.2, tests |
| 03-31 portail-membre-mvp | 34 | 20 | 1 | 0 | 1 | 12 | test d'exclusion des créneaux |
| 04-01 envoi-mails-domaine-club | 17 | 4 | 2 | 1 | 1 | 9 | 1.3, 1.4, 2.5 |
| 04-01 switch-admin-portail | 17 | 7 | 1 | 0 | 1 | 8 | 2.3 |
| 04-04 app-mobile-expo-clubflow | 31 | 16 | 0 | 0 | 0 | 15 | rien |
| 04-04 interface-communication-admin | 16 | 5 | 0 | 0 | 0 | 11 | rien |
| 04-04 modules-admin-reactifs-menus | 29 | 16 | 0 | 0 | 0 | 13 | 2.1 (hors cases) |
| 04-04 planning-calendrier-dnd | 31 | 16 | 2 | 0 | 0 | 13 | optimiste, poignées |
| 04-05 mobile-parite-portail-membre | 40 | 24 | 1 | 1 | 1 | 13 | README, Google mobile |
| 04-06 messagerie-complete-securisee | 52 | 28 | 0 | 2 | 2 | 20 | 1.5 (hors cases), tests |
| **Total** | **641** | **342** | **24** | **15** | **20** | **240** | |

## 7. Découpage proposé

1. **Sécurité de l'inscription et débit** : 1.1 et 1.2, avec leurs tests et un contrôle de l'IP vue en prod. Petit lot, le plus urgent.
2. **Mails fiables** : 1.3 et 1.4 sont petits ; 2.5 demande un webhook Brevo.
3. **Messagerie** : 1.5, 2.1, le coût de `ensureCommunityRoom`, les tests de `MessagingService` et `MemberPseudoService`.
4. **Paiements** : 2.2, l'auteur des encaissements, l'attestation de paiement.
5. **Filet** : un workflow CI qui lance les tests de l'API, et la réparation de l'e2e d'inscription.
6. **Parcours** : 2.3, 2.4 et le brouillon de cotisation.
