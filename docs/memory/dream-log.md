# Dream log

> Track des sessions `/dream`. Permet de mesurer si le skill est utile
> ou si on l'utilise pas (= à supprimer ou ajuster les seuils).
>
> Format : entrée par session, ordre antichronologique (plus récent en haut).

## Métriques cumulées

À recalculer mensuellement (ou par script) :
- Sessions totales : 3
- Sessions avec création : 3
- Sessions skip (score < seuil) : 0
- Pitfalls créés via `/dream` : 3
- ADR créés via `/dream` : 0
- Workflows créés via `/dream` : 0
- Skill /dream itérations : v1 → v2 (formule + filtres) → v3 (exclude dreamed SHA)

---

## Sessions

## 2026-05-04 04:46 (3e session)
- Score : 26 (formule v2)
- Commits scannés (SHA, pour exclusion future) : 0a0002f, fe42fad, 1e490c8, 7b95484, e30e209
- Créés : `pitfalls/prisma-generate-eperm-windows.md`
- Refusés : `claude-chrome-mcp-blocks-shared-infra` (comportement Claude Code, pas piège ClubFlow)
- Bonus : skill `/dream` upgradé en v3 (soustraire commits déjà dreamés via grep dream-log.md)
- Note : 4/5 commits déjà connus → bruit dans le score, motivait le passage v3
- Pré-prod : merger PR #10 (Phase 3 vitrine domain) + activer Caddy admin API

## 2026-05-03 23:52 (2e session)
- Score : 865 (gonflé par mega release v0.2.0 — formule à ajuster, fait dans cette session)
- Commits scannés (SHA, pour exclusion future) : b449850, f71b89f, 5558a2e, 3a59192, 7b95484, c120fc4, e30e209
- Créés : `pitfalls/gitignore-claude-trailing-slash-blocks-negation.md`
- Refusés : aucun (1 seul candidat proposé, validé)
- Bonus : ajustement formule du score `/dream` (filtre release-please, plafond CODE_FILES, pondération feat/fix vs chore)
- Note : première utilisation du skill `/dream` — formule v1 trop sensible aux mega merges, v2 plus robuste
