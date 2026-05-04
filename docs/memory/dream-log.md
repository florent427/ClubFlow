# Dream log

> Track des sessions `/dream`. Permet de mesurer si le skill est utile
> ou si on l'utilise pas (= à supprimer ou ajuster les seuils).
>
> Format : entrée par session, ordre antichronologique (plus récent en haut).

## Métriques cumulées

À recalculer mensuellement (ou par script) :
- Sessions totales : 4
- Sessions avec création : 4
- Sessions skip (score < seuil) : 0
- Pitfalls créés via `/dream` : 4
- ADR créés via `/dream` : 0
- Workflows créés via `/dream` : 0
- Skill /dream itérations : v1 → v2 (formule + filtres) → v3 (exclude dreamed SHA)

---

## Sessions

## 2026-05-04 04:59 (4e session — post-déploiement Phase 3)
- Score : 35 (formule v2/v3 — peu de dédup car PR #11 pas encore mergée)
- Commits scannés (SHA) : e7dfba5, b3045cb, 0a0002f, fe42fad, 1e490c8, 7b95484, e30e209
- Créés : `pitfalls/nestjs-graphql-nullable-needs-explicit-type.md` (valeur élevée — m'a fait crasher la prod aujourd'hui)
- Refusés : workflow "hotfix prod en urgence" (déjà couvert par modif-locale-vers-prod)
- Note : fix prod après que mon code Phase 3 a crashé au boot NestJS. Le smoke test du clubflow-deploy.sh a fail-fast → bonne détection. Tsc passait mais NestJS GraphQL a crash au runtime → leçon : toujours boot test local avant push.

## 2026-05-04 04:46 (3e session)
- Score : 26 (formule v2)
- Commits scannés (SHA, pour exclusion future) : 0a0002f, fe42fad, 1e490c8, 7b95484, e30e209
- Créés : `pitfalls/prisma-generate-eperm-windows.md`
- Refusés : `claude-chrome-mcp-blocks-shared-infra` (comportement Claude Code, pas piège ClubFlow)
- Bonus : skill `/dream` upgradé en v3 (soustraire commits déjà dreamés via grep dream-log.md)
- Note : 4/5 commits déjà connus → bruit dans le score, motivait le passage v3

## 2026-05-03 23:52 (2e session)
- Score : 865 (gonflé par mega release v0.2.0 — formule à ajuster, fait dans cette session)
- Commits scannés (SHA) : b449850, f71b89f, 5558a2e, 3a59192, 7b95484, c120fc4, e30e209
- Créés : `pitfalls/gitignore-claude-trailing-slash-blocks-negation.md`
- Refusés : aucun (1 seul candidat proposé, validé)
- Bonus : ajustement formule du score `/dream` (filtre release-please, plafond CODE_FILES, pondération feat/fix vs chore)
- Note : première utilisation du skill `/dream` — formule v1 trop sensible aux mega merges, v2 plus robuste

## 2026-05-04 11:32 (5e session — post Phase 1 multi-tenant + ClubSwitcher)
- Score : 69 (formule v3 — déduplication via dream-log SHA fonctionne)
- Commits scannés (SHA) : c44c02d, d7ced6d, e391ecf, b0f33a1, 4791c8e, 1d16efd, ced0910, 19597e2, 91629c2, 565dab7, a391262, be7d0cd, fd52987, 43c187c, 2156110, 3a98789, ae02758, 35ec445
- Créés : `pitfalls/apollo-server-csrf-cross-origin.md`, `pitfalls/cors-admin-web-origin-missing-domain.md`, `pitfalls/signup-unverified-email-blocks-login.md`
- Refusés : workflow "onboarder club via signup self-service" (peut être créé manuellement plus tard, code parle de lui-même)
- Doublons exclus : NestJS GraphQL nullable (déjà créé dream #4), bracketed paste / CF Zone ID / Caddy log perms / NextJS NEXT_PUBLIC_ / Caddy v2.10 on_demand / ClubMembership pas updatedAt / Windows scp CRLF (mergés dans PR #38 + PR #31 cette session)
- Note : grosse session multi-tenant Phase 1 + ClubSwitcher. 3 pitfalls retenus = bloqueurs runtime (CSRF Apollo, CORS missing origin, signup verify email). Workflow + ADR jugés non critiques.
