# Dream log

> Track des sessions `/dream`. Permet de mesurer si le skill est utile
> ou si on l'utilise pas (= à supprimer ou ajuster les seuils).
>
> Format : entrée par session, ordre antichronologique (plus récent en haut).

## Métriques cumulées

À recalculer mensuellement (ou par script) :
- Sessions totales : 1
- Sessions avec création : 1
- Sessions skip (score < seuil) : 0
- Pitfalls créés via `/dream` : 1
- ADR créés via `/dream` : 0
- Workflows créés via `/dream` : 0

---

## Sessions

## 2026-05-03 23:52
- Score : 865 (gonflé par mega release v0.2.0 — formule à ajuster, fait dans cette session)
- Commits scannés : 7 (3 méta, 2 release-please auto, 1 fix CI déjà capturé, 1 mega release)
- Créés : `pitfalls/gitignore-claude-trailing-slash-blocks-negation.md`
- Refusés : aucun (1 seul candidat proposé, validé)
- Bonus : ajustement formule du score `/dream` (filtre release-please, plafond CODE_FILES, pondération feat/fix vs chore)
- Note : première utilisation du skill `/dream` — formule v1 trop sensible aux mega merges, v2 plus robuste
