#!/usr/bin/env python3
"""ClubFlow post-processor for the graphify knowledge graph.

graphify's AST pass cannot see several cross-cutting facts that matter in this
repo (Prisma models, GraphQL documents -> resolvers, NestJS guards, the
x-club-id tenancy header, ADR/pitfall -> code links). This script adds them to
graphify-out/graph.json as an idempotent, replayable layer:

* every node/edge it adds carries ``"enriched_by": "clubflow-enrich"``;
* at start, all previously enriched items are removed, then recomputed from the
  working tree, so running it N times yields the same graph;
* added items are stamped ``_origin: "semantic"``. graphify 0.9.57's
  ``update`` (watch._reconcile_existing_graph) preserves semantic-tier items
  across AST re-extraction and only evicts them when their source file is
  deleted or newly ignored, so the layer survives ``graphify update`` and git
  hooks (it can only go stale; re-running this script refreshes it).

Optional ``--recluster`` recomputes communities, GRAPH_REPORT.md, graph.html,
.graphify_labels.json(+.sig) through graphify's own API, keeping the existing
community names (matched by cid after graphify's overlap-based remap).

Only stdlib + graphify (and networkx, which graphify depends on) are used.

Usage:
  python bin/graphify-enrich.py                 # enrich graph.json in place
  python bin/graphify-enrich.py --recluster     # enrich + communities/report/html
  python bin/graphify-enrich.py --snapshot      # absorb curated community names only
  python bin/graphify-enrich.py --stats         # print counts, write nothing
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
import time
from pathlib import Path

from graphify.ids import make_id

MARK = "clubflow-enrich"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphify-out"
GRAPH = OUT / "graph.json"
NAMES = OUT / ".clubflow_community_names.json"
SCHEMA = "apps/api/prisma/schema.prisma"

FRONT_ROOTS = [
    "apps/admin/src", "apps/member-portal/src", "apps/vitrine/src",
    "apps/landing/src", "apps/mobile/src", "apps/mobile-admin/src",
    "packages/mobile-shared/src",
]
API_ROOTS = ["apps/api/src", "apps/api/prisma", "apps/api/scripts"]
SKIP_DIRS = {"node_modules", "dist", "build", ".next", ".expo", "coverage", "_shared"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

READ_OPS = {"findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow",
            "count", "aggregate", "groupBy"}
WRITE_OPS = {"create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany",
             "createManyAndReturn", "updateManyAndReturn"}


# --------------------------------------------------------------------------- io

def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def read(path: str) -> str:
    try:
        return (ROOT / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def walk(roots, exts=CODE_EXT, skip_tests=True):
    for r in roots:
        base = ROOT / r
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for f in filenames:
                p = Path(dirpath) / f
                if p.suffix not in exts:
                    continue
                if skip_tests and re.search(r"\.(spec|test|e2e-spec)\.[jt]sx?$", f):
                    continue
                yield rel(p)


def write_json_atomic(path: Path, data) -> None:
    # A concurrent reader may briefly hold graph.json open on Windows: retry.
    tmp = path.with_name(path.name + ".enrich.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    for attempt in range(20):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.5)
    raise SystemExit(f"could not replace {path} (locked)")


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def strip_comments(text: str) -> str:
    # Keep offsets stable: blank out comment bodies instead of deleting them.
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
    return re.sub(r"(?<![:\\'\"`])//[^\n]*", blank, text)


def balanced(text: str, open_pos: int) -> int:
    """Index just after the parenthesis matching text[open_pos] == '('."""
    depth = 0
    i = open_pos
    while i < len(text):
        c = text[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        elif c in "'\"`":
            j = text.find(c, i + 1)
            i = j if j > 0 else i
        i += 1
    return len(text)


def split_top(args: str):
    out, depth, cur = [], 0, ""
    for c in args:
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if c == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += c
    if cur.strip():
        out.append(cur.strip())
    return out


# ------------------------------------------------------------------- graph ctx

class Ctx:
    def __init__(self, graph: dict):
        self.g = graph
        self.nodes = graph["nodes"]
        self.links = graph["links"]
        self.ids = {n["id"] for n in self.nodes}
        self.by_file = collections.defaultdict(list)
        for n in self.nodes:
            if n.get("source_file"):
                self.by_file[n["source_file"]].append(n)
        self.pairs = set()
        for e in self.links:
            self.pairs.add(frozenset((e["source"], e["target"])))
        self.new_nodes: list[dict] = []
        self.new_links: list[dict] = []
        self.counts = collections.Counter()
        self.base_pairs = frozenset(self.pairs)
        self.skipped_existing_pair = 0
        self.skipped_duplicate_pair = 0

    # --- lookup helpers
    def file_node(self, path: str):
        cands = self.by_file.get(path, [])
        base = path.rsplit("/", 1)[-1]
        stem_id = make_id(path.rsplit(".", 1)[0])
        for n in cands:
            if n["id"] == stem_id:
                return n["id"]
        for n in cands:
            if n.get("label") == base:
                return n["id"]
        return None

    @staticmethod
    def loc(n) -> int:
        m = re.match(r"L(\d+)", str(n.get("source_location") or ""))
        return int(m.group(1)) if m else -1

    def enclosing_callable(self, path: str, line: int):
        best, best_line = None, -1
        for n in self.by_file.get(path, []):
            if not n.get("_callable") or n.get("_callable_class"):
                continue
            ln = self.loc(n)
            if best_line < ln <= line:
                best, best_line = n["id"], ln
        return best

    def labeled(self, path: str, label: str, line: int | None = None):
        cands = [n for n in self.by_file.get(path, []) if n.get("label") == label]
        if not cands:
            return None
        if line is not None:
            cands.sort(key=lambda n: abs(self.loc(n) - line))
        return cands[0]["id"]

    # --- mutation helpers
    def add_node(self, nid, label, file_type, source_file, line=None, **extra):
        if nid in self.ids:
            return nid
        node = {
            "id": nid, "label": label, "file_type": file_type,
            "source_file": source_file,
            "source_location": f"L{line}" if line else None,
            "norm_label": label.lower(), "_origin": "semantic", "enriched_by": MARK,
        }
        node.update(extra)
        self.ids.add(nid)
        self.new_nodes.append(node)
        if source_file:
            self.by_file[source_file].append(node)
        return nid

    def add_edge(self, kind, src, tgt, relation, source_file, line=None,
                 confidence="EXTRACTED", **extra):
        if not src or not tgt or src == tgt:
            return False
        if src not in self.ids or tgt not in self.ids:
            return False
        pair = frozenset((src, tgt))
        if pair in self.pairs:
            # graphify stores a simple graph: a second edge on the same pair
            # would overwrite the existing (AST) relation on the next build,
            # or collapse two enriched facts (e.g. a Prisma back-relation).
            if pair in self.base_pairs:
                self.skipped_existing_pair += 1
            else:
                self.skipped_duplicate_pair += 1
            return False
        self.pairs.add(pair)
        edge = {
            "source": src, "target": tgt, "relation": relation,
            "confidence": confidence,
            "confidence_score": 1.0 if confidence == "EXTRACTED" else 0.8,
            "source_file": source_file,
            "source_location": f"L{line}" if line else None,
            "weight": 1.0, "_origin": "semantic", "enriched_by": MARK,
        }
        edge.update(extra)
        self.new_links.append(edge)
        self.counts[kind + ":" + relation] += 1
        return True


def strip_previous(graph: dict) -> tuple[int, int, int]:
    """Remove the previous enrichment layer.

    Also drops dangling edges: `graphify update --no-cluster` writes the raw
    extraction, whose unresolved import targets graphify's own graph builder
    would discard anyway. Returns (nodes, enriched edges, dangling edges).
    """
    before_n = len(graph["nodes"])
    graph["nodes"] = [n for n in graph["nodes"] if n.get("enriched_by") != MARK]
    ids = {n["id"] for n in graph["nodes"]}
    enriched = sum(1 for e in graph["links"] if e.get("enriched_by") == MARK)
    kept = [e for e in graph["links"] if e.get("enriched_by") != MARK]
    graph["links"] = [e for e in kept if e["source"] in ids and e["target"] in ids]
    for n in graph["nodes"]:
        if n.get("enriched_attrs") and "source_file" in n["enriched_attrs"]:
            n["source_file"], n["source_location"] = "", ""
            n.pop("enriched_attrs", None)
    return before_n - len(graph["nodes"]), enriched, len(kept) - len(graph["links"])


# ------------------------------------------------------------- a. Prisma layer

def enrich_prisma(ctx: Ctx):
    text = read(SCHEMA)
    if not text:
        return {}
    schema_node = ctx.file_node(SCHEMA) or ctx.add_node(
        make_id(SCHEMA.rsplit(".", 1)[0]), "schema.prisma", "code", SCHEMA, 1)
    blocks = {}
    for m in re.finditer(r"^(model|enum)\s+(\w+)\s*\{(.*?)^\}", text, flags=re.M | re.S):
        kind, name, body = m.group(1), m.group(2), m.group(3)
        line = line_of(text, m.start())
        nid = make_id("prisma", kind, name)
        ctx.add_node(nid, name, "code", SCHEMA, line, prisma_kind=kind)
        blocks[name] = (kind, nid, body, line, m.start(3))
        ctx.counts["a:" + kind + "_nodes"] += 1
        ctx.add_edge("a", schema_node, nid, "contains", SCHEMA, line)
    for name, (kind, nid, body, line, off) in blocks.items():
        if kind != "model":
            continue
        for fm in re.finditer(r"^\s*(\w+)\s+(\w+)(\[\])?\??", body, flags=re.M):
            ftype = fm.group(2)
            if ftype not in blocks or ftype == name:
                continue
            fline = line_of(text, off + fm.start(1))
            rel_name = "relates_to" if blocks[ftype][0] == "model" else "uses_enum"
            ctx.add_edge("a", nid, blocks[ftype][1], rel_name, SCHEMA, fline,
                         field=fm.group(1))

    accessor = {n[0].lower() + n[1:]: n for n, b in blocks.items() if b[0] == "model"}
    call_re = re.compile(
        r"\b(?:this\.prisma|this\.db|prisma|tx|trx)\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\(")
    for path in walk(API_ROOTS):
        src = ctx.file_node(path)
        if not src:
            continue
        code = strip_comments(read(path))
        per_owner = collections.defaultdict(lambda: collections.defaultdict(set))
        first_line = {}
        for m in call_re.finditer(code):
            model = accessor.get(m.group(1))
            op = m.group(2)
            if not model or (op not in READ_OPS and op not in WRITE_OPS):
                continue
            ln = line_of(code, m.start())
            owner = ctx.enclosing_callable(path, ln) or src
            per_owner[owner][model].add(op)
            first_line.setdefault((owner, model), ln)
        for owner, models in per_owner.items():
            for model, ops in sorted(models.items()):
                relation = "writes_model" if ops & WRITE_OPS else "reads_model"
                ctx.add_edge("a", owner, blocks[model][1], relation, path,
                             first_line[(owner, model)], prisma_ops=sorted(ops))

    imp_re = re.compile(r"import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['\"]@prisma/client['\"]")
    for path in walk(API_ROOTS + FRONT_ROOTS, skip_tests=False):
        src = ctx.file_node(path)
        if not src:
            continue
        code = read(path)
        for m in imp_re.finditer(code):
            ln = line_of(code, m.start())
            for raw in m.group(1).split(","):
                name = re.sub(r"^\s*type\s+", "", raw).split(" as ")[0].strip()
                if name in blocks:
                    ctx.add_edge("a", src, blocks[name][1], "imports", path, ln)
    return blocks


# ------------------------------------------------------------ b. GraphQL layer

_TOKEN = re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\.\.\.|[A-Za-z_]\w*|\$|[{}():@!\[\]=,]|-?\d[\w.]*')


def parse_graphql(doc: str):
    """Return [(op_type, op_name, root_fields, nested_fields)] for a document."""
    doc = re.sub(r"\$\{[^}]*\}", " ", doc)
    doc = re.sub(r"#[^\n]*", " ", doc)
    toks = _TOKEN.findall(doc)
    ops, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t in ("query", "mutation", "subscription", "fragment", "{"):
            op_type = "query" if t == "{" else t
            name = None
            if t != "{":
                i += 1
                if i < len(toks) and re.match(r"[A-Za-z_]", toks[i]):
                    name = toks[i]
                while i < len(toks) and toks[i] != "{":
                    i += 1
            depth, roots, nested = 0, [], set()
            expect_field, pdepth = True, 0
            while i < len(toks):
                t = toks[i]
                if t == "(":
                    pdepth += 1
                elif t == ")":
                    pdepth -= 1
                elif pdepth:
                    pass
                elif t == "{":
                    depth += 1
                elif t == "}":
                    depth -= 1
                    if depth == 0:
                        break
                elif t in ("...", "@"):
                    i += 1  # skip spread target / directive name ("on" handled below)
                    if i < len(toks) and toks[i] == "on":
                        i += 1
                elif re.match(r"[A-Za-z_]", t):
                    if i + 1 < len(toks) and toks[i + 1] == ":":
                        i += 2
                        t = toks[i] if i < len(toks) else t
                    if depth == 1:
                        roots.append(t)
                    elif depth > 1:
                        nested.add(t)
                i += 1
            if op_type != "fragment":
                ops.append((op_type, name, roots, nested))
        i += 1
    return ops


def api_resolvers(ctx: Ctx):
    """{(kind, field): [(path, method_node)]} for @Query/@Mutation/@Subscription/@ResolveField."""
    index = collections.defaultdict(list)
    dec_re = re.compile(r"^[ \t]*@(Query|Mutation|Subscription|ResolveField)\(", re.M)
    for path in walk(["apps/api/src"]):
        code = read(path)
        if "@nestjs/graphql" not in code:
            continue
        for m in dec_re.finditer(code):
            end = balanced(code, m.end() - 1)
            args = code[m.end():end - 1]
            rest = code[end:]
            mm = re.search(
                r"^[ \t]*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*[(<]",
                re.sub(r"^[ \t]*@\w+(?:\((?:[^()]|\([^()]*\))*\))?[ \t]*$", "", rest[:2000], flags=re.M),
                flags=re.M)
            if not mm:
                continue
            method = mm.group(1)
            nm = re.search(r"\bname\s*:\s*['\"](\w+)['\"]", args)
            first = re.match(r"\s*['\"](\w+)['\"]", args)
            field = nm.group(1) if nm else (first.group(1) if first else method)
            ln = line_of(code, end) + rest[:mm.start()].count("\n")
            node = ctx.labeled(path, f".{method}()", ln)
            if node:
                index[(m.group(1).lower(), field)].append((path, node))
                ctx.counts["b:api_resolver_fields"] += 1
    return index


def enrich_graphql(ctx: Ctx):
    index = api_resolvers(ctx)
    kind_of = {"query": "query", "mutation": "mutation", "subscription": "subscription"}
    tpl_re = re.compile(r"`((?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*)`", re.S)
    for path in walk(FRONT_ROOTS):
        code = read(path)
        if "`" not in code:
            continue
        src_file = ctx.file_node(path)
        if not src_file:
            continue
        for m in tpl_re.finditer(code):
            body = m.group(1)
            head = code[max(0, m.start() - 60):m.start()]
            tagged = re.search(r"\b(gql|graphql)\s*$", head) or "/* GraphQL */" in head
            if not tagged and not re.match(r"\s*(#graphql\s*)?(query|mutation|subscription)\b\s*\w*\s*[({]", body):
                continue
            ops = parse_graphql(body)
            if not ops:
                continue
            ln = line_of(code, m.start())
            const = re.search(r"(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:gql|graphql)?\s*(?:/\*\s*GraphQL\s*\*/)?\s*$", head)
            owner = None
            if const:
                owner = ctx.labeled(path, const.group(1), ln)
            owner = owner or ctx.enclosing_callable(path, ln) or src_file
            ctx.counts["b:gql_documents"] += 1
            for op_type, op_name, roots, nested in ops:
                for field in roots:
                    for api_path, target in index.get((kind_of[op_type], field), []):
                        ctx.add_edge("b", owner, target, "calls_api", path, ln,
                                     operation=op_name or "", graphql_field=field)
                for field in sorted(nested):
                    hits = index.get(("resolvefield", field), [])
                    if len(hits) == 1:
                        ctx.add_edge("b", owner, hits[0][1], "calls_api", path, ln,
                                     confidence="INFERRED", operation=op_name or "",
                                     graphql_field=field)


# --------------------------------------------------------------- c. Auth layer

_CLASS_CACHE: dict = {}


def api_class(ctx: Ctx, name: str):
    if name in _CLASS_CACHE:
        return _CLASS_CACHE[name]
    cands = [n for n in ctx.nodes + ctx.new_nodes
             if n.get("label") == name and n.get("_callable_class")
             and str(n.get("source_file", "")).startswith("apps/api/src")]
    cands.sort(key=lambda n: (".spec." in n["source_file"], n["source_file"]))
    _CLASS_CACHE[name] = cands[0]["id"] if cands else None
    return _CLASS_CACHE[name]


def decorated_target(ctx: Ctx, path: str, code: str, end: int):
    """Node decorated by the decorator ending at ``end`` (class or method)."""
    rest = code[end:end + 3000]
    cleaned = re.sub(r"^[ \t]*@\w+(?:\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))?[ \t]*$", "", rest, flags=re.M)
    m = re.search(r"^[ \t]*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)|"
                  r"^[ \t]*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*[(<]",
                  cleaned, flags=re.M)
    if not m:
        return None
    # Line numbers: map back through the uncleaned text by searching the name.
    name = m.group(1) or m.group(2)
    idx = rest.find(name)
    ln = line_of(code, end + max(idx, 0))
    if m.group(1):
        return ctx.labeled(path, name, ln)
    return ctx.labeled(path, f".{name}()", ln)


def enrich_auth(ctx: Ctx):
    strategies = {}
    auth_guard_nodes = {}
    module_enum = None
    for n in ctx.nodes:
        if n.get("label") == "ModuleCode" and n.get("source_file", "").startswith("apps/api/src/domain"):
            module_enum = n["id"]
    module_guard = api_class(ctx, "ClubModuleEnabledGuard")

    files = list(walk(["apps/api/src"]))
    for path in files:
        code = strip_comments(read(path))
        for m in re.finditer(r"class\s+(\w+)\s+extends\s+PassportStrategy\(\s*(\w+)\s*(?:,\s*['\"]([\w-]+)['\"])?", code):
            strategies[m.group(3) or m.group(2).lower()] = (ctx.labeled(path, m.group(1)), path, line_of(code, m.start()))

    def guard_node(expr: str, path: str, ln: int):
        am = re.match(r"AuthGuard\(\s*['\"]([\w-]+)['\"]\s*\)", expr)
        if am:
            strat = am.group(1)
            nid = make_id("passport", "authguard", strat)
            if nid not in auth_guard_nodes:
                ctx.add_node(nid, f"AuthGuard('{strat}')", "concept", "", None)
                auth_guard_nodes[nid] = strat
            return nid
        if re.fullmatch(r"\w+", expr):
            return api_class(ctx, expr)
        return None

    for path in files:
        code = strip_comments(read(path))
        for m in re.finditer(r"@UseGuards\(", code):
            end = balanced(code, m.end() - 1)
            ln = line_of(code, m.start())
            target = decorated_target(ctx, path, code, end)
            if not target:
                continue
            for expr in split_top(code[m.end():end - 1]):
                g = guard_node(expr, path, ln)
                if g:
                    ctx.add_edge("c", target, g, "guarded_by", path, ln)
        for m in re.finditer(r"@RequireClubModule\(\s*ModuleCode\.(\w+)\s*\)", code):
            ln = line_of(code, m.start())
            target = decorated_target(ctx, path, code, m.end())
            if not target:
                continue
            mid = make_id("modulecode", m.group(1))
            if mid not in ctx.ids:
                ctx.add_node(mid, f"ModuleCode.{m.group(1)}", "concept", "", None)
                if module_enum:
                    ctx.add_edge("c", mid, module_enum, "case_of", path, ln)
                if module_guard:
                    ctx.add_edge("c", mid, module_guard, "enforced_by", path, ln)
            ctx.add_edge("c", target, mid, "requires_module", path, ln)
        for m in re.finditer(r"class\s+(\w+)\s+extends\s+AuthGuard\(\s*['\"]([\w-]+)['\"]\s*\)", code):
            strat = strategies.get(m.group(2))
            cls = ctx.labeled(path, m.group(1))
            if strat and cls:
                ctx.add_edge("c", cls, strat[0], "uses_strategy", path, line_of(code, m.start()))
    for nid, strat in auth_guard_nodes.items():
        s = strategies.get(strat)
        if s and s[0]:
            ctx.add_edge("c", nid, s[0], "uses_strategy", s[1], s[2])


# ------------------------------------------------------------- d. x-club-id

def enrich_header(ctx: Ctx):
    hid = ctx.add_node(make_id("http", "header", "x-club-id"), "x-club-id header", "concept", "", None)
    set_re = re.compile(r"""['"]x-club-id['"]\s*(?::|\]\s*=(?!=))|\.set\(\s*['"]x-club-id['"]|setHeader\(\s*['"]x-club-id['"]|headers\.(?:set|append)\(\s*['"]x-club-id['"]""", re.I)
    read_re = re.compile(r"""headers\s*(?:\?\.)?\s*\[\s*['"]x-club-id['"]\s*\](?!\s*=(?!=))|\.get\(\s*['"]x-club-id['"]|header\(\s*['"]x-club-id['"]|@Headers\(\s*['"]x-club-id['"]""", re.I)
    for path in walk(FRONT_ROOTS + API_ROOTS, skip_tests=False):
        code = strip_comments(read(path))
        if "x-club-id" not in code.lower():
            continue
        src = ctx.file_node(path)
        if not src:
            continue
        rm = read_re.search(code)
        sm = set_re.search(code)
        # A simple graph keeps one edge per pair: API sources are readers first.
        if rm and (not sm or path.startswith("apps/api/src")):
            ctx.add_edge("d", src, hid, "reads_header", path, line_of(code, rm.start()))
        elif sm:
            ctx.add_edge("d", src, hid, "sets_header", path, line_of(code, sm.start()))


# ---------------------------------------------------------- e. docs -> code

def enrich_docs(ctx: Ctx):
    path_re = re.compile(r"(?<![\w/.-])((?:apps|packages|bin)/[\w@./-]*[\w-])")
    for folder in ("docs/memory/decisions", "docs/memory/pitfalls"):
        base = ROOT / folder
        if not base.exists():
            continue
        for f in sorted(base.glob("*.md")):
            doc_path = rel(f)
            doc = ctx.file_node(doc_path)
            if not doc:
                cands = [n for n in ctx.by_file.get(doc_path, []) if n.get("file_type") == "document"]
                cands.sort(key=lambda n: len(n["id"]))
                doc = cands[0]["id"] if cands else None
            if not doc:
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            seen = set()
            for m in path_re.finditer(text):
                target_path = m.group(1).rstrip(".")
                target_path = re.sub(r"[:#].*$", "", target_path)
                if target_path in seen or not (ROOT / target_path).is_file():
                    continue
                seen.add(target_path)
                tgt = ctx.file_node(target_path)
                if tgt:
                    ctx.add_edge("e", doc, tgt, "documents", doc_path, line_of(text, m.start()))


# ------------------------------------------- decorator source_file backfill

def backfill_decorators(ctx: Ctx):
    """Sourceless AST decorator stubs get the file of the node that references them.

    Merging them into one node per decorator is technically possible but would
    create >100-degree hubs (Injectable, ObjectType...) that distort clustering
    and god-node analysis, and every AST re-extraction recreates the per-file
    stubs anyway. A reversible source_file backfill keeps them navigable.
    """
    sourceless = {n["id"]: n for n in ctx.nodes if n.get("_origin") == "ast" and not n.get("source_file")}
    for e in ctx.links:
        for a, b in ((e["source"], e["target"]), (e["target"], e["source"])):
            n = sourceless.get(b)
            if n is not None and not n.get("source_file") and e.get("source_file"):
                n["source_file"] = e["source_file"]
                n["source_location"] = e.get("source_location") or ""
                n["enriched_attrs"] = ["source_file"]
                ctx.counts["decorators:source_file_backfilled"] += 1


# ------------------------------------------------------------------ recluster
#
# Community names. graphify keeps LLM names in .graphify_labels.json keyed by
# community id and only reuses them when a membership signature is unchanged;
# otherwise it renames the community after its hub node and overwrites the file.
# Louvain is order-sensitive, so any plain `graphify update` (git hook) can
# silently replace curated names with hub names. To make names durable we keep
# a store of curated names with the member ids they last covered, absorb every
# non-hub name we see, and re-attach names by member overlap after clustering.

def _hub_like(name: str, node_labels: set) -> bool:
    return (not name or re.fullmatch(r"Community \d+", name) is not None
            or name in node_labels or name + "()" in node_labels)


def _node_labels(graph: dict) -> set:
    return {str(n.get("label", "")) for n in graph["nodes"]}


def _load_store() -> dict:
    if NAMES.exists():
        try:
            data = json.loads(NAMES.read_text(encoding="utf-8"))
            return {"names": data.get("names", {}), "node_community": data.get("node_community", {})}
        except (OSError, ValueError):
            pass
    return {"names": {}, "node_community": {}}


def _absorb(store: dict, graph: dict) -> int:
    """Record curated (non-hub) community names found in a graph.json."""
    labels = _node_labels(graph)
    members = collections.defaultdict(list)
    names = {}
    for n in graph["nodes"]:
        cid = n.get("community")
        if cid is None:
            continue
        members[cid].append(n["id"])
        if n.get("community_name"):
            names[cid] = n["community_name"]
    absorbed = 0
    for cid, name in names.items():
        if not _hub_like(name, labels):
            store["names"][name] = sorted(members[cid])
            absorbed += 1
    for n in graph["nodes"]:
        if n.get("community") is not None:
            store["node_community"][n["id"]] = n["community"]
    return absorbed


def snapshot(graph: dict) -> None:
    store = _load_store()
    absorbed = _absorb(store, graph)
    NAMES.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    print(f"community names: {absorbed} curated names absorbed, {len(store['names'])} in store")


def recluster(graph: dict) -> None:
    from graphify.build import build_from_json
    from graphify.cluster import (cluster, score_all, remap_communities_to_previous,
                                  label_communities_by_hub, community_member_sigs)
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.report import generate, load_learning_for_report
    from graphify.export import to_json
    from graphify.exporters.html import to_html, _viz_node_limit, _HTML_STALE_MARKER

    store = _load_store()
    _absorb(store, graph)
    prev = dict(store["node_community"])

    G = build_from_json(graph, directed=bool(graph.get("directed", False)))
    communities = remap_communities_to_previous(cluster(G), prev)
    hub = label_communities_by_hub(G, communities)

    # Greedy one-to-one matching of curated names to new communities by overlap;
    # a name needs >= 40% of the smaller side, which tolerates the reshuffle
    # enrichment edges or a new clustering order cause.
    cand = []
    member_sets = {cid: set(m) for cid, m in communities.items()}
    owner = {}
    for cid, ms in member_sets.items():
        for nid in ms:
            owner[nid] = cid
    for name, ids in store["names"].items():
        counts = collections.Counter(owner[i] for i in ids if i in owner)
        for cid, ov in counts.items():
            if ov * 5 >= 2 * min(len(member_sets[cid]), len(ids)):
                cand.append((ov, name, cid))
    cand.sort(key=lambda t: (-t[0], t[1], t[2]))
    labels, used_names = {}, set()
    for ov, name, cid in cand:
        if cid in labels or name in used_names:
            continue
        labels[cid] = name
        used_names.add(name)
    kept = len(labels)
    for cid in communities:
        labels.setdefault(cid, hub[cid])

    cohesion = score_all(G, communities)
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    questions = suggest_questions(G, communities, labels)
    commit = graph.get("built_at_commit")

    (OUT / _HTML_STALE_MARKER).touch()
    to_json(G, communities, str(GRAPH), force=True, built_at_commit=commit, community_labels=labels)

    report_path = OUT / "GRAPH_REPORT.md"
    words = 0
    if report_path.exists():
        wm = re.search(r"~([\d,]+) words", report_path.read_text(encoding="utf-8"))
        words = int(wm.group(1).replace(",", "")) if wm else 0
    code_files = sorted({d.get("source_file") for _, d in G.nodes(data=True) if d.get("source_file")})
    detection = {"files": {"code": code_files, "document": [], "paper": [], "image": []},
                 "total_files": len(code_files), "total_words": words}
    report = generate(G, communities, cohesion, labels, gods, surprises, detection,
                      {"input": 0, "output": 0}, str(ROOT), suggested_questions=questions,
                      built_at_commit=commit, learning=load_learning_for_report(GRAPH))
    report_path.write_text(report, encoding="utf-8")
    lf = OUT / ".graphify_labels.json"
    lf.write_text(json.dumps({str(k): v for k, v in sorted(labels.items())}, ensure_ascii=False, indent=2) + "\n",
                  encoding="utf-8")
    (OUT / ".graphify_labels.json.sig").write_text(
        json.dumps({str(k): v for k, v in community_member_sigs(communities).items()}), encoding="utf-8")

    # Matched names follow their community; unmatched ones keep their last
    # members so they can re-attach after a later reshuffle.
    for cid, name in labels.items():
        if name in used_names:
            store["names"][name] = sorted(communities[cid])
    store["node_community"] = {nid: cid for cid, ms in communities.items() for nid in ms}
    NAMES.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")

    html = False
    limit = _viz_node_limit()
    if limit > 0:
        try:
            html = to_html(G, communities, str(OUT / "graph.html"), community_labels=labels, node_limit=limit)
        except ValueError as exc:
            print(f"graph.html skipped: {exc}")
    if html:
        (OUT / _HTML_STALE_MARKER).unlink(missing_ok=True)
    print(f"recluster: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, "
          f"{len(communities)} communities ({kept} curated names re-attached, "
          f"{len(communities) - kept} hub-named; store holds {len(store['names'])})", flush=True)


# ----------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--graph", default=str(GRAPH))
    ap.add_argument("--recluster", action="store_true", help="recompute communities/report/html")
    ap.add_argument("--snapshot", action="store_true", help="absorb curated community names from --graph and exit")
    ap.add_argument("--stats", action="store_true", help="dry run: print counts only")
    args = ap.parse_args()

    globals()["GRAPH"] = Path(args.graph)
    graph = json.loads(Path(args.graph).read_text(encoding="utf-8"))
    if "links" not in graph and "edges" in graph:
        graph["links"] = graph.pop("edges")
    if args.snapshot:
        snapshot(graph)
        return 0

    removed_n, removed_e, removed_dangling = strip_previous(graph)
    ctx = Ctx(graph)
    backfill_decorators(ctx)
    enrich_prisma(ctx)
    enrich_graphql(ctx)
    enrich_auth(ctx)
    enrich_header(ctx)
    enrich_docs(ctx)

    graph["nodes"].extend(ctx.new_nodes)
    graph["links"].extend(ctx.new_links)
    ids = {n["id"] for n in graph["nodes"]}
    dangling = sum(1 for e in graph["links"] if e["source"] not in ids or e["target"] not in ids)

    print(f"removed previous layer: {removed_n} nodes, {removed_e} edges "
          f"(+{removed_dangling} dangling raw edges)")
    by_group = collections.defaultdict(list)
    for k, v in sorted(ctx.counts.items()):
        by_group[k.split(":")[0]].append(f"{k.split(':', 1)[1]}={v}")
    for grp in ("a", "b", "c", "d", "e", "decorators"):
        print(f"  {grp}: " + ", ".join(by_group.get(grp, ["-"])))
    print(f"added: {len(ctx.new_nodes)} nodes, {len(ctx.new_links)} edges "
          f"(skipped pairs: {ctx.skipped_existing_pair} already linked by graphify, "
          f"{ctx.skipped_duplicate_pair} duplicate inside the layer); "
          f"graph: {len(graph['nodes'])} nodes, {len(graph['links'])} edges, dangling={dangling}")
    if args.stats:
        return 0
    if args.recluster:
        recluster(graph)
    else:
        write_json_atomic(Path(args.graph), graph)
    return 0


if __name__ == "__main__":
    sys.exit(main())
