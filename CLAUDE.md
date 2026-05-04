# CLAUDE.md — ClubFlow

> Orchestrateur léger pour Claude (et tout assistant IA) sur ce repo.
> Ce fichier = **carte de la mémoire structurée**. Détails techniques
> complets dans `docs/{knowledge,runbooks,memory}/`.

---

## 🚀 Démarrage rapide

**Tu reprends une session sans contexte ?** Lis dans cet ordre :

1. Ce fichier (carte mentale)
2. [docs/memory/INDEX.md](docs/memory/INDEX.md) — tout ce qu'on a déjà
   appris (pitfalls + ADR + workflows)
3. [docs/knowledge/stack.md](docs/knowledge/stack.md) — la stack en 1 page

Pour tout le reste : **chercher dans la mémoire au lieu de redécouvrir.**

---

## 📚 Map de la mémoire

```
docs/
├── knowledge/          ← état statique du système (stack, infra, conventions)
│   ├── stack.md              versions tranchées
│   ├── repo-structure.md     arborescence
│   ├── conventions.md        Conventional Commits, branches, scopes
│   ├── infra-prod.md         Hetzner, services, tuning PG
│   ├── infra-network.md      DNS, Caddy, domaines
│   ├── infra-dev.md          ports, docker-compose, /restart
│   ├── ssh-windows.md        ⚠️ binaire OpenSSH Windows
│   ├── auth-secrets.md       où sont les secrets
│   ├── backup-strategy.md    pg_dump + Storage Box
│   └── contacts-ids.md       owner, IDs Hetzner/Cloudflare/OVH
│
├── runbooks/           ← procédures opérationnelles step-by-step
│   ├── deploy.md             pipeline auto + manuel
│   ├── release.md            release-please workflow
│   ├── restart-dev.md        kill ports + restart
│   ├── restore-env.md        recréer les .env perdus
│   ├── restore-db.md         pg_restore depuis dump
│   ├── rollback.md           revert deploy fautif
│   ├── unban-ip.md           débannir fail2ban
│   ├── rotate-secrets.md     rotation sécurité
│   ├── add-new-club.md       onboarder un nouveau club
│   ├── add-new-app.md        ajouter une app au monorepo
│   └── seed-vitrine-pages.md créer pages vitrine + flush cache
│
└── memory/             ← apprentissages cumulés (le vrai cerveau)
    ├── INDEX.md              ⚠️ auto-généré par bin/memory-index
    ├── pitfalls/             "ne refait plus l'erreur de..."
    ├── decisions/            ADR (rationale des choix tranchés)
    └── workflows/            parcours métier de bout en bout
```

---

## ⚡ Skills custom

| Skill | Quoi | Quand |
|---|---|---|
| [`/restart`](.claude/skills/restart/SKILL.md) | Kill + restart stack dev | Après changement schema, env vars, ou stack figée |
| [`/deploy`](.claude/skills/deploy/SKILL.md) | Deploy main → prod (manuel) | Si pipeline auto KO |
| [`/release`](.claude/skills/release/SKILL.md) | Release-please cycle | Setup initial OU release manuelle d'urgence |
| [`/add-pitfall`](.claude/skills/add-pitfall/SKILL.md) | Ajouter un piège à `memory/pitfalls/` | Après debug d'un bug non-évident |
| [`/add-decision`](.claude/skills/add-decision/SKILL.md) | Ajouter un ADR à `memory/decisions/` | Après un choix techno tranché |
| [`/learn`](.claude/skills/learn/SKILL.md) | Capitaliser tout ce qu'on a appris dans la session | Fin de session, gros fix, onboarding |
| [`/dream`](.claude/skills/dream/SKILL.md) | Cycle de consolidation mémoire (gating auto si rien à apprendre) | Le soir avant de dormir |

---

## 🔥 Règles d'or (à suivre toujours)

1. **JAMAIS** `git commit` sans demande explicite de Florent
2. **JAMAIS** `git push --force` sur main
3. **JAMAIS** skip pre-commit hooks (`--no-verify`) sans accord explicite
4. **JAMAIS** `git add -A` sur le serveur prod (embarque les `.env`)
5. **JAMAIS** retry SSH en boucle si ça échoue (fail2ban → ban 10 min)
6. **TOUJOURS** chercher dans `docs/memory/pitfalls/` avant de redébugger un truc
7. **TOUJOURS** utiliser `"/c/Windows/System32/OpenSSH/ssh.exe"` pour SSH
   (cf. [ssh-windows.md](docs/knowledge/ssh-windows.md))
