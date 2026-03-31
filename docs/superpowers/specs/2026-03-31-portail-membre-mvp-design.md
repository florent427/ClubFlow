# Spécification — Portail membre (MVP)

**Date :** 2026-03-31  
**Statut :** validée par le demandeur (approche MVP vertical slice, 2026-03-31)  
**Périmètre :** nouvelle app `apps/member-portal` + mutations/queries GraphQL dédiées « viewer » dans `apps/api`  
**Références conception :** `ClubFlow_Conception_Provisoire.md` §3.4 (sélection de profil), §3.5 (espace membre — périmètre CMS **hors** MVP, voir §7)

---

## 1. Objectif

Livrer un **portail web membre** utilisable de bout en bout : connexion, sélection de profil, navigation, et **données réelles** pour le profil actif, le planning (si module activé) et la facturation foyer (profil payeur uniquement), en reprenant le **modèle visuel et les tokens** du dossier design Stitch.

---

## 2. Référence design (Stitch)

**Chemin dans le dépôt :** `design stitch/`

| Fichier | Usage pour l’implémentation |
|--------|-----------------------------|
| `DESIGN.md` | Système de design **« The Athletic Editorial »** : hiérarchie des surfaces, règle « no 1px borders », tokens sémantiques (`surface`, `primary`, `secondary`, `on-surface`, etc.), typographie **Inter**, boutons primaires en dégradé, cartes modulaires, composants « Stat-Wing », **Material Symbols** pour les pictogrammes. |
| `code.html` | **Maquette HTML/Tailwind** : structure **sidebar desktop** (logo, carte profil, nav), **barre du haut** (fil « Espace Membre », **sélecteur de profils** circulaires, recherche, notifications), **zone hero** (accueil personnalisé), grille dashboard (programme vidéo, progression, planning, bloc famille & paiements), **bottom nav mobile**. Reprendre les **mêmes intitulés de navigation** et la disposition générale ; adapter les données aux champs API (voir §5–6). |
| `screen.png` | Capture de référence pour alignement visuel. |

**Principes à respecter côté front :** pas de bordures 1px pour structurer les blocs (privilégier surfaces et espacements) ; CTA primaires avec dégradé `primary` → `primary-container` ; barre supérieure en verre (`backdrop-blur`) ; coins `rounded-xl` / `rounded-2xl` / `rounded-3xl` cohérents avec la maquette.

---

## 3. Hors périmètre (MVP explicite)

- Bibliothèque de **contenus pédagogiques** ciblés grade/âge (conception §3.5 : vidéos, PDF, publication admin) : **non inclus** ; la section **« Mon Programme »** du Stitch peut afficher un **état vide** (« Bientôt disponible ») ou être masquée jusqu’à module dédié.
- **Historique détaillé des passages de grade** (timeline complète comme dans la maquette) : **non** sans modèle d’historique ; afficher au minimum le **grade courant** (`GradeLevel`) et placeholders pour le reste.
- **Réservation de cours** (CTA « Réserver un cours » dans la maquette) : **hors MVP** sauf redirection future vers module réservation (phase K) ; bouton **désactivé** ou lien vers une page « À venir » documentée.
- **Notifications push / FCM** : non.
- **OAuth / connexion sociale** (phase L) : non ; login **email / mot de passe** comme aujourd’hui.
- **Site public** (`apps/web-public`) : distinct du portail membre.

---

## 4. Architecture technique

### 4.1 Monorepo

- Créer **`apps/member-portal`** : **Vite + React + TypeScript**, aligné sur `apps/admin` (Apollo Client, `react-router-dom`).
- Variables d’environnement typiques : `VITE_GRAPHQL_HTTP_URL` (même endpoint que l’admin sauf politique CORS distincte si besoin).

### 4.2 API : garde et en-têtes

- Conserver **`Authorization: Bearer <accessToken>`** et **`X-Club-Id: <clubId>`** sur toutes les requêtes métier portail.
- **`X-Club-Id`** doit correspondre au **`clubId`** du **membre actif** (`activeProfileMemberId` dans le JWT). Le front le fixe après `login` / `selectActiveViewerProfile` à partir de `ViewerProfileGraph.clubId` du profil sélectionné.
- Introduire un **garde GraphQL dédié** (ex. `GqlJwtAuthGuard` + `ClubContextGuard` + **`ViewerActiveProfileGuard`**) qui vérifie :
  1. JWT valide ;
  2. `activeProfileMemberId` présent et non vide ;
  3. le membre existe, `status === ACTIVE`, et `member.clubId === req.club.id` ;
  4. `FamiliesService.assertViewerHasProfile(userId, activeProfileMemberId)`.

Les queries « viewer » documentées ci‑dessous utilisent ce garde **à la place** de `ClubAdminRoleGuard`.

### 4.3 Auth (existant)

- `login` → `LoginPayload` avec `accessToken`, `viewerProfiles`.
- `viewerProfiles` (query) pour rafraîchir la liste après navigation.
- `selectActiveViewerProfile(memberId)` pour émettre un JWT dont la charge utile contient le `activeProfileMemberId` choisi.

---

## 5. Modèle exposé « viewer » (GraphQL)

Noms indicatifs ; l’implémentation peut les ajuster tant que la sémantique reste identique.

### 5.1 `viewerMe` (ou `viewerActiveMember`)

**Query**, garde viewer. Retourne des **données non sensibles** du membre actif pour le portail :

