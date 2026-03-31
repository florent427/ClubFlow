# Spécification — Inscription contact, email / mot de passe et OAuth (Google puis réseaux sociaux)

**Date :** 2026-03-31  
**Statut :** validée en atelier (brainstorming 2026-03-31)  
**Périmètre :** API `apps/api`, portail `apps/member-portal`, modèle Prisma ; évolution de la spec portail membre sur l’OAuth (cf. section 7)  
**Références :** `docs/superpowers/specs/2026-03-31-portail-membre-mvp-design.md` (MVP initial sans OAuth)

---

## 1. Objectif

Permettre l’**inscription rapide** d’un **contact** (pas encore membre au sens métier distinct) avec :

- **Email + mot de passe**, avec **vérification d’email obligatoire** avant accès complet à l’espace contact ;
- **OAuth** : **Google en v1** ; **Facebook et LinkedIn en v2**, sur la même architecture.

**Accès au portail contact :** « immédiat » signifie **dès que les conditions de confiance sur l’email sont remplies** — OAuth avec email indiqué **vérifié** chez le fournisseur, ou parcours email/mot de passe avec **`emailVerifiedAt` renseigné** après clic sur le lien. **Avant** cette étape (inscription E/M sans clic) : **aucun accès métier** au portail ; le client peut afficher uniquement un écran du type « vérifiez votre boîte mail » (sans JWT donnant accès aux queries contact). Après vérification ou login OAuth valide : session JWT et navigation **espace contact** (écrans et droits à détailler en implémentation). La **séparation contacts / membres** dans l’application est **à venir** ; le modèle introduit dès maintenant une entité **Contact** pour ne pas confondre avec `Member`.

**Fusion de comptes (liaison automatique) :** un seul `User` lorsque l’**email correspond** et est **considéré comme vérifié** des deux côtés (parcours email + clic lien, ou fournisseur OAuth avec indicateur `email_verified` ou équivalent). Ne pas fusionner si la preuve de contrôle de l’email est insuffisante.

---

## 2. Contexte multi-club (MVP vs évolution)

- **Aujourd’hui :** un seul club dans l’instance ; le rattachement du contact au club est **implicite**. **Source de vérité MVP :** une stratégie explicite en implémentation parmi : `CLUB_ID` en variable d’environnement, **première ligne** `Club`, ou **unique** club en base — le tout **compatible** avec les en-têtes et gardes existants (`X-Club-Id` côté portail si le front continue de l’envoyer pour les routes communes ; sinon documenter l’exception MVP).
- **Ensuite :** chaque club aura sa **propre adresse** (nom de domaine dédié ou instance type `sksr.clubflow.app`). **Pas** d’inscription générique sur un `clubflow.app` central pour l’instant ; l’inscription des **clubs** eux-mêmes fera l’objet d’une phase ultérieure.
- La résolution **club** depuis le **host** HTTP sera requise à cette échéance ; le design des entités (`Contact.clubId`) doit l’anticiper.

---

## 3. Décision d’architecture : auth « maison » (recommandée)

**Option retenue :** étendre l’auth existante (Nest, JWT, Prisma, envoi d’emails transactionnels) plutôt qu’un SaaS type Clerk / Auth0 pour la v1.

**Motifs :** cohérence avec le codebase, pas de coût auth additionnel, maîtrise des règles métier (contact vs membre, `X-Club-Id`, fusion). Les options prestataire restent possibles en secours si la charge conformité ou le nombre de fournisseurs augmente fortement.

---

## 4. Modèle de données (Prisma)

### 4.1 `User`

- `email` : unique, inchangé comme identifiant de liaison.
- `passwordHash` : **nullable** (comptes 100 % OAuth).
- `emailVerifiedAt` : `DateTime?` — renseigné après clic sur le lien de vérification (parcours mot de passe) ; pour OAuth, défini selon section 5.3.
- `displayName` : conserver ou compléter selon les besoins du contact.
- Autres champs existants inchangés sauf migration nécessaire.

