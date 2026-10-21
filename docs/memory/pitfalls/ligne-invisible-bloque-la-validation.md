# Piège — une ligne que l'écran ne montre pas bloque la validation « toutes lignes »

## Symptôme

Une écriture créée par « Scanner un reçu » reste au statut **« À valider »**
alors que toutes ses lignes affichées dans le tiroir de revue sont cochées.
Aucune erreur, aucun bouton pour débloquer : « Valider » sur chaque ligne a
déjà été cliqué.

```sql
SELECT "accountCode", "validatedAt" FROM "AccountingEntryLine"
 WHERE "entryId" = '<id>';
-- 606800 | 2026-10-21 …
-- 530000 |                 ← la contrepartie caisse, jamais validée
```

## Contexte

`AccountingService.validateEntryLine` passe l'écriture en `POSTED` quand
plus aucune de ses lignes n'a `validatedAt` à `null` — **contrepartie
comprise** (compte `51x` banque, `53x` caisse).

`ReceiptOcrService` créait la contrepartie sans `validatedAt`, à deux
endroits : l'écriture squelette posée avant l'analyse et
`applyDecisionToEntry` qui la réécrit après. L'écran de revue
(`AccountingPage.tsx`, filtre `articleLines`) ne liste, lui, que les
lignes d'articles : la contrepartie n'y apparaît pas, donc personne ne
peut la valider.

Rencontré en prod le 2026-10-21 sur SKSR, corrigé en v0.79.2.

## Cause root

Une condition « toutes les lignes » (une agrégation sur la table) et un
écran qui n'en expose qu'un sous-ensemble (un filtre côté client). Les deux
ont été écrits séparément ; rien ne vérifie que l'écran permet d'atteindre
l'état que la condition exige. Une ligne masquée à l'état initial
« à faire » rend l'invariant impossible à satisfaire.

## Solution

- Une ligne que l'utilisateur n'a pas à revoir (contrepartie calculée,
  ligne technique) **naît validée** : `validatedAt: new Date()` à la
  création, avec un commentaire disant pourquoi.
- Le test le prouve sur les données écrites, pas sur l'écran :
  `receipt-ocr-counterpart.spec.ts` vérifie que la contrepartie a
  `validatedAt` et que l'article ne l'a pas.
- Écritures déjà bloquées : « Modifier → Valider définitivement » côté
  admin, qui poste sans repasser par les lignes.

## Pourquoi NE PAS faire

- ❌ Afficher la contrepartie dans l'écran de revue pour qu'on la coche :
  l'utilisateur valide un montant qu'il n'a pas choisi, un clic de plus
  sans valeur.
- ❌ Exclure les comptes `51x` / `53x` du `count` de `validateEntryLine` :
  la règle s'appliquerait aussi aux écritures saisies à la main, où une
  ligne de banque peut être à revoir.

## Détection

Écrire une création de lignes : se demander, pour chaque ligne, **quel
écran la rend validable**. Aucun → elle naît validée.

En base, les écritures coincées :

```sql
SELECT e.id FROM "AccountingEntry" e
 WHERE e.status = 'NEEDS_REVIEW'
   AND EXISTS (SELECT 1 FROM "AccountingEntryLine" l
                WHERE l."entryId" = e.id AND l."validatedAt" IS NULL
                  AND (l."accountCode" LIKE '51%' OR l."accountCode" LIKE '53%'))
   AND NOT EXISTS (SELECT 1 FROM "AccountingEntryLine" l
                    WHERE l."entryId" = e.id AND l."validatedAt" IS NULL
                      AND l."accountCode" NOT LIKE '51%' AND l."accountCode" NOT LIKE '53%');
```

## Lié

- [garde-media-durcie-appelants-oublies.md](garde-media-durcie-appelants-oublies.md) — même session, même parcours « Scanner un reçu »
- [une-supposition-survit-a-la-decision.md](une-supposition-survit-a-la-decision.md) — poser la règle au goulot
- [decisions/0014-rapprochement-bancaire-par-releves.md](../decisions/0014-rapprochement-bancaire-par-releves.md)
