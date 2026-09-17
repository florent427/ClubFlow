# Guide Graphify — graphe de connaissances du code ClubFlow

## Pourquoi

Graphify transforme le dépôt en graphe (fichiers, fonctions, résolveurs, modèles
Prisma, docs) interrogeable en quelques centaines de tokens. Usage : s'orienter
avant de lire du code brut (« qui écrit `Invoice` ? », « quel garde protège ce
résolveur ? »). Le graphe décrit la **structure actuelle** ; il ne remplace ni la
lecture du code ni [la mémoire du projet](../memory/INDEX.md).

## Où est le graphe

- `graphify-out/` à la racine du checkout principal : **local, gitignoré**.
- Fichiers clés : `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `manifest.json`,
  `.clubflow_community_names.json` (noms de communautés curés), `refresh.log`.
- Clone frais : le dossier n'existe pas. Le reconstruire (voir « Rebuild complet »).

## Interroger

CLI (2-3 mots-clés, pas une phrase ; plafonner la sortie) :

```bash
graphify query "invoice payment credit" --budget 1500
graphify explain "apps/admin/src/pages/billing/InvoiceDetailDrawer.tsx"
graphify path "MembersResolver" "Member" --undirected
graphify affected prisma_model_member --relation reads_model --relation writes_model
graphify god-nodes --top 15
```

- `explain` : passer un chemin ou un nom **unique** (un libellé ambigu tombe sur le mauvais nœud).
- Modèles Prisma : ids `prisma_model_<nom en minuscules>` (ex. `prisma_model_member`).
- `affected` sans `--relation` suit toutes les relations : bruit garanti.

MCP : serveur `graphify` déclaré dans [.mcp.json](../../.mcp.json) (lit
`graphify-out/graph.json`). Outils : `query_graph`, `get_node`, `get_neighbors`,
`shortest_path`, `graph_stats`, `god_nodes`.

## Relations ajoutées par la couche ClubFlow

[bin/graphify-enrich.py](../../bin/graphify-enrich.py) ajoute, de façon idempotente :

| Relation | Sens |
|---|---|
| `reads_model` / `writes_model` | service ou résolveur → modèle Prisma lu / écrit |
| `relates_to` | modèle Prisma → modèle lié (relation du schéma) |
| `uses_enum` | modèle Prisma → enum Prisma |
| `calls_api` | front (admin, portail, mobile) → opération GraphQL |
| `guarded_by` | résolveur / contrôleur → garde (`@UseGuards`) |
| `requires_module` | résolveur → module club requis |
| `uses_strategy` | garde → stratégie Passport |
| `sets_header` / `reads_header` | client / serveur → en-tête `x-club-id` |
| `documents` | doc Markdown → élément de code cité |

## Mettre à jour

```bash
bin/graphify-refresh            # incrémental : update AST + enrich + communautés (~3 min)
bin/graphify-refresh --force    # accepter un graphe qui rétrécit (fichiers supprimés)
bin/graphify-refresh --full     # re-scan AST complet (garde la couche docs sémantique)
```

Détection des changements : `graphify-out/manifest.json` stocke mtime + hash MD5
par fichier (mtime identique = inchangé ; sinon hash comparé). Le cache AST
(`graphify-out/cache/ast/`) ne couvre **pas** JS/TS (contournement volontaire de
Graphify pour la résolution inter-fichiers) : `update` ré-extrait les ~1 450 fichiers
TS à chaque passe. Durée mesurée sans aucun changement : ~155 s d'update + ~20 s
d'enrichissement. Les docs sémantiques (LLM) restent en cache et ne sont pas relancées.

## Rebuild complet

1. Dans Claude Code : `/graphify .` (extraction sémantique des docs/ADR, appelle un LLM).
2. Puis dans le terminal :

```bash
bin/graphify-refresh
```

## Hooks git

Hooks `post-commit`, `post-merge`, `post-checkout` (changement de branche seulement).
Ils lancent `bin/graphify-refresh` en arrière-plan détaché : git n'attend pas.

```bash
bin/graphify-install-hooks              # installer / mettre à jour (idempotent)
bin/graphify-install-hooks --status     # vérifier
bin/graphify-install-hooks --uninstall  # retirer
GRAPHIFY_SKIP_HOOK=1 git commit -m "..."  # désactiver pour une commande
tail -f graphify-out/refresh.log        # suivre un refresh
```

- Source versionnée : [bin/graphify-hooks/](../../bin/graphify-hooks/dispatch), copiée dans `.git/hooks/clubflow-graphify/`.
- Un hook existant est conservé : le bloc est chaîné à la suite.
- Ignorés : worktrees (`.claude/worktrees/*`), rebase/merge/cherry-pick en cours, `graph.json` absent.
- Verrou `graphify-out/.clubflow-refresh.lock/` ; les demandes reçues pendant un refresh en déclenchent un seul de plus.
- Pas de `graphify hook install` : il pose un merge driver et un `.gitattributes` inutiles (graphe non versionné) et son rebuild écraserait les communautés sans la couche ClubFlow.

## Graphify et docs/memory

- Graphify = **structure actuelle** (qui appelle quoi, maintenant).
- [docs/memory](../memory/INDEX.md) = **intention et historique** (pourquoi, pièges, ADR).
- Conflit entre les deux (ex. ADR qui décrit un flux que le graphe ne montre plus) :
  le signaler à Florent, ne pas trancher en silence.
- L'index mémoire se régénère séparément :

```bash
bin/memory-index
```

- `graphify save-result` / `graphify reflect` : **non utilisés**. Ils créent une
  mémoire parallèle dans `graphify-out/memory/` (locale, non versionnée), redondante
  avec `docs/memory/`. Les apprentissages passent par `/add-pitfall`, `/add-decision`, `/learn`.

## Limites connues

- Requêtes lexicales : mot-clé absent des libellés = rien trouvé. Essayer des synonymes code (`invoice` plutôt que `facture`).
- Libellés ambigus (`index.ts`, `service`, `resolver`) : utiliser le chemin complet.
- `InvoiceDetailDrawer.tsx` : extraction partielle ; lire le fichier.
- Nœuds de docs : titres et sections, pas les raisons ; lire le `.md` pour le « pourquoi ».
- Commits faits dans un worktree : pris en compte après merge puis checkout/pull dans le checkout principal.

## Dépannage rapide

| Symptôme | Action |
|---|---|
| MCP renvoie des erreurs texte / `graph.json` absent | rebuild complet (voir plus haut) |
| `python` introuvable dans un hook | vérifier `graphify-out/.graphify_python`, sinon mettre Python dans le PATH |
| Refresh jamais relancé | `ls graphify-out/.clubflow-refresh.lock` ; verrou orphelin (PID mort ou > 30 min) nettoyé au prochain lancement, sinon `rm -rf graphify-out/.clubflow-refresh.lock` |
| `Refusing to overwrite` dans `refresh.log` | vérifier les fichiers supprimés, puis `bin/graphify-refresh --force` |
| Hook sans effet | `bin/graphify-install-hooks --status`, puis `tail graphify-out/refresh.log` |
