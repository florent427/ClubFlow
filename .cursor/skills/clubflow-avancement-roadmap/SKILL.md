# Mise à jour de l’avancement ClubFlow (roadmap)

## Quand activer

Quand l’utilisateur demande de **mettre à jour l’avancement**, le **bilan projet**, ou de **synchroniser** les fichiers d’état ClubFlow après une livraison ou une revue.

## Fichiers concernés

| Fichier | Rôle |
|--------|------|
| `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-realise.md` | Ce qui est fait + preuves (chemins code, specs) |
| `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-reste.md` | Checklist ouverte + critères de fin |
| `ClubFlow_Conception_Provisoire.md` | Référence §7.2 (méthodo) et §4 (modules) |
| `docs/superpowers/plans/2026-03-30-plan-general-application-clubflow.md` | Phases A–L |

Ne **pas** supprimer les specs/plans historiques dans `docs/superpowers/specs/` et `plans/` ; mettre à jour uniquement les deux fichiers roadmap + ajuster le résumé §2 du plan général si le tableau synthétique diverge.

## Règles

1. **Preuve avant « réalisé » :** exiger un chemin de fichier, un test qui passe, ou une décision utilisateur explicite ; ne pas déplacer une ligne du fichier « reste » vers « réalisé » sans source.
2. **Structure à conserver :** section **I** = méthodologie (conception §7.2), section **II** = phases A–L, section **III** si présente (ex. admin transversal).
3. **Date :** mettre à jour la ligne `Dernière mise à jour` en haut des deux roadmap le jour de l’édition.
4. **Tests :** si la demande concerne le socle ou l’API, lancer `cd apps/api && npm run test && npm run test:e2e` et refléter le résultat si pertinent (sans coller de secrets).
5. **Concision :** préférer des puces courtes et des liens vers `apps/...` ou `docs/...` plutôt que de recopier tout le plan général.

## Fin de tâche

Indiquer à l’utilisateur les fichiers modifiés et rappeler que la **feuille détaillée** des tâches `- [ ]` reste dans les plans `docs/superpowers/plans/*.md` tant qu’on ne les archive pas.
