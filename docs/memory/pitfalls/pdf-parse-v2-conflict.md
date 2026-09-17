# Piège — `pdf-parse v2` casse à cause de conflit `pdfjs-dist` avec `pdf-to-img`

## Symptôme

Après un upgrade naïf vers `pdf-parse@2` :

```
$ cd apps/api && npm ci
npm ERR! peer dep conflict:
npm ERR!   pdf-parse@2.x requires pdfjs-dist@^4
npm ERR!   pdf-to-img@4.x requires pdfjs-dist@^3
```

ou plus subtil au runtime :

```
TypeError: Cannot read properties of undefined (reading 'GlobalWorkerOptions')
  at pdf-to-img/...
```

## Contexte

Le pipeline OCR (analyse facture/reçu) utilise :
- **`pdf-parse v1.1.1`** pour extraire le texte des PDF
- **`pdf-to-img v4`** pour convertir le PDF en images (call vision Claude
  via OpenRouter sur l'image)

Les 2 dépendent de `pdfjs-dist` mais avec des versions incompatibles.

## Cause root

`pdf-parse v2` a fait un breaking change : il dépend maintenant de
`pdfjs-dist v4`. Or `pdf-to-img v4` est encore sur `pdfjs-dist v3`.
Conflit de peer deps → npm install fail OU runtime broken (selon
hoisting npm).

## Solution

**Épingler `pdf-parse@1.1.1`** dans `apps/api/package.json` :

```json
"dependencies": {
  "pdf-parse": "1.1.1",
  "pdf-to-img": "^4.0.0"
}
```

⚠️ Pas `^1.1.1` ni `~1.1.1` — la version exacte. Sinon `npm update`
peut réintroduire le bug.

## Note sur `pdf-to-img v4` ESM-only

`pdf-to-img v4` est ESM-only (pas de CommonJS export). Le projet API
est en CJS (`"module": "commonjs"` dans tsconfig). Donc impossible de
faire `import { pdf } from 'pdf-to-img'` direct.

**Workaround** dans le service OCR :

```ts
// apps/api/src/accounting/ocr-shared.ts
const importPdfToImg = new Function('s', 'return import(s)');
const pdfToImg = await importPdfToImg('pdf-to-img');
const pages = pdfToImg.pdf(buffer, { ... });
```

→ Le `new Function('s', 'return import(s)')` empêche TypeScript de
transformer le `import()` dynamique en `require()` (ce qui casserait
ESM-only).

⚠️ Si on migre l'API en ESM (target `Node16` ou `NodeNext`), ce
workaround peut être supprimé. Pas prévu.

## Quand on peut upgrade

- `pdf-parse v2` upgrade impossible **tant que `pdf-to-img` n'a pas
  upgradé `pdfjs-dist`**
- Vérifier périodiquement : https://github.com/jhnatkin/pdf-to-img/releases

## Autre piège de la v1.1.1 : des PDF valides refusés

`pdf-parse` 1.1.1 embarque pdf.js **1.10**. Constaté le 2026-09-14 (bon de
commande fournisseur, ADR-0021) : un PDF produit par pdfkit — un simple titre
en Helvetica-Bold — est refusé avec

```
UnknownErrorException: bad XRef entry
```

alors que la table xref de pdfkit est exacte : chaque entrée pointe sur son
objet, 20 octets par entrée, vérifié entrée par entrée. Le refus dépend de la
disposition des octets — le même titre en Helvetica passe, un document plus
long passe aussi. Un test qui extrait du texte avec `pdf-parse` peut donc
rougir sans défaut du code, au premier libellé modifié.

Pour tester le texte d'un PDF produit par pdfkit, lire les flux de contenu
directement : `zlib.inflateSync` sur chaque `stream`, puis les chaînes
hexadécimales des blocs `BT … ET`, décodées en `windows-1252` (l'encodage des
polices standard). Cf. `apps/api/src/pdf/shop-purchase-order-pdf.service.spec.ts`.

## Lié

- [knowledge/stack.md](../../knowledge/stack.md) §Décisions piège
- `apps/api/src/accounting/ocr-shared.ts` (code workaround, utilisé par `receipt-ocr.service.ts`)
