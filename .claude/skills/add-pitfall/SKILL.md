# /add-pitfall — Capturer un nouveau piège dans la mémoire

## Quand l'utiliser

L'utilisateur (ou Claude) vient de débugger un problème non-évident,
de découvrir un comportement contre-intuitif, ou de retomber dans une
erreur qu'on aurait pu éviter avec de la doc.

Exemples de déclencheurs :
- "Tiens, encore ce bug avec X..."
- "J'aurais dû me souvenir que..."
- "C'est la 2e fois qu'on tombe là-dessus"
- Claude vient de fixer un bug grâce à des trial & error → vaut le coup
  de capitaliser

## Procédure

### 1. Identifier les éléments

Avant d'écrire, collecter :
- **Symptôme** : message d'erreur exact, ou comportement observable
- **Contexte** : quand ça arrive (commande, config, version)
- **Cause root** : pourquoi (la vraie raison technique)
- **Solution** : ce qui marche
- **Pourquoi NE PAS** : alternatives qui semblent évidentes mais foirent
- **Liens** : autres pitfalls / runbooks / ADRs concernés

### 2. Choisir un slug

Format : `<sujet-court-sans-accents>.md`, kebab-case, < 5 mots.

Exemples :
- ✅ `cors-no-origin-prod.md`
- ✅ `prisma-migration-order-broken.md`
- ❌ `bug-bizarre-API.md` (trop vague)
- ❌ `Probleme_Avec_Caddy.md` (mauvais format)

### 3. Créer le fichier dans `docs/memory/pitfalls/`

Template à suivre (s'inspirer de pitfalls existants pour la longueur
et le ton, ~50-150 lignes selon complexité) :

```markdown
# Piège — <titre court qui claque>

## Symptôme

```
<message d'erreur exact OU comportement observable>
```

## Contexte

<2-4 phrases : quand est-ce que ça arrive>

## Cause root

<2-4 phrases : pourquoi c'est cassé techniquement>

## Solution

<commandes / code / étapes pour résoudre>

## Pourquoi NE PAS faire X (optionnel)

- ❌ <fausse bonne idée 1>
- ❌ <fausse bonne idée 2>

## Détection (optionnel)

<comment détecter si on retombe dans le piège>

## Lié

- [knowledge/X.md](../../knowledge/X.md)
- [runbooks/Y.md](../../runbooks/Y.md)
- [pitfalls/Z.md](Z.md)
```

### 4. Mettre à jour CLAUDE.md si critique

Si le piège est suffisamment important pour figurer dans le **playbook
30-secondes** de CLAUDE.md (= "quand ça pète"), ajouter une ligne dans
le tableau §Quand ça pète.

### 5. Régénérer l'INDEX

```bash
bin/memory-index
```

### 6. Commit

```bash
git add docs/memory/pitfalls/<slug>.md docs/memory/INDEX.md [CLAUDE.md]
git commit -m "docs(memory): pitfall <slug-court>

Capture du piège <titre> rencontré pendant <contexte>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Critères qualité

Une bonne entrée pitfall :
- ✅ Le **symptôme** est copiable depuis un terminal (futur Claude
  pourra le grep)
- ✅ La **cause root** est tranchée (pas "peut-être que X")
- ✅ La **solution** est testée (pas une supposition)
- ✅ Au moins un lien vers du contenu adjacent
- ✅ Ton direct, pas de blabla ("le piège est...")

À éviter :
- ❌ Pitfall trop générique ("npm fail parfois") → préférer des
  symptomes précis
- ❌ Pitfall qui dépend trop d'un état temporaire (ex: bug d'une version
  spécifique de NestJS qui sera fixé) → noter quand même mais avec
  date d'expiration

## Lié

- [docs/memory/INDEX.md](../../../docs/memory/INDEX.md)
- [docs/memory/pitfalls/](../../../docs/memory/pitfalls/)
