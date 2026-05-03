# /add-decision — Capturer un choix architectural (ADR)

## Quand l'utiliser

L'équipe (ou Claude + Florent) vient de **trancher** un choix qui sera
difficile à reverser : choix de techno, design pattern majeur,
politique d'infra, etc.

Exemples de déclencheurs :
- "On part sur PG 16 plutôt que 17 parce que..."
- "On garde Cloudflare en DNS only plutôt que proxied parce que..."
- "On utilise db push au lieu de migrate deploy le temps de stabiliser"
- "On décide de pas faire de monorepo workspaces"

## Procédure

### 1. Identifier le numéro

Le suffixe est `<NNNN>-<slug>.md` avec NNNN incrémental :

```bash
ls docs/memory/decisions/ | sort -r | head -1
# → 0005-release-please-auto-merge.md
# Donc le prochain est 0006
```

### 2. Choisir un slug

Format : `kebab-case` court, **sujet** de la décision (pas le contexte).

Exemples :
- ✅ `0006-redis-sessions.md`
- ✅ `0007-graphql-codegen.md`
- ❌ `0008-decision-importante-2026.md` (trop vague)

### 3. Créer le fichier dans `docs/memory/decisions/`

Template **strict** (modèle MADR simplifié) :

```markdown
# ADR-<NNNN> — <Titre court de la décision>

## Statut

✅ **Accepté** — YYYY-MM-DD
🔒 **Verrouillé** OU 🔄 **Réversible** OU ⚠️ **Workaround temporaire**

## Contexte

<3-6 phrases : quel problème on résout, quelles options sont sur la
table, contraintes>

## Options évaluées (optionnel mais recommandé)

### Option A : <nom>
- ✅ <pour>
- ❌ <contre>

### Option B : <nom>
- ✅ <pour>
- ❌ <contre>

## Décision

<1-3 phrases : ce qu'on a choisi, le plus précisément possible>

```bash
# Snippet code/config si pertinent
```

## Conséquences

### Positives
- <bénéfice 1>
- <bénéfice 2>

### Négatives
- <coût 1>
- <coût 2>

### Mitigations (optionnel)
- <comment on atténue les coûts>

## Pourquoi pas <option alternative> (optionnel)

<contre-arguments des options non retenues>

## Quand reconsidérer

- <condition 1 : ex "si on passe à 10+ apps"> → re-évaluer
- <condition 2>

## Plan de sortie (si workaround)

<si statut = workaround temporaire, étapes pour s'en sortir>

## Lié

- [knowledge/X.md](../../knowledge/X.md)
- [runbooks/Y.md](../../runbooks/Y.md)
- [pitfalls/Z.md](../pitfalls/Z.md)
```

### 4. Référencer l'ADR depuis les fichiers concernés

Dans `knowledge/X.md`, `runbooks/Y.md`, ou autres ADRs concernées,
ajouter une ligne :

```markdown
Cf. [ADR-NNNN](../memory/decisions/NNNN-slug.md) pour le rationale.
```

### 5. Régénérer l'INDEX

```bash
bin/memory-index
```

### 6. Commit

```bash
git add docs/memory/decisions/<NNNN>-<slug>.md docs/memory/INDEX.md
git commit -m "docs(memory): ADR-<NNNN> <slug court>

<1 phrase de résumé de la décision>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Critères qualité

Une bonne ADR :
- ✅ **Tranche** un choix (pas "on verra plus tard")
- ✅ Inclut au moins **un argument contre** la décision (honnêteté)
- ✅ Spécifie quand la **reconsidérer** (date, condition)
- ✅ Liens vers les pitfalls qui ont motivé la décision

À éviter :
- ❌ ADR pour des micro-choix (ex: "on utilise == au lieu de ===")
  → ces choses vont dans `knowledge/conventions.md`
- ❌ ADR purement descriptive (ex: "on utilise Caddy") sans contexte
  → ça va dans `knowledge/`
- ❌ ADR qui décrit un fait technique → c'est un knowledge ou pitfall

## Différence avec knowledge/ et pitfalls/

| Type | Quand utiliser |
|---|---|
| `decisions/NNNN-X.md` | Choix tranché entre alternatives, avec rationale |
| `knowledge/X.md` | Description statique d'un état du système |
| `pitfalls/X.md` | Erreur évitable, leçon apprise du terrain |

Si tu hésites : **rationale + alternatives évaluées = ADR**, sinon
knowledge ou pitfall.

## Lié

- [docs/memory/INDEX.md](../../../docs/memory/INDEX.md)
- [docs/memory/decisions/](../../../docs/memory/decisions/)