- Identité : `firstName`, `lastName`, `photoUrl` ;
- **Grade courant** : libellé / id du `GradeLevel` lié ;
- **Certificat médical** : `medicalCertExpiresAt` (pour badge type Stitch « valide / à renouveler ») ;
- Optionnel : civilité ; **pas** d’exposition systématique de l’adresse complète si politique de confidentialité à resserrer en implémentation (reprendre les mêmes limites que la conception pour l’espace membre enfant).

### 5.2 `viewerUpcomingCourseSlots`

**Query**, garde viewer + **`RequireClubModule(PLANNING)`**.

Règle métier **MVP** : renvoyer les `CourseSlot` du club tels que :

- `startsAt >= now()` (fuseau club ou UTC documenté) ;
- et **(une des conditions)** :
  - le créneau a un `dynamicGroupId` et le membre actif a une ligne **`MemberDynamicGroup`** pour ce groupe ; **ou**
  - le créneau n’a **pas** de `dynamicGroupId` (créneau « club » ou non segmenté — inclus pour ne pas masquer tout le planning).

Trier par `startsAt` asc. Champs utiles : `title`, `startsAt`, `endsAt`, nom du lieu (`Venue`), optionnel prénom/nom du coach (membre coach).

### 5.3 `viewerFamilyBillingSummary`

**Query**, garde viewer + **`RequireClubModule(PAYMENT)`** (ou équivalent module facturation).

- Si le **profil actif** n’est **pas** le payeur du foyer (`ViewerProfileGraph.isPrimaryProfile === false`, équivalent lien famille `PAYER`) : retourner un type vide ou liste vide **sans erreur** (UI : masquer « Famille & Paiements » ou afficher message « Réservé au payeur »).
- Si **payeur** : retourner pour le **foyer** du membre actif (via `FamilyMember`) :
  - liste des factures **`OPEN`** et éventuellement les dernières **`PAID`** (limite paramétrable, ex. 5) avec `label`, `status`, `dueAt`, `balanceCents` / `totalPaidCents` (réutiliser la logique existante des totaux si disponible côté service) ;
  - liste courte des **autres membres** du même foyer (prénom, nom, `photoUrl`) pour le bloc « Membres rattachés ».

Si le membre payeur n’a **pas** de foyer (`familyId` null) : **MVP** — pas de factures agrégées foyer ; section paiements vide ou message explicite (extension ultérieure : factures lignes par `memberId`).

### 5.4 Club

- Réutiliser la query existante **`club`** (avec JWT + `ClubContextGuard`) pour le nom du club et le branding texte du header.

---

## 6. Cartographie écran Stitch → routes MVP

| Élément / maquette `code.html` | Comportement MVP |
|--------------------------------|------------------|
| Sidebar : Tableau de bord | Route `/` : hero + synthèse (grade, certificat) + extraits planning / famille selon modules. |
| Ma Progression | Route `/progression` : grade actuel + texte d’accompagnement ; timeline enrichie **reportée**. |
| Planning | Route `/planning` : liste `viewerUpcomingCourseSlots`. |
| Ma Famille | Route `/famille` : résumé foyer + membres rattachés ; lien paiement si payeur. |
| Paramètres | Route `/parametres` : minimal (déconnexion, infos légales) ; **pas** de duplication complète admin. |
| Profile switcher (header) | Appelle `selectActiveViewerProfile` + invalidation cache Apollo ; avatars depuis `viewerProfiles` (photo si disponible via champ ultérieur ou initiales). |
| Mon Programme (vidéos) | État vide ou section masquée (§3). |
| CTA « Réserver un cours » | Désactivé ou « À venir » (§3). |
| Bottom nav mobile | Miroir des mêmes routes que la sidebar. |

---

## 7. Erreurs et sécurité

- **`activeProfileMemberId` absent** : le front redirige vers l’écran **choix de profil** (sauf si un seul profil : appeler `selectActiveViewerProfile` automatiquement au premier chargement).
- **403 / GraphQL équivalent** si tentative d’accès à un `memberId` non listé dans `viewerProfiles`.
- Aucune mutation métier payante dans le **MVP** côté portail sauf décision produit ultérieure (paiement en ligne reste hors scope ou réutilise un flux Stripe déjà pensé pour le membre — **non requis** pour cette spec MVP lecture seule).

---

## 8. Tests

- **Unitaires** : garde « viewer » (cas membre hors club, mauvais profil, inactif).
- **e2e API** : scénario minimal — authentification test user → `selectActiveViewerProfile` → `viewerMe` → (si seed planning) `viewerUpcomingCourseSlots` ; (si payeur) `vérité` sur `viewerFamilyBillingSummary`.

---

## 9. Dépendances roadmap

- Phase **I** plan général : `apps/member-portal`.
- S’aligne sur la phase **C** « reste à faire » (UI portail type Netflix) ; les **droits fins** sur toutes les queries peuvent être renforcés progressivement, le garde viewer posant la base pour les **nouvelles** surfaces.

---

## 10. Prochaines étapes (hors ce document)

1. Plan d’implémentation détaillé (skill *writing-plans*) : tâches `- [ ]` fichiers, migrations si nécessaire, ordre des PR.
2. Mise à jour de `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-*.md` après livraison vérifiable.

---

*Document rédigé pour implémentation ; le design visuel source de vérité UI reste `design stitch/DESIGN.md` et `design stitch/code.html`.*
