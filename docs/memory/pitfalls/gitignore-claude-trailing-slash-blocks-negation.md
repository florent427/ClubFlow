# Piège — `.gitignore` `.claude/` (trailing slash) bloque la négation `!.claude/skills/`

## Symptôme

```
$ cat .gitignore
.claude/
!.claude/skills/

$ git check-ignore -v .claude/skills/learn/SKILL.md
.gitignore:19:.claude/	.claude/skills/learn/SKILL.md
```

→ Le fichier est toujours ignoré malgré la négation. `git status` ne le voit pas.

## Contexte

Tu veux versionner les skills custom Claude (`/learn`, `/dream`, etc.)
tout en gardant ignored le reste de `.claude/` (settings perso, cache,
JWT). L'instinct dit :

```gitignore
.claude/
!.claude/skills/
```

Mais ça ne marche pas. Toutes les négations `!.claude/skills/...` sont
silencieusement ignorées.

## Cause root

D'après la doc gitignore : **"It is not possible to re-include a file
if a parent directory of that file is excluded."**

Quand tu écris `.claude/` (avec trailing slash), git considère que
**l'ensemble du dossier est exclu** et **n'entre pas dedans pour évaluer
les motifs**. La négation `!.claude/skills/` est donc invisible — git
ne lit jamais le contenu du dossier.

C'est silencieux : aucune erreur, aucun warning. Juste les fichiers qui
restent ignorés sans raison apparente.

## Solution

**Remplacer `.claude/` par `.claude/*`** :

```gitignore
.claude/*
!.claude/skills/
```

Avec `.claude/*` (étoile, pas trailing slash), git ignore le **contenu**
du dossier mais **continue à entrer dedans** pour évaluer les motifs
suivants. La négation `!.claude/skills/` peut alors ré-inclure ce
sous-dossier.

## Vérification

```bash
$ git check-ignore -v .claude/skills/learn/SKILL.md
# Avec .claude/    → :19:.claude/	.claude/skills/learn/SKILL.md (ignored)
# Avec .claude/*   → (no output, le fichier n'est PAS ignored)
```

Et :

```bash
$ git check-ignore -v .claude/settings.local.json
.gitignore:19:.claude/*	.claude/settings.local.json   # bien ignored
```

## Pourquoi NE PAS faire

- ❌ Ajouter chaque fichier individuellement avec `!.claude/skills/learn/SKILL.md`,
  `!.claude/skills/dream/SKILL.md`, etc. → fastidieux et fragile
- ❌ Sortir les skills hors de `.claude/` (par ex. `claude-skills/`) →
  casse la convention Claude Code qui cherche dans `.claude/skills/`

## Règle générale gitignore

Pour tout dossier où on veut "ignorer le contenu sauf un sous-dossier" :

```gitignore
mon-dossier/*           # PAS mon-dossier/
!mon-dossier/sous-truc/
```

Le trailing slash `mon-dossier/` ferme la porte. L'étoile `mon-dossier/*`
laisse une fenêtre.

## Lié

- [.gitignore](../../../.gitignore)
- Doc git : https://git-scm.com/docs/gitignore (section PATTERN FORMAT)
