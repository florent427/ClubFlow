# Runbook — Redémarrage stack dev

> Référencé par le skill `/restart`.

## Quand l'utiliser

- Après un changement de schema Prisma
- Après modif d'env vars
- État corrompu de Metro / NestJS hot-reload
- "Ça marche plus, j'sais pas pourquoi"

## Stack à redémarrer

| Service | Port(s) | Commande |
|---|---|---|
| **API NestJS** | 3000 | `cd apps/api && npm run start:dev` |
| **Admin web (Vite)** | 5173 | `cd apps/admin && npm run dev` |
| **Member portal (Vite)** | 5174 | `cd apps/member-portal && npm run dev` |
| **Vitrine Next.js** | 5175 | `cd apps/vitrine && npm run dev` |
| **Metro Expo (mobile)** | 8081 | `cd apps/mobile && npx expo start --clear` |
| **Mailpit** | 1025 (SMTP) + 8025 (web UI) | `mailpit` (si installé) |

**À NE PAS toucher** : PostgreSQL (5432), Redis si présent, Docker (l'utilisateur
le gère manuellement).

## Procédure

### 1. Tuer les processus existants

```bash
for port in 3000 5173 5174 5175 8081 1025 8025; do
  pid=$(netstat -ano | grep "LISTENING" | grep ":$port " | awk '{print $NF}' | head -1)
  if [ -n "$pid" ]; then
    taskkill //F //PID $pid 2>&1 | head -1
  fi
done
```

### 2. Démarrer chaque service en background

⚠️ `run_in_background: true` sur chaque commande Bash. Sortie redirigée vers
fichiers de log lus à la demande.

Ordre recommandé :
1. **API** (port 3000) — le plus long à boot (~30-50s avec Prisma)
2. **Admin + Portal + Vitrine** en parallèle (5173, 5174, 5175)
3. **Mailpit** (si installé) — instantané
4. **Metro Expo** en dernier

### 3. Vérification (~60s après start)

```bash
# API GraphQL
curl -s http://localhost:3000/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{__typename}"}'

# Admin web
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# Portal web
curl -s -o /dev/null -w "%{http_code}" http://localhost:5174

# Vitrine
curl -s -o /dev/null -w "%{http_code}" http://localhost:5175

# Metro
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status
```

Tous doivent renvoyer `200` (ou contenu valide pour GraphQL).

## Notes

- **Metro `--clear`** : vide le bundler cache. Inclure systématiquement.
- **NestJS `--watch`** : redémarre auto sur changement TS.
- L'**IP LAN** dans `apps/mobile/.env` doit matcher `ipconfig | findstr IPv4`.
