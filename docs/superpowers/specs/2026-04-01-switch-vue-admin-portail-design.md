# Spécification — Bascule Admin ↔ Espace personnel (portail membre)

**Date :** 2026-04-01  
**Statut :** validée par le demandeur (approche B : appli `member-portal` distincte, même origine cible)  
**Périmètre :** navigation entre `apps/admin` et `apps/member-portal` avec session cohérente ; complète le portail MVP (`2026-03-31-portail-membre-mvp-design.md`)  
**Références conception :** `ClubFlow_Conception_Provisoire.md` §3.4 (profils), back-office vs espace membre

---

## 1. Objectif

Permettre à un **utilisateur club** qui cumule **rôle back-office** (admin / bureau / trésorerie) et **au moins un profil membre** lié au même `User` de :

- depuis le **back-office** (`apps/admin`) : passer à l’**espace personnel** (portail membre) via le contrôle existant **Admin / Personnel** dans le header ;
- depuis le **portail membre** (`apps/member-portal`) : revenir au **back-office** via un contrôle miroir (**Admin / Personnel** ou équivalent dans le shell du portail).

La **source de vérité** des droits reste l’**API** (`ClubAdminRoleGuard` pour l’admin, garde viewer + profil actif pour le portail). Les boutons ne font qu’**orienter** l’utilisateur vers l’application adaptée ; ils ne dérogent pas aux contrôles serveur.

---

## 2. Contexte technique (existant)

- **Authentification :** mutation `login` ; JWT avec `sub`, `email`, `activeProfileMemberId` optionnel.
- **Admin :** requêtes protégées par `ClubMembership` avec rôle `CLUB_ADMIN`, `BOARD` ou `TREASURER` (`ClubAdminRoleGuard`).
- **Portail :** requêtes `viewer*` avec `activeProfileMemberId` et alignement `X-Club-Id` / club du membre actif.
- **UI admin :** `AdminLayout` affiche déjà deux boutons **Admin** et **Personnel** (`roleTab`) mais sans effet fonctionnel — ce spec définit le comportement à brancher.

---

## 3. Contrainte d’origine (session partagée)

Les deux apps étant des **builds Vite distincts**, un changement d’URL vers **une autre origine** (ex. deux ports en local sans proxy) empêche le partage de `localStorage` : le portail ne verrait pas le token stocké par l’admin.

**Décision retenue :** viser un **déploiement sous une seule origine** (chemins du type `/admin` et `/membre`, ou équivalent derrière reverse proxy), de sorte que **le même mécanisme de stock-age du JWT** (clé(s) existante(s) dans chaque app — à harmoniser si besoin) soit **commun** après navigation.

- **Développement :** documenter une configuration type (proxy unique, ou script qui sert les deux apps derrière un même hôte/port) ; éviter de passer le token dans l’URL ou en query string.
- **Hors périmètre immédiat :** refonte auth par cookie HttpOnly uniquement pour ce besoin ; si plus tard les origines restent séparées en production, un flux **handoff** (code à usage unique) pourra être spécifié à part.

---

## 4. Comportement fonctionnel

### 4.1 Depuis le back-office (bouton « Personnel »)

- Si l’utilisateur **n’a aucun** profil viewer (`viewerProfiles` vide côté session post-login, ou équivalent revalidé par une requête légère si nécessaire) : bouton **Personnel** **désactivé** + texte d’aide du type : *Aucun profil membre lié à ce compte. Contactez votre club.* (aligné sur le message portail existant).
- Sinon : **navigation** vers l’URL de base du **portail membre** (même origine), en conservant le JWT actuel ; le profil actif reste celui indiqué par `activeProfileMemberId` dans le token (comportement identique à une reconnexion avec ce token).
- Le bouton **Admin** reste l’état « vue courante » lorsque l’utilisateur est dans l’admin (pas de redirection).

### 4.2 Depuis le portail membre (bouton « Admin »)

- Afficher le passage vers l’admin **uniquement** si l’utilisateur a un **rôle back-office** sur le club courant (voir §5 pour la découverte côté client).
- Si non éligible : ne pas afficher le toggle « Admin » (ou l’afficher désactivé avec courte explication — préférence produit : **masqué** pour réduire le bruit).
- Si éligible : **navigation** vers l’URL de base du **back-office** (même origine), avec le **même** JWT ; le club actif côté admin doit rester cohérent avec le contexte déjà utilisé (ex. `X-Club-Id` / club sélectionné — réutiliser les conventions actuelles de `apps/admin`).

### 4.3 Cohérence « Personnel » sur le portail

- Lorsque l’utilisateur est sur le portail, l’onglet ou l’état **Personnel** correspond à la vue membre (équivalent du bouton déjà prévu dans la maquette / shell portail — ajout ou réutilisation d’un emplacement header cohérent avec l’admin).

---

## 5. Données nécessaires (API / client)

Pour afficher ou masquer **Admin** depuis le portail sans deviner côté client :

- Exposer une information **auth safe** du type : « ce `User` a-t-il un rôle admin club sur le `clubId` courant ? » — soit en **étendant** une query déjà appelée au chargement (ex. `viewerMe` ou équivalent), soit via une **petite query dédiée** après authentification viewer.
- Ne pas s’appuyer sur l’email ou des heuristiques front : la réponse doit refléter **`ClubMembership`** (rôles autorisés par `ClubAdminRoleGuard`).

Détails d’implémentation (nom exact du champ, resolver) : laissés au **plan d’implémentation** ; ce spec impose le **contrat fonctionnel**.

---

## 6. Sécurité

- Aucun **secret** (JWT, refresh) dans l’URL, fragment ou `referrer` sensible.
- Les anciennes protections (**CORS**, en-têtes club, guards) inchangées par ce flux.
- Un utilisateur **sans** rôle admin ne doit pas voir de CTA actif vers le back-office ; tenter d’ouvrir l’admin directement reste soumis aux guards API (échec propre / redirection login selon politique actuelle).

---

## 7. Tests et critères d’acceptation

- Utilisateur **admin + membre lié** : bascule admin → portail → admin sans re-login, données cohérentes (club, profil actif).
- Utilisateur **admin sans membre lié** : **Personnel** désactivé + message clair.
- Utilisateur **membre sans rôle admin** : pas de bascule vers l’admin (ou désactivé explicitement si produit le impose).
- **E2E** (optionnel mais souhaitable) : scénario minimal sur environnement **mono-origine** de test.

---

## 8. Hors périmètre

- Refonte complète **cookie** / **refresh token** / SSO.
- Handoff multi-origines sans proxy (sauf décision ultérieure).
- Synchronisation fine des **deux états UI** (search admin, filtres) entre les apps — seule la **session** et le **club** doivent rester alignés avec les règles existantes.

---

## 9. Suivi

- **Plan d’implémentation :** à produire via le skill *writing-plans* (chemins `apps/admin`, `apps/member-portal`, `apps/api` selon §5).
- **Documentation utilisateur / README :** mettre à jour les instructions **dev** (proxy / même origine) lors de l’implémentation.