8. **TOUJOURS** type-check (`npx tsc --noEmit`) avant un commit côté
   `apps/api` ET `apps/admin`

---

## 🛠️ Stack en 30 secondes

| Couche | Tech | Détails |
|---|---|---|
| Backend | NestJS 11 + GraphQL Apollo Server v5 + Prisma 6 | port 3000 |
| DB | PostgreSQL **16** (pas 15 ni 17, cf. [ADR-0001](docs/memory/decisions/0001-postgresql-16.md)) | tuning 8 GB |
| Admin web | React + Vite + Apollo v4 | port 5173 |
| Member portal | React + Vite + Apollo v4 | port 5174 |
| Vitrine SSR | Next.js 15 | port 5175 |
| Mobile | Expo SDK 55 + RN 0.83 | Metro 8081 |
| Mail dev | Mailpit (Docker) | 1025 SMTP, 8025 UI |
| Mail prod | Brevo SMTP relay | 587 STARTTLS |

Pas de monorepo workspaces (cf.
[ADR-0004](docs/memory/decisions/0004-no-monorepo-workspaces.md)). Chaque
app gère son `package.json`.

---

## 🌍 Production

**Serveur** : Hetzner CX33 Helsinki, IP `89.167.79.253`,
hostname `clubflow-prod`. User SSH : `clubflow`. Détails →
[infra-prod.md](docs/knowledge/infra-prod.md).

**Domaines live (cible Phase 1)** :
- https://clubflow.topdigital.re — landing marketing publique (Next.js, port 5176) — *avant Phase 1 = admin*
- https://app.clubflow.topdigital.re — admin multi-tenant (URL pattern `/<slug>/...`, cf. [ADR-0006](docs/memory/decisions/0006-path-based-multi-tenant.md))
- https://api.clubflow.topdigital.re — API + WS `/chat`
- https://portail.clubflow.topdigital.re — portail membre
- https://sksr.re — vitrine club SKSR (custom domain)
- *(Phase 2)* https://*.clubflow.topdigital.re — vitrine fallback wildcard

**Pipeline** : push sur main → deploy.yml + release-please.yml en
parallèle. Auto-merge PR de release via API REST. Détails →
[runbooks/release.md](docs/runbooks/release.md) et
[ADR-0005](docs/memory/decisions/0005-release-please-auto-merge.md).

---

## 🚨 Quand ça pète — playbook 30 sec

| Symptôme | Cause probable | Aller voir |
|---|---|---|
| `ssh: Permission denied` | Mauvais binaire ssh | [ssh-windows.md](docs/knowledge/ssh-windows.md) |
| `ssh: Connection timed out` | fail2ban ban | [unban-ip.md](docs/runbooks/unban-ip.md) |
| Vitrine 500 "VITRINE_API_URL manquant" | `.env.production` perdu | [restore-env.md](docs/runbooks/restore-env.md) |
| API "Not allowed by CORS" en SSR | manque `CORS_ALLOW_NO_ORIGIN=true` | [pitfall](docs/memory/pitfalls/cors-no-origin-prod.md) |
| Vitrine 404 routes après insert pages | cache Next.js stale | [pitfall](docs/memory/pitfalls/nextjs-isr-cache-stale.md) |
| Caddy 403 admin/portail | perms `/home/clubflow/` | [pitfall](docs/memory/pitfalls/caddy-perms-home-clubflow.md) |
| `prisma migrate deploy` fail | ordre migrations cassé | [ADR-0003](docs/memory/decisions/0003-prisma-db-push.md) |
| Build admin TS errors | strict tsc → bypass via `vite build` direct | [pitfall](docs/memory/pitfalls/build-admin-strict-ts.md) |
| Cert Let's Encrypt fail | Cloudflare proxy ON | [pitfall](docs/memory/pitfalls/cloudflare-proxy-breaks-letsencrypt.md) |
| Domaine renvoie 2 IPs (round-robin) | A parasite OVH | [pitfall](docs/memory/pitfalls/ovh-a-parasite-185-158.md) |
| release-please pas de PR | manque `workflow_dispatch` ou perms PR | [pitfall](docs/memory/pitfalls/gha-pr-permission.md) |
| Régression en prod | rollback | [rollback.md](docs/runbooks/rollback.md) |

