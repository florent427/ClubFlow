---
name: restart-clubflow
description: Arrête les serveurs de dev ClubFlow (ports 3000 / Vite admin 5173 / portail membre 5174), remonte Docker (db + relais SMTP optionnel), relance l’API Nest, l’admin Vite et le portail membre. Utiliser quand l’utilisateur demande de redémarrer ClubFlow, de libérer les ports, ou d’exécuter le skill restart_clubflow / restart-clubflow.
---

# Redémarrage complet ClubFlow (`restart-clubflow`)

## Limite IDE

**Fermer tous les terminaux Cursor** : il n’existe pas d’API fiable pour que l’agent ferme les onglets Terminal. Indiquer à l’utilisateur :

- **Palette** : « Terminal: Kill All Terminals » (ou fermer manuellement les onglets), **ou**
- S’appuyer sur l’**arrêt des processus** (étapes ci‑dessous) : les anciens terminaux afficheront des erreurs si le PID n’existe plus ; l’utilisateur peut alors les fermer.

**Ouvrir de nouveaux terminaux** : après la relance, l’agent lance les commandes en **arrière-plan** via l’outil d’exécution (équivalent pratique à de nouvelles sessions).

## Préambule obligatoire

1. Racine du dépôt : `ClubFlow` (où se trouvent `docker-compose.yml`, `apps/api`, `apps/admin`, `apps/member-portal`).
2. Shell : **PowerShell** sur Windows (commandes ci‑dessous).

## Étape 1 — Libérer les ports de développement

Ne **pas** tuer tous les processus Node du système : uniquement les **écouteurs** sur les ports utilisés par ClubFlow.

Ports cibles habituels :

| Port | Rôle |
|------|------|
| `3000` | API Nest |
| `5173` | Vite **admin** (`apps/admin`) |
| `5174` | Vite **portail membre** (`apps/member-portal`, fixé dans `vite.config.ts`) |
| `5175`–`5180` | Vite si décalage automatique (port déjà pris) |

**Diagnostic `ERR_CONNECTION_REFUSED` sur `http://localhost:5174/` :** aucun `npm run dev` ne tourne dans `apps/member-portal` — lancer l’étape 3 (portail) ou un terminal dédié (voir ci‑dessous). Même logique pour 5173 si l’admin est « inaccessible ».

**PowerShell :** ne pas enchaîner avec `&&` (non supporté selon versions). Utiliser `;` ou des lignes séparées, ex. `Set-Location C:\Users\flore\ClubFlow\apps\member-portal ; npm run dev`.

Pour chaque port, identifier le PID puis l’arrêter :

```powershell
netstat -ano | findstr ":3000.*LISTENING"
netstat -ano | findstr ":5173.*LISTENING"
netstat -ano | findstr ":5174.*LISTENING"
# … répéter pour 5175–5180 si besoin
```

```powershell
Stop-Process -Id <PID> -Force -ErrorAction SilentlyContinue
```

Alternative (souvent plus lente sur certaines machines) :

```powershell
Get-NetTCPConnection -LocalPort 3000,5173,5174,5175,5176,5177,5178 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

**Ne pas** arrêter le port **2525** (mapping local vers Postfix) ni **5432** (Postgres) sauf intention explicite de tout couper Docker.

## Étape 2 — Docker (base + relais SMTP profil `relay`)

Depuis la racine du dépôt :

```powershell
cd C:\Users\flore\ClubFlow
docker compose --profile relay up -d db postfix
docker compose --profile relay ps
```

- **Sans relais Postfix** (DB seule, ex. Mailpit uniquement pour les mails) :

```powershell
docker compose up -d db
```

**Mailpit** : si un conteneur nommé existe déjà (hors compose racine), `docker start mailpit` ; ne pas l’inventer si l’utilisateur ne l’utilise pas.

## Étape 3 — Relancer l’API, l’admin et le portail membre

En **arrière-plan** (ne pas bloquer le chat) — **trois** terminaux / trois commandes lancées en fond :

```powershell
cd C:\Users\flore\ClubFlow\apps\api
npm run start:dev
```

```powershell
cd C:\Users\flore\ClubFlow\apps\admin
npm run dev
```

```powershell
cd C:\Users\flore\ClubFlow\apps\member-portal
npm install
npm run dev
```

(`npm install` dans `member-portal` seulement si `node_modules` absent.)

Attendre quelques secondes, puis vérifier :

- API : requête POST GraphQL `http://localhost:3000/graphql` avec body `{"query":"{ __typename }"}` (ou équivalent).
- Admin : URL affichée par Vite (souvent `http://localhost:5173/`).
- **Portail membre** : `http://localhost:5174/` (confirmé par la sortie Vite « Local: … »). Variables optionnelles : `VITE_GRAPHQL_HTTP`, `VITE_ADMIN_APP_URL` — voir `apps/member-portal/README.md`.

## Étape 4 — Script optionnel

Pour **arrêt par ports + compose uniquement** (sans npm), l’utilisateur ou l’agent peut exécuter :

```powershell
.\.cursor\skills\restart-clubflow\scripts\restart-clubflow.ps1
```

Paramètre `-NoRelay` : `docker compose up -d db` seulement. Voir commentaires dans le script.

## Message type à l’utilisateur en fin de flux

Rappeler les URL (**API 3000**, **admin 5173**, **portail membre 5174**), le fait que **Mailpit** reste sur `8025` s’il tourne, et pour la prod locale du relais : **Postfix** en `127.0.0.1:2525` (voir `docs/runbooks/smtp-relay-production.md`).
