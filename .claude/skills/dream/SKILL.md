# /dream — Cycle de consolidation mémoire (avant de dormir)

> Inspiré du système autodream d'OpenClaw mais adapté human-in-the-loop.
> Tu lances avant d'aller dormir. Le skill vérifie d'abord s'il y a matière
> à apprendre. Si oui : analyse + propose. Si non : silence et bonne nuit.

## Quand utiliser

- Avant de fermer le laptop le soir
- Après une grosse session de debug
- Quand tu sens qu'il y a "des trucs à capter" mais flemme de faire `/learn`

## Procédure

### Phase 0 — Gating (vérifier qu'il y a matière)

Calculer un **score d'activité** sur les dernières 24h. Si trop bas → exit
court ("rien d'intéressant ce soir, dors bien"). Si suffisant → on continue.

⚠️ **Filtrer les commits non-significatifs** AVANT scoring :
- `chore(main): release` (auto release-please)
- `Merge branch ...`, `Merge pull request ...` (merges automatiques)
- Commits avec `[skip ci]` ou `[ci skip]`

```bash
# Filtre commun pour exclure le bruit
SIGNIFICANT_COMMITS=$(git log --since="24 hours ago" --pretty=format:'%h %s' | \
  grep -vE '^[a-f0-9]+ chore\(main\): release|^[a-f0-9]+ Merge ' | \
  grep -vE '\[skip ci\]|\[ci skip\]')
COMMITS_24H=$(echo "$SIGNIFICANT_COMMITS" | grep -c . || echo 0)

# Mots-clés "à pitfall" dans les messages de commit (pondération forte)
KEYWORDS=$(echo "$SIGNIFICANT_COMMITS" | grep -ciE 'fix|bug|workaround|hack|tricky|gotcha|piège' || echo 0)

# Commits feat/fix (vraie valeur produit), pondération moyenne
PRODUCT_COMMITS=$(echo "$SIGNIFICANT_COMMITS" | grep -cE '^[a-f0-9]+ (feat|fix|perf|refactor)' || echo 0)

# Commits chore/docs (méta, pondération faible)
META_COMMITS=$(echo "$SIGNIFICANT_COMMITS" | grep -cE '^[a-f0-9]+ (chore|docs|style|test)' || echo 0)

# Fichiers modifiés dans les apps (vrai code) — PLAFONNÉ à 50 pour éviter
# qu'une mega release fausse le score
RAW_CODE_FILES=$(git log --since="24 hours ago" --name-only --pretty=format: | \
  grep -E '^apps/' | sort -u | wc -l)
CODE_FILES=$(( RAW_CODE_FILES > 50 ? 50 : RAW_CODE_FILES ))

# Pitfalls/ADR ajoutés depuis 7 jours (si 0 longtemps → memory frozen)
RECENT_MEMORY=$(git log --since="7 days ago" --name-only --pretty=format: | \
  grep -E '^docs/memory/(pitfalls|decisions)/' | sort -u | wc -l)
```

**Score** :
```
score = PRODUCT_COMMITS × 3       # feat/fix/perf/refactor = signal fort
      + KEYWORDS × 3              # mots-clés bug/fix amplifient
      + (CODE_FILES / 5)          # code réel modifié, plafonné
      + META_COMMITS × 1          # chore/docs = signal faible
      + (RECENT_MEMORY == 0 ? 2 : 0)   # bonus si memory frozen depuis 7j
```

**Seuils** :
- `< 3` → exit silencieux : "🌙 Pas assez de signal de pitfall ce soir.
  Bonne nuit."
- `3-7` → analyse rapide (commits seulement, pas de scan conversation)
- `≥ 8` → analyse complète (commits + grep doublons + scan context)

**Note honnêteté** : si le score est gonflé par 1 mega release commit
(>500 fichiers), **mentionner explicitement** dans le report que la
plupart vient d'un bulk merge et pas du "vrai code du jour". Ne pas
laisser le user croire à un signal fort artificiel.

### Phase 1 — Collect (si score suffisant)

Récupérer les signaux :

```bash
# Liste des commits du jour avec messages complets
git log --since="24 hours ago" --pretty=format:'%h | %s%n%b'

# Diff statistique
git log --since="24 hours ago" --stat | head -50

# Branches actives (PR en cours)
gh pr list --state open --json number,title,headRefName 2>/dev/null
```

Identifier dans la conversation Claude courante :
- Y a-t-il eu un debug long (>30 min) ? → candidat pitfall
- Y a-t-il eu une décision tranchée entre alternatives ? → candidat ADR
- Y a-t-il un parcours qu'on a redécouvert ? → candidat workflow

### Phase 2 — Détection doublons

Pour chaque candidat pitfall détecté, **vérifier qu'il n'existe pas déjà** :

```bash
# Cherche un mot-clé du symptôme dans les pitfalls existants
grep -ril "<mot-clé-symptôme>" docs/memory/pitfalls/
```

Si match → ne pas re-proposer (ou proposer "update existing" plutôt que "create new").

### Phase 3 — Health check rapide

