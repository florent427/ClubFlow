# Runbook — Accès aux données ClubFlow depuis un agent IA

> Comment un agent IA (ou tout client machine) lit les données d'un club
> via l'API GraphQL, en respectant l'authentification, les rôles et
> l'isolation multi-tenant. Basé sur l'audit d'exposition de l'API du
> 2026-07-17.

---

## 1. Principe de sécurité

L'API ClubFlow est **un seul endpoint GraphQL** :

```
https://api.clubflow.topdigital.re/graphql          # prod
https://staging.api.clubflow.topdigital.re/graphql  # staging
```

Trois couches protègent les données :

| Couche | Mécanisme | Ce qu'elle garantit |
|---|---|---|
| **Authentification** | JWT signé (HS256), obtenu par `login` | L'appelant est un utilisateur connu |
| **Rôle** | `ClubAdminRoleGuard` (CLUB_ADMIN / BOARD / TREASURER) | Seul le back-office lit les données perso (inscrits, contacts, membres) |
| **Tenant** | Header `x-club-id` + guard de rôle scopé au club | Un token n'accède qu'aux clubs où l'utilisateur a un rôle (pas de cross-tenant) |

Conséquences pratiques :

- **Sans JWT** : seules les vues publiques sanitisées sont accessibles
  (landing vitrine, événements publics) — **aucune donnée d'inscrit, de
  contact ou de membre**.
- **Avec un JWT back-office** : accès complet aux données du/des club(s) où
  l'utilisateur a un rôle back-office, et **de ces clubs uniquement**.
- Le header `x-club-id` **n'est pas** la frontière de confiance : mettre
  l'id d'un club où l'utilisateur n'a pas de rôle renvoie `FORBIDDEN`.

---

## 2. Prérequis

1. **Un compte de service dédié** avec un rôle back-office (`CLUB_ADMIN`
   recommandé, ou moindre privilège selon les données visées) dans le club
   cible. **Ne pas** réutiliser un compte humain ni un SUPER_ADMIN.
2. **Ses identifiants** (email + mot de passe), stockés dans un coffre à
   secrets / variables d'environnement de l'agent — **jamais en dur** dans
   le code ou le prompt.
3. **Le `clubId`** (UUID) du club cible — récupérable en une fois (étape 0).

---

## 3. Méthodologie étape par étape

### Étape 0 — Récupérer le `clubId` (anonyme, une seule fois)

```bash
curl -s https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query{ publicClub(slug:\"<slug-du-club>\"){ id name slug } }"}'
```

Réponse :

```json
{ "data": { "publicClub": { "id": "<uuid-du-club>",
                            "name": "Mon Club", "slug": "mon-club" } } }
```

Le `id` renvoyé est le `clubId` à mettre dans le header `x-club-id`. Il est
stable — l'agent peut le mettre en config.

### Étape 1 — S'authentifier (login → JWT)

```bash
curl -s https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation{ login(input:{email:\"agent@ton-club.fr\",password:\"********\"}){ accessToken } }"}'
```

Réponse :

```json
{ "data": { "login": { "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." } } }
```

- Le `accessToken` est un **JWT valable 7 jours** (`JWT_EXPIRES_IN=7d`).
- **Il n'y a pas de refresh token** : l'access token *est* la session.
  Quand il expire (401), l'agent doit **se re-loguer**.
- `login` est rate-limité à 20/min/IP.

### Étape 2 — Lire les données (JWT + `x-club-id`)

```bash
curl -s https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'x-club-id: <clubId>' \
  -d '{"query":"query{ clubEvents{ id title startsAt registrations{ displayName slotTitles status note } } }"}'
```

---

## 4. Données accessibles (back-office)

| Donnée | Query GraphQL | Champs utiles |
|---|---|---|
| **Événements + inscrits** | `clubEvents` | `title`, `registrations { displayName slotTitles status note memberId contactId }` |
| **Inscrits d'un événement JPO** | `clubEvents` | idem — inclut les visiteurs publics devenus `Contact` |
| **Contacts (prospects, JPO…)** | `clubContacts` | `firstName lastName email phone` |
| **Membres (adhérents)** | `clubMembers` | `firstName lastName email` |

> ⚠️ Ces queries exigent le module concerné activé (`EVENTS`, etc.) et le
> rôle back-office. Le module `registrations` d'un événement **n'est plus**
> exposé au portail membre (correctif RGPD du 2026-07-17) : seul le
> back-office voit le roster nominatif complet.

Exemples de requêtes complémentaires :

```graphql
# Tous les contacts du club
query { clubContacts { id firstName lastName email phone createdAt } }

# Tous les membres
query { clubMembers { id firstName lastName email status } }
```

---

## 5. Bonnes pratiques de sécurité

- **Moindre privilège** : un compte de service par usage, avec le rôle
  minimal nécessaire. Éviter SUPER_ADMIN (accès transverse à *tous* les
  clubs).
- **Secrets hors code** : identifiants et token dans un coffre / env vars
  chiffrées. Ne jamais les mettre dans un prompt, un repo, un log.
- **Un club par appel** : le header `x-club-id` cible un club. Pour
  plusieurs clubs, itérer avec le `clubId` de chacun (le token ne débloque
  que ceux où l'utilisateur a un rôle).
- **Gestion du 401** : re-login automatique quand le token expire (pas de
  refresh token).
- **Respecter les limites** : les endpoints publics sont rate-limités
  (login 20/min, inscription publique 8/min, etc.). La plupart des
  endpoints authentifiés ne le sont pas, mais **certains le sont** quand ils
  déclenchent un appel externe coûteux — par exemple
  `viewerStartPaymentScheduleSetup` (10/min), qui ouvre une session Stripe.
  Ne jamais boucler sans temporisation.
- **RGPD** : les inscrits JPO et contacts sont des données personnelles
  (parfois de mineurs). Ne traiter que le strict nécessaire, ne pas
  exfiltrer ni recomposer d'annuaire hors finalité.

---

## 6. Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `errors: Unauthorized` (401) | Token absent / expiré | Re-login (étape 1) |
| `errors: FORBIDDEN` | `x-club-id` d'un club sans rôle, ou module désactivé | Vérifier le `clubId` + le rôle back-office + le module |
| `ThrottlerException: Too Many Requests` | Trop de requêtes sur endpoint public | Ralentir ; réservé aux endpoints publics |
| `data` vide sur `clubEvents` | Header `x-club-id` manquant | Ajouter `-H 'x-club-id: <clubId>'` |
| HTTP 200 mais `errors` non vide | Normal en GraphQL — les erreurs sont dans le corps, pas le code HTTP | Toujours inspecter `errors` dans la réponse |

---

## 7. Note — l'agent interne « Aiko »

L'agent IA intégré à ClubFlow (Aiko) passe **par ces mêmes guards** : ses
outils (`clubEvents`, `clubContacts`, `clubMembers`…) effectuent un appel
GraphQL interne authentifié (JWT + `x-club-id`), et le catalogue d'outils
est filtré par les rôles de l'utilisateur dans le club courant. Il n'existe
**aucun header magique ni bypass** : un agent ne lit que ce que son
utilisateur a le droit de lire.

---

_Dernière mise à jour : 2026-07-17 — créé suite à l'audit d'exposition de
l'API (correctifs roster viewer + rate-limit public)._