### 4.2 `Contact` (nouveau)

- `id`, `clubId` (FK `Club`), `userId` (FK `User`), champs d’affichage minimum (alignés sur le produit : prénom, nom, etc.).
- **Vérification email :** la source de vérité est **`User.emailVerifiedAt`** pour les gardes ; éviter un statut `Contact` redondant pour « email en attente » sauf besoin métier distinct (ex. cycle de vie commercial du contact) documenté plus tard.

### 4.3 `UserIdentity` (ou `OAuthAccount`)

- Clés : `userId`, `provider` (enum : `GOOGLE`, puis `FACEBOOK`, `LINKEDIN`), `providerSubject` (identifiant stable chez le fournisseur).
- Contrainte d’unicité sur `(provider, providerSubject)` ; pas de stockage de tokens fournisseur longue durée en clair si évitable.

### 4.4 Vérification email (parcours mot de passe)

- Table ou enregistrements dédiés pour **jeton signer / hash**, **expiration**, **usage unique**, liés à `userId` ou `email`.

---

## 5. Flux utilisateur

### 5.1 Inscription email + mot de passe

1. Saisie email, mot de passe, champs minimum contact.
2. Création `User` (email non vérifié), `Contact` lié au club ; envoi du **mail de vérification** via le service mail existant.
3. Tant que l’email n’est pas vérifié : **pas de JWT** permettant les queries **contact** (ou JWT avec périmètre strictement limité à `verifyEmail` / `resend` — préférence produit : **aucune session métier** jusqu’à clic lien). Possibilité de **renvoyer** le mail (limite de débit).

### 5.2 Connexion email + mot de passe

- Comportement actuel une fois `emailVerifiedAt` renseigné.
- Si non vérifié : erreur métier explicite + incitation à renvoyer le mail.

### 5.3 Google (v1)

1. Redirection vers Google avec `state` (anti-CSRF) ; PKCE si le flux utilisé le permet.
2. Callback : lecture email + indicateur de vérification côté fournisseur.
3. Si l’email est **vérifié côté Google** : création ou réutilisation de `User`, création de `Contact` si nouveau compte, attache de `UserIdentity` ; émission de session (JWT) selon section 6.
4. Si l’email **n’est pas** indiqué comme vérifié : **ne pas** donner un accès contact complet ; message clair (pas de fusion risquée).

### 5.4 Facebook et LinkedIn (v2)

- Même schéma que Google ; ajout des valeurs `provider` et configuration applicative.

### 5.5 Liaison automatique

- OAuth : si un `User` existe avec le même email et **`emailVerifiedAt` déjà renseigné** (vérification E/M ou OAuth antérieur fiable), **ajouter** l’identité OAuth au même `User`.
- **Cas limite :** `User` existant avec même email mais **`emailVerifiedAt` encore null** (inscription E/M sans clic) et OAuth avec **`email_verified` true** : **mettre à jour** `emailVerifiedAt`, **rattacher** `UserIdentity` au **même** `User`, **sans** créer de second compte.
- Inscription mot de passe alors qu’un compte existe déjà avec email vérifié par un autre chemin : réponse produit du type « utilisez la méthode déjà enregistrée » ou flux « définir mot de passe » sécurisé — détail en implémentation sans créer de doublon.

---

## 6. API et gardes

### 6.1 HTTP (OAuth)

- Routes Nest dédiées : entrée du flux OAuth (302) et callback (échange code → profil).
- Après succès : **même convention** que le login GraphQL pour transmettre le JWT au portail (fragment, cookie `httpOnly`, ou code one-shot + mutation `completeOAuthLogin` — un seul mécanisme à choisir et documenter).

### 6.2 GraphQL