Calculer 4 métriques simples (pas besoin du full health score d'autodream) :

```bash
# Nombre de pitfalls / ADR / workflows
PITFALLS=$(ls docs/memory/pitfalls/*.md 2>/dev/null | wc -l)
ADR=$(ls docs/memory/decisions/*.md 2>/dev/null | wc -l)
WORKFLOWS=$(ls docs/memory/workflows/*.md 2>/dev/null | wc -l)

# Pitfalls référencés vs orphelins (pas linkés depuis ailleurs)
ORPHANS=0
for f in docs/memory/pitfalls/*.md; do
  base=$(basename "$f" .md)
  refs=$(grep -rl "$base" docs/ --include='*.md' | grep -v "$f" | wc -l)
  if [ "$refs" -eq 0 ]; then
    ORPHANS=$((ORPHANS + 1))
  fi
done

# Pitfalls "stales" : pas modifiés depuis >90 jours ET importance pas marquée HIGH
STALES=$(find docs/memory/pitfalls -name '*.md' -mtime +90 | wc -l)
```

### Phase 4 — Présenter à l'utilisateur

Afficher un dream report formaté :

```
🌀 Dream report — YYYY-MM-DD HH:MM

📊 Activité jour :
  - X commits sur Y fichiers (apps/api/..., apps/admin/...)
  - Z labellisés "fix/bug/workaround"
  - Score d'activité : N/X (seuil : 4)

🪤 Pitfalls candidats (N) :
  1. <slug-suggéré>.md
     → "<symptôme en 1 ligne>"
     Source : commit abc1234 + debug session 21h-21h45

  2. ...

🏛️ Décisions candidates (N) :
  1. ADR-NNNN — <choix court>
     → Pourquoi : <résumé>

🔄 Workflows candidats (N) :
  1. <slug>.md — <description>

🩺 Health rapide :
  - Pitfalls : X (+0 ce mois)
  - ADR : Y
  - Workflows : Z
  - Orphelins (pas linkés) : N → [liste]
  - Stale (>3 mois) : M

→ Que veux-tu créer ?
   "1, 2"     pour créer pitfalls 1 et 2
   "all"      pour tout créer
   "rien"     pour skip (juste log la session)
   "edit 1"   pour ajuster le titre/contenu avant création
```

### Phase 5 — Création (sur validation)

Pour chaque entrée approuvée :
- **Pitfall** : appliquer le template du skill `/add-pitfall` (mais sans
  re-demander le numéro de fichier — utiliser le slug suggéré)
- **ADR** : appliquer le template du skill `/add-decision` (déterminer le
  prochain NNNN)
- **Workflow** : créer dans `docs/memory/workflows/<slug>.md`

### Phase 6 — Régen + log + commit

```bash
# Régen INDEX
bin/memory-index

# Log la session dans dream-log.md
cat >> docs/memory/dream-log.md <<EOF

## $(date '+%Y-%m-%d %H:%M')
- Score : N/X
- Commits scannés : N
- Créés : <liste des fichiers créés>
- Refusés : <liste des candidats refusés>
- Note : <ce que l'utilisateur a dit, optionnel>
EOF

# Proposer (PAS exécuter) le commit groupé
echo "
Suggestion de commit :

git add docs/memory/ docs/memory/dream-log.md
git commit -m \"docs(memory): dream cycle $(date +%Y-%m-%d) — N entrées

Pitfalls : <list>
ADR : <list>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>\"
"
```

**⚠️ Toujours demander avant de commiter** (règle d'or CLAUDE.md §1).

## Format dream-log.md

Le fichier `docs/memory/dream-log.md` track toutes les sessions `/dream`
(que des entrées soient créées ou non). Format :

```markdown
# Dream log

> Track des sessions `/dream`. Permet de mesurer si le skill est utile
> ou si on l'utilise pas (= à supprimer ou ajuster les seuils).

## YYYY-MM-DD HH:MM
- Score : N/X
- Commits scannés : N
- Créés : `pitfalls/foo.md`, `decisions/0006-bar.md`
- Refusés : `pitfalls/baz.md` (pas assez clair)
- Note : "session de debug Apollo cache"
```

À review tous les 1-2 mois pour ajuster les seuils ou supprimer le skill
si pas utilisé.

## Cas d'usage type — soir productif

```
User: /dream

Claude: [calcule score]
🌀 Dream report — 2026-05-03 23:14

📊 Activité jour : 7 commits, 1 labellisé "workaround", score 11/X
[... full analyse ...]

→ Que veux-tu créer ?

User: 1 et 3, refuse 2

Claude: [crée pitfalls/foo.md + workflows/baz.md, log, propose commit]
```

## Cas d'usage type — soir tranquille

```
User: /dream

Claude: [calcule score]
🌙 1 commit aujourd'hui (docs typo), score 1/X.
Rien à capter ce soir. Bonne nuit.
[log session avec score=1, créés=[], refusés=[]]
```

## Différences avec `/learn`

| | `/learn` | `/dream` |
|---|---|---|
| Trigger | Manuel, à n'importe quel moment | Soir, avant dormir |
| Gating | Aucun (tu décides) | Score d'activité (auto) |
| Health check | Non | Oui (rapide) |
| Log | Non | Oui (`dream-log.md`) |
| Idempotence | Tu vérifies | Auto via grep |
| Coût | Toujours analyse | Skip si rien à faire |

`/learn` reste utile en milieu de journée ("on vient de fixer un truc gros,
capitalise direct"). `/dream` est la routine du soir.

## Anti-patterns

❌ Lancer `/dream` 10× dans la journée → utiliser `/learn` à la place
❌ Ignorer le score : forcer l'analyse même si rien à faire → bouffe des
   tokens pour rien
❌ Auto-commiter sans review → casse la règle d'or de CLAUDE.md
❌ Créer une entrée pour chaque commit → on garde le seuil de qualité

## Lié

- [/learn](../learn/SKILL.md)
- [/add-pitfall](../add-pitfall/SKILL.md)
- [/add-decision](../add-decision/SKILL.md)
- [docs/memory/INDEX.md](../../../docs/memory/INDEX.md)
- [docs/memory/dream-log.md](../../../docs/memory/dream-log.md)
