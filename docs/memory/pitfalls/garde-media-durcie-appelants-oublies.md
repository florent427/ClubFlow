# Piège — durcir la garde des médias casse en silence ceux qui ne passent pas le club

## Symptôme

```
[ReceiptOcrService] [OCR multi] Lecture buffer échec : Asset introuvable
```

```
{"message":"Asset introuvable","error":"Not Found","statusCode":404}
```

Côté utilisateur, rien de franc : « Scanner un reçu » affiche « Analyse IA… »
puis plus rien ; l'aperçu d'un justificatif montre le JSON ci-dessus dans
l'`<iframe>` ; le téléchargement d'un document signé échoue. Aucune alerte,
aucun test rouge : tout a tenu trois mois en prod (2026-07-19 → 2026-10-21).

## Contexte

`ae9b070` (2026-07-19) a fermé l'accès anonyme aux fichiers :
`MediaAssetsService.streamFor(assetId, { clubId, signed })` ne sert un asset
privé que si `clubId` est celui du propriétaire **ou** si l'URL porte une
signature valide (`MediaUrlSignerService`, 1 h). Sinon : 404 et non 403, pour
ne pas confirmer l'existence de l'asset.

Le correctif a mis à jour la route `GET /media/:id`. Il n'a pas touché aux
autres consommateurs, qui ont continué de compiler et de passer leurs tests :

| Consommateur | Défaut | Corrigé |
|---|---|---|
| `BankStatementOcrService` (relevés PDF) | `streamFor(id)` sans club | 2026-09-11 |
| `ReceiptOcrService.loadAssetBuffer` (scan de reçu) | idem | v0.79.1 |
| `DocumentsService.readMediaAssetBuffer` (création, signature) | idem | v0.79.1 |
| `DocumentsController` (téléchargement d'un document signé) | idem | 2026-10-21 |
| `AccountingDocumentGraph.publicUrl` (aperçu compta) | URL non signée | v0.79.3 |
| `GrantDocumentGraph` / `SponsorshipDocumentGraph.publicUrl` | URL non signée | v0.79.3 |

## Cause root

Deux façons de perdre le droit de lecture :

1. **Appel serveur sans `clubId`.** `opts` est optionnel : `streamFor(id)`
   compile, et le service le traite comme une requête anonyme. L'appelant
   avait pourtant déjà vérifié l'appartenance (`mediaAssets.get(clubId, id)`,
   `findMany({ where: { clubId } })`) — vérification qui ne se transmet pas.
2. **URL exposée brute à un navigateur.** Un `<img>`, un `<iframe>` ou un
   `<a href>` n'envoie aucun en-tête `Authorization` / `X-Club-Id`. Seule
   une URL signée passe. Un champ GraphQL `publicUrl` déclaré `@Field()`
   renvoie l'URL stockée, canonique, donc refusée.

Les tests unitaires ne voient rien : leurs doubles de `streamFor` servaient
le fichier quels que soient les arguments.

## Solution

- Appel serveur : **toujours** `streamFor(id, { clubId })`, avec le club
  déjà vérifié par l'appelant.
- Champ GraphQL d'URL média privée : signer à la sortie, jamais en base.
  - nullable → `@SignedPhotoField()` ;
  - non nullable → `@Field({ middleware: [signMediaUrl] })`
    (`media/signed-photo-field.decorator.ts`).
- Persister une URL venue du client : `stripMediaSignature()` avant écriture.
- Double de `streamFor` dans un test : **refuser comme le vrai** quand le
  club manque (cf. `receipt-ocr-media-access.spec.ts`).
- Champ signé : le prouver avec un vrai serveur GraphQL
  (`signed-document-url.spec.ts`) — le middleware de champ ne tourne pas
  dans `GraphQLSchemaFactory`.

## Pourquoi NE PAS faire

- ❌ Rendre `clubId` facultatif « pour les appels internes » ou ajouter un
  `{ internal: true }` : c'est rouvrir la porte que `ae9b070` a fermée, pour
  un appelant qui a déjà le club en main.
- ❌ Stocker l'URL signée en base : elle expire en 1 h.
- ❌ Repasser l'asset en public (`markPublic`) pour qu'il s'affiche : un
  justificatif comptable devient lisible par quiconque a l'UUID.

## Détection

Après tout durcissement d'une garde, chercher **tous** les chemins qui y
mènent, pas seulement la route modifiée :

```bash
grep -rn -A3 "streamFor(" apps/api/src --include=*.ts | grep -v "spec.ts"
grep -rnE "^\s+(publicUrl|fileUrl|url)[?!]?:" apps/api/src --include=*.model.ts -B2 | grep "@Field"
```

Le premier : chaque appel doit montrer `{ clubId }` (ou `signed`) dans ses
trois lignes — les appels s'écrivent souvent sur plusieurs lignes, un
`grep -v clubId` sur la seule ligne d'appel donne de faux positifs. Le
second liste les URL encore brutes : vérifier pour chacune si l'asset est
privé et affiché par un navigateur.

En prod, le symptôme serveur se grep :
`grep "Asset introuvable" /var/log/clubflow-api*.log`.

## Lié

- [pitfalls/rest-x-club-id-sans-appartenance.md](rest-x-club-id-sans-appartenance.md) — le durcissement voisin, côté routes REST
- [pitfalls/double-ignore-une-clause-du-where.md](double-ignore-une-clause-du-where.md) — même famille : un double plus permissif que le vrai
- [pitfalls/test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
