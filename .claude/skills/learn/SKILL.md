# /learn — Capitaliser ce qu'on vient d'apprendre dans la mémoire structurée

## Quand l'utiliser

À la fin d'une session, après un fix non-trivial, après un onboarding,
ou à la demande explicite : "/learn", "capitalise ce qu'on a appris".

L'utilisateur veut que Claude **scanne** ce qui s'est passé dans la
session courante (commits, fixes, debug) et propose des entrées à
ajouter à `docs/memory/`.

Différence avec `/add-pitfall` et `/add-decision` :
- Ces 2 skills sont **ciblés** : tu veux ajouter UN piège ou UNE décision.
- `/learn` est **agrégé** : il regarde l'ensemble de ce qu'on vient de
  faire et identifie tout ce qui mérite d'être capitalisé.

## Procédure

### 1. Scanner la session

Looker :
- `git log --oneline -20` — commits récents
- `git diff main..HEAD` (si on est sur une branche) — changements
- Conversation dans le contexte courant : qu'est-ce qui a été débugué,
  décidé, configuré ?

### 2. Catégoriser

Pour chaque chose notable, classer :

| Type de découverte | → où l'enregistrer |
|---|---|
| "Cette config marche" / "On a tranché X parce que" | `docs/memory/decisions/` |
| "Ce truc fait planter quand..." | `docs/memory/pitfalls/` |
| "Voici comment on fait ce parcours" | `docs/memory/workflows/` |
| "L'état du système est X" (versions, hosts, IDs) | `docs/knowledge/` |
| "Procédure opérationnelle" | `docs/runbooks/` |

### 3. Lister les candidats à l'utilisateur

Avant de créer quoi que ce soit, **proposer** une liste :

```
J'ai détecté ces choses à capitaliser :

🪤 Pitfalls candidats :
1. <slug-1.md> — <symptôme court>
2. <slug-2.md> — <symptôme court>

🏛️ Décisions candidates :
1. ADR-NNNN — <choix court>

🔄 Workflow candidat :
1. <slug.md> — <description>

📚 Knowledge à mettre à jour :
1. <fichier.md> — ajouter <info>

Lesquels créer/mettre à jour ?
```

### 4. Pour chaque entrée approuvée

- **Pitfall** : déléguer à `/add-pitfall` (template + règles)
- **Décision** : déléguer à `/add-decision` (template + numéro)
- **Workflow / Knowledge / Runbook** : créer directement le fichier
  selon le pattern existant (s'inspirer des fichiers similaires)

### 5. Régénérer l'INDEX

```bash
bin/memory-index
```

### 6. Mettre à jour les liens croisés

Pour chaque nouveau fichier :
- Ajouter une référence dans `CLAUDE.md` si critique pour le playbook
- Ajouter des liens depuis les fichiers adjacents (knowledge → décisions,
  pitfalls ↔ runbooks)

### 7. Commit groupé

```bash
git add docs/memory/ docs/knowledge/ docs/runbooks/ CLAUDE.md
git commit -m "docs(memory): learnings de la session <date>

- Pitfall: <slug-1>
- Pitfall: <slug-2>
- ADR-NNNN: <choix>
- Knowledge update: <fichier>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Heuristiques de détection

### Signaux qui crient "pitfall"
- "Pourquoi ça plante encore"
- "Ah oui, j'avais oublié que..."
- Une erreur qui a pris > 30 min à débugger
- Un comportement non-évident d'un outil tiers
- Un fix qui semble "magique" sans explication intuitive

### Signaux qui crient "décision"
- "On part sur X plutôt que Y parce que..."
- Un débat tranché entre 2-3 alternatives
- Une option qu'on adopte mais qu'on pourrait reverser
- Un choix techno (lib, version, pattern)

### Signaux qui crient "workflow"
- "À chaque fois qu'on fait X, il faut..."
- Un parcours qu'on a redécouvert à la main 2-3 fois
- Une suite d'étapes qu'on a documentée à mi-chemin

### Signaux qui crient "knowledge"
- Une nouvelle URL/IP/ID externe à mémoriser
- Un changement de version d'une dépendance pinnée
- Un nouveau service / port / variable d'env

## Anti-patterns

❌ Créer un pitfall pour un bug **déjà documenté** ailleurs
❌ Créer une décision pour un micro-choix (style de code, naming)
❌ Créer un workflow pour une opération unique (à mettre dans un runbook)
❌ Pull-request avec 10+ nouveaux fichiers de mémoire d'un coup —
   préférer 2-3 entrées de qualité
❌ Documenter ce qui sera obsolète dans 1 mois (ex: bug d'une beta)

## Cas usage : fin de session de debug

```
User: "/learn"

Claude:
J'ai détecté ces apprentissages dans la session :

🪤 Pitfalls (2) :
1. `caddy-perms-home-clubflow.md` — Caddy 403 sur file_server depuis
   /home/clubflow (a pris 30 min à débug, bizarre comportement)
2. `cors-no-origin-prod.md` — Vitrine SSR 500 "Not allowed by CORS"
   (cause : pas de header Origin sur les calls server-to-server)

🏛️ ADR (1) :
1. ADR-0006 — VITRINE_DEFAULT_CLUB_SLUG=demo-club temporaire (le temps
   de coder le mapping multi-tenant Host → clubSlug)

📚 Knowledge à mettre à jour :
1. `infra-prod.md` — ajouter section "Permissions home dir"

Lesquels créer ?
```

## Lié

- [add-pitfall/SKILL.md](../add-pitfall/SKILL.md)
- [add-decision/SKILL.md](../add-decision/SKILL.md)
- [docs/memory/INDEX.md](../../../docs/memory/INDEX.md)