- `registerContact` : inscription + envoi mail de vérification.
- `verifyEmail` (token) : met à jour `emailVerifiedAt` ; peut retourner `LoginPayload` (access token + `viewerProfiles` comme aujourd’hui).
- `resendVerificationEmail` : avec limitation de fréquence.
- `login` : enrichi pour le cas « email non vérifié ».

### 6.3 JWT

- `sub` = `userId`.
- `activeProfileMemberId` : uniquement si un **profil membre** est sélectionné (comportement actuel).
- Contact sans membre : `viewerProfiles` vide ; navigation portail = mode **contact** uniquement.

### 6.4 Gardes

- **Garde profil membre actif** : inchangée pour les opérations réservées aux **adhérents** (`viewerMe`, planning membre, etc.).
- **Garde contact authentifié** : JWT valide + pour le parcours mot de passe `emailVerifiedAt` non nul.
- Résolution `clubId` depuis le host en phase multi-club.

### 6.5 Sécurité

- `state`, secrets en variables d’environnement, HTTPS en production, validation des **redirect** post-login (pas d’open redirect).
- **Anti-énumération :** réponses **homogènes** (mêmes messages / délais apparents) sur `registerContact`, `login`, `resendVerificationEmail` lorsque l’email est inconnu ou déjà pris, dans la mesure du raisonnable produit.
- **Limitation de débit :** `login`, `registerContact`, `resendVerificationEmail`, endpoints OAuth (par IP et/ou email) en complément des limites mail anti-spam.
- **Opérations :** procédure de **rotation** des clés OAuth et rappel sur la durée de vie / renouvellement des secrets JWT documentés pour l’équipe.

---

## 7. Impact sur la spec « Portail membre (MVP) »

La spec `2026-03-31-portail-membre-mvp-design.md` indiquait **OAuth hors MVP (phase L)**. La présente spec **étend** ce périmètre : OAuth Google en v1 fonctionnelle côté inscription / connexion contact ; Facebook / LinkedIn en v2. Les **principes** du portail (JWT, `X-Club-Id`, gardes viewer) restent valides ; les gardes **contact** complètent le modèle quand il n’y a pas de profil membre actif.

---

## 8. Tests et observabilité

- Tests unitaires : règles de **fusion**, refus si email non vérifié, expiration des jetons de vérification.
- E2E : parcours inscription → vérification → login ; callback OAuth avec **mock** du provider si possible.
- Logs sans données sensibles (pas de tokens en clair).

### 8.1 Critères d’acceptation (cibles de test)

| Scénario | Résultat attendu |
|----------|------------------|
| Inscription E/M | `User` + `Contact` créés ; email envoyé ; **pas** d’accès queries contact sans `emailVerifiedAt` |
| Clic lien vérification | `emailVerifiedAt` défini ; possibilité d’émettre **LoginPayload** |
| Login E/M avant vérif | Erreur métier typée ; pas de contournement des gardes |
| Google, email `verified` | Compte + identité ; JWT espace contact |
| Google, email non `verified` | Pas d’accès contact complet ; pas de fusion risquée |
| OAuth avec User existant, email déjà vérifié | Une seule identité OAuth ajoutée au même `User` |
| OAuth avec User E/M non vérifié, Google `verified` | Mise à jour `emailVerifiedAt` + lien identité, un seul `User` |
| `resendVerificationEmail` abusif | Rate limit déclenché |
| Inscription / login | Pas d’énumération évidente d’emails (messages homogènes) |

---

## 9. Hors périmètre (cette spec)

- Inscription / onboarding des **clubs** sur une plateforme centrale.
- Détails UI finaux du portail contact (maquettes Stitch peuvent être réutilisées ou adaptées en implémentation).
- Gestion avancée des **doublons** métier (homonymes) au-delà de la clé email + contrôle de vérification.

---

## 10. Prochaine étape (hors brainstorming code)

Rédiger un **plan d’implémentation** (tickets ordonnés : migrations Prisma, auth, mails, portail, tests) via le skill *writing-plans*, après validation explicite du fichier de spec par le demandeur.
