---
name: restart
description: Redémarre tous les serveurs de dev de ClubFlow (API NestJS sur 3000, admin web sur 5173, member-portal sur 5174, vitrine Next.js sur 5175, landing Next.js sur 5176, Metro Expo sur 8081, Mailpit sur 1025/8025 si installé). À utiliser quand l'utilisateur demande "redémarre les serveurs", "restart all", "/restart", ou quand un changement nécessite un redémarrage propre de la stack dev.
---

# /restart — Redémarrage propre de la stack dev ClubFlow

## Quand utiliser

L'utilisateur a besoin de redémarrer TOUS les serveurs de développement
en parallèle (souvent après un changement de schema Prisma, un changement
d'env vars, ou un état corrompu de Metro / NestJS hot-reload).

## Stack à redémarrer

| Service | Port(s) | Commande |
|---|---|---|
| **API NestJS** | 3000 | `cd apps/api && npm run start:dev` |
| **Admin web (Vite)** | 5173 | `cd apps/admin && npm run dev` |
| **Member portal (Vite)** | 5174 | `cd apps/member-portal && npm run dev` |
| **Vitrine (Next.js)** | 5175 | `cd apps/vitrine && npm run dev` |
| **Landing (Next.js)** | 5176 | `cd apps/landing && npm run dev` |
| **Metro Expo (mobile)** | 8081 | `cd apps/mobile && npx expo start --clear` |

**À NE PAS toucher** :
- **Docker Desktop** : l'utilisateur le lance lui-même. Si Docker
  n'est pas joignable (`docker ps` plante), s'arrêter immédiatement et
  demander à l'utilisateur de le démarrer — ne JAMAIS tenter de
  l'ouvrir nous-mêmes (Start-Process Docker Desktop, etc.).
- **Postgres / Mailpit** : containers Docker compose, gérés par
  Docker Desktop. Ne pas tenter `docker compose up`, ne pas killer
  le port 1025 (= Mailpit container, auto-redémarré sinon).
- **Tout autre container Docker** existant.

## Procédure

### 1. Tuer les processus existants sur les ports dev

Sur Windows / PowerShell, identifier les processus listening sur les
ports dev puis les killer :

```powershell
$ports = @(3000, 5173, 5174, 5175, 5176, 8081)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    try {
      Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
      Write-Host "Killed PID $($conn.OwningProcess) on port $port"
    } catch {
      Write-Host "Could not kill PID $($conn.OwningProcess) on port $port"
    }
  }
}
```

Ou en Bash via `netstat` + `taskkill` :

```bash
for port in 3000 5173 5174 5175 5176 8081; do
  pid=$(netstat -ano | grep "LISTENING" | grep ":$port " | awk '{print $NF}' | head -1)
  if [ -n "$pid" ]; then
    taskkill //F //PID $pid 2>&1 | head -1
  fi
done
```

### 2. Démarrer chaque service en background

**Important** : `run_in_background: true` sur chaque commande Bash, sinon
le terminal bloque sur le premier serveur et les suivants ne démarrent
pas. Les sorties sont redirigées vers des fichiers de log lus à la
demande via Read ou Monitor.

Ordre recommandé (pour que les apps web aient l'API dispo au démarrage) :

1. **API d'abord** (port 3000) — le plus long à boot (~30-50s avec Prisma)
2. **Admin + Portal en parallèle** (5173, 5174) — Vite démarre en ~1-2s
3. **Mailpit** (si installé) — instantané
4. **Metro Expo** en dernier — bundle compile au premier scan QR

### 3. Vérification

Après ~60 secondes (laissant le temps à NestJS de finir son boot
Prisma + GraphQL schema generation), vérifier que les serveurs sont up :

```bash
# API GraphQL
curl -s http://localhost:3000/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{__typename}"}'

# Admin web (HTML index)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# Portal web
curl -s -o /dev/null -w "%{http_code}" http://localhost:5174

# Metro
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status
```

Tous doivent renvoyer `200` (ou contenu valide pour GraphQL).

## Notes spécifiques

- **Mailpit** n'est pas obligatoirement installé. Si `where.exe mailpit`
  ne renvoie rien, **skipper sans erreur** — l'API tombe en mode log
  console pour les emails dev.
- **Metro `--clear`** vide le bundler cache. Utile après un changement
  de deps mais ralentit le premier rebuild de ~5s. Inclure systématiquement
  pour éviter les caches pourris (l'utilisateur a déjà débuggé ce cas).
- **NestJS `--watch`** redémarre auto sur changement TS. Si on relance
  alors qu'il tourne déjà avec watch, il se redémarrera lui-même au
  prochain save — pas besoin de kill+restart sauf si bloqué.
- L'**IP LAN** dans `apps/mobile/.env` (`EXPO_PUBLIC_API_BASE`) doit
  correspondre à `ipconfig | findstr IPv4` du PC. Si elle a changé,
  pas de restart Metro mais update du `.env` requis.

## Sortie attendue

Après exécution, confirmer à l'utilisateur :
- Liste des services redémarrés avec leur PID + port
- Les services sautés (ex. Mailpit non installé)
- Les éventuelles erreurs (port déjà utilisé par un process système…)
- Le temps total estimé avant que tout soit prêt (~60s)