Pour tout autre symptôme : grep dans `docs/memory/pitfalls/` ou demander
à `/learn`.

---

## 🧠 Workflow de modification standard

Tu veux ajouter une feature / fixer un bug → suivre
[workflows/modif-locale-vers-prod.md](docs/memory/workflows/modif-locale-vers-prod.md) :

```
[Local dev] → [Commit Conventional] → [Push main]
                                         ↓
                            [deploy.yml]   [release-please.yml]
                                  ↓                  ↓
                            [Smoke OK]    [PR auto-merged → tag → release]
                                                     ↓
                                          [deploy.yml retrigger sur tag]
```

Convention de commit (Conventional Commits FR) :

```
<type>(<scope>): <description en français>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Types et impact SemVer : voir [conventions.md](docs/knowledge/conventions.md).

---

## 🔄 Système d'apprentissage continu

Chaque fois qu'on découvre un truc non-évident, on le **capitalise** :

1. **Bug débugué après > 30 min** → `/add-pitfall`
2. **Choix techno tranché** → `/add-decision`
3. **Nouveau parcours métier maîtrisé** → entrée dans `docs/memory/workflows/`
4. **Fin de session productive** → `/learn` pour scanner et proposer
5. **Le soir avant de dormir** → `/dream` (gating auto, log dans `dream-log.md`)

Ces entrées sont **chercheables** par futur Claude :

```bash
grep -ril "ton-mot-clé" docs/memory/
```

L'INDEX est **auto-régénéré** :

```bash
bin/memory-index           # rebuild
bin/memory-index --check   # check pour CI
```

Le workflow GHA `validate-memory.yml` valide la structure (H1, format
ADR, INDEX à jour, liens) à chaque PR touchant `docs/`.

---

## 🔐 SSH vers la prod — LE piège

Si tu lances `ssh clubflow@...` direct → **échec garanti**. Pourquoi :
shell Claude non-interactif + clé avec passphrase + Git Bash ne voit
pas Windows ssh-agent.

**Solution** :

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "commande"
```

Détails complets → [ssh-windows.md](docs/knowledge/ssh-windows.md) et
[pitfall ssh-passphrase-non-tty.md](docs/memory/pitfalls/ssh-passphrase-non-tty.md).

---

## 🎯 Quand tu hésites

| Tu te poses la question... | → tu vas voir... |
|---|---|
| "Comment redémarrer la stack dev ?" | skill `/restart` |
| "Comment déployer manuellement ?" | [runbooks/deploy.md](docs/runbooks/deploy.md) |
| "Pourquoi PG 16 et pas 17 ?" | [ADR-0001](docs/memory/decisions/0001-postgresql-16.md) |
| "Comment ajouter un nouveau club ?" | [runbooks/add-new-club.md](docs/runbooks/add-new-club.md) |
| "Quelle est l'IP du serveur ?" | [contacts-ids.md](docs/knowledge/contacts-ids.md) |
| "C'est quoi ce bug bizarre que j'ai déjà vu ?" | grep dans `docs/memory/pitfalls/` |
| "Quel est le coût mensuel infra ?" | [infra-prod.md](docs/knowledge/infra-prod.md) §Coûts |
| "Comment cloner la prod en local ?" | [workflows/snapshot-prod-vers-clone.md](docs/memory/workflows/snapshot-prod-vers-clone.md) |
| "Comment marche le pipeline release ?" | [runbooks/release.md](docs/runbooks/release.md) |

---

## 📞 Contacts

**Owner** : Florent Morel (`florent.morel427@gmail.com`)

Pour les IDs externes (Hetzner project ID, Cloudflare account ID, etc.)
→ [contacts-ids.md](docs/knowledge/contacts-ids.md).

---

## 📝 Maintenance de ce fichier

CLAUDE.md ne doit **PAS** dépasser ~250 lignes. Si tu veux ajouter du
contenu :

- **Détail technique** → dans `docs/knowledge/`
- **Procédure** → dans `docs/runbooks/`
- **Apprentissage** → dans `docs/memory/`
- **Décision tranchée** → ADR dans `docs/memory/decisions/`

Ici on ne garde que la **carte mentale** + règles d'or + playbook
30-secondes.

---

_Dernière mise à jour : 2026-05-03 — système de mémoire structurée mis
en place ; ce fichier est désormais un orchestrateur, le contenu vit
dans `docs/`._
