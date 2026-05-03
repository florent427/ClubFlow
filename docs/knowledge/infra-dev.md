# Infrastructure dev local ClubFlow

## Pré-requis

- Node.js 20 LTS
- Docker Desktop (pour Postgres + Mailpit) — l'utilisateur le démarre lui-même
- Git Bash ou PowerShell

## Démarrage initial (premier setup)

```bash
# 1. Postgres + Mailpit
docker compose up -d db mailpit

# 2. API
cd apps/api
npm ci
npx prisma migrate deploy   # OU prisma db push (si migrations cassées)
npm run db:seed             # crée admin@clubflow.local
npm run start:dev           # port 3000

# 3. Admin web
cd ../admin
npm ci
npm run dev                 # port 5173

# 4. Member portal
cd ../member-portal
npm ci
npm run dev                 # port 5174

# 5. Vitrine (Next.js)
cd ../vitrine
npm ci
npm run dev                 # port 5175

# 6. Mobile (optionnel)
cd ../mobile
npm ci
npx expo start              # port Metro 8081
```

## Skill `/restart` pour redémarrer toute la stack

Défini dans `.claude/skills/restart/SKILL.md`.
Tue les processus sur 3000/5173/5174/8081/1025/8025 puis relance API + Admin
+ Portal + Metro Expo + Mailpit en background.

⚠️ **Ne touche pas Docker** (l'utilisateur le gère manuellement).

## Variables d'environnement (dev)

- Racine : `.env.example` (DATABASE_URL, JWT_SECRET, PORT, CORS)
- API : `apps/api/.env.example` (TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, etc.)
- Mobile : `apps/mobile/.env` (`EXPO_PUBLIC_API_BASE` — IP LAN, doit matcher
  `ipconfig | findstr IPv4`)

⚠️ Si l'IP LAN change, mettre à jour `apps/mobile/.env` sinon les apps mobile
ne contactent plus l'API.

## Ports utilisés en dev

| Service | Port | URL |
|---|---|---|
| API NestJS | 3000 | http://localhost:3000/graphql |
| Admin web | 5173 | http://localhost:5173 |
| Portail membre | 5174 | http://localhost:5174 |
| Vitrine Next.js | 5175 | http://localhost:5175 |
| Metro Expo | 8081 | http://localhost:8081 |
| PostgreSQL Docker | 5432 | localhost:5432 |
| Mailpit SMTP | 1025 | (consommé par API) |
| Mailpit UI | 8025 | http://localhost:8025 |

## Docker Compose (services)

- `db` : PostgreSQL 16 alpine
- `mailpit` : capture mails dev (UI sur :8025)
- `postfix` (profile `relay`) : optionnel, pour test relais SMTP

## Workflow modif courant

Cf. `docs/memory/workflows/modif-locale-vers-prod.md` pour le cycle complet.
