# Piège — Un test que rien ne lance pourrit en silence

## Symptôme

Premier passage de l'e2e de l'API en CI, le 2026-09-17, après des mois sans
exécution :

```
test/app.e2e-spec.ts: error TS2304: Cannot find name 'uniquePseudo'.
```

Une fois ce nom défini, 6 tests sur 20 échouent encore. Un septième écart
n'apparaît qu'une fois ceux-là corrigés : Jest s'arrête à la première
assertion rouge de chaque test.

```
Expected: "6e8955fe-…"   Received: null          (verifyEmail.contactClubId)
Expected value: "dc0333bb-…"   Received array: ["f9544e72-…"]   (profils du foyer étendu)
Expected: 200   Received: 400                    (createClubGrantApplication, puis createClubSponsorshipDeal)
TypeError: Cannot read properties of null (reading 'login')
No record was found for a delete.                (prisma.user.delete après deleteClubContact)
```

## Contexte

`apps/api/test/app.e2e-spec.ts` a été écrit en mars 2026, puis n'a plus été
lancé. Aucun workflow n'appelait Jest (audit du 2026-09-14, priorité 3), et
`npm run typecheck` ne compilait que `src/**/*`. Pendant ce temps, le code
évoluait normalement.

## Cause root

Ce test n'avait aucun juge. Chaque échec vient d'un changement légitime que
personne n'a reporté dans le test :

- **Compilation** : `test/` était hors de l'`include` de `tsconfig.json`. Seul
  Jest compilait ce fichier, et personne ne lançait Jest sur lui. Le helper
  `uniquePseudo` manquait depuis avril.
- **Règle changée volontairement** : depuis la v0.2.0, un parent ne voit les
  enfants d'un autre foyer du groupe qu'après l'invitation de ce foyer.
  Le test attendait l'ancienne règle, « tous les mineurs du groupe ».
- **Comportement changé volontairement** : `registerContact` rend le contact
  payeur de son foyer. `verifyEmail` renvoie donc un profil, et
  `contactClubId` reste nul.
- **Entrées changées** :
  - pour une subvention, `amountCents` est devenu `requestedAmountCents` ;
  - un sponsoring demande `kind` et `valueCents`.
- **Nettoyage ajouté** : `deleteClubContact` supprime aussi le compte quand
  plus aucune fiche ne le référence. Le `prisma.user.delete` final du test ne
  trouve donc plus rien à supprimer.
- **Limite de débit** : toutes les requêtes supertest viennent de 127.0.0.1.
  La suite se connecte plus de 20 fois par minute, la limite de `login`. Les
  derniers tests reçoivent `data: null`.

## Solution

1. **Donner un juge au test** : `.github/workflows/tests.yml` lance l'e2e sur
   PostgreSQL 16 et Mailpit à chaque PR. `tsconfig.json` inclut `test/**/*`,
   donc `npm run typecheck` compile aussi les tests (le build les exclut
   toujours, via `tsconfig.build.json`).
2. **Avant de « réparer » un vieux test rouge, chercher si la règle a changé
   exprès** : lancer `git log` sur le fichier de la règle, et lire sa
   docstring. Ici, la règle était documentée comme un modèle d'invitation
   unilatéral. C'est le test qui avait tort : ne jamais retoucher le code pour
   qu'un vieux test repasse.
3. **Réécrire l'attente sur la règle actuelle, des deux côtés** : ce qu'on ne
   voit pas sans invitation, puis ce qu'on voit une fois l'invitation acceptée
   par le vrai parcours (`createFamilyInvite`, `acceptFamilyInvite`).
4. **Limite de débit dans l'e2e** : faire comme en prod. L'application de test
   appelle `trustLocalReverseProxy(app)`, et chaque test envoie sa propre
   adresse dans `X-Forwarded-For` (compteur réinitialisé par `beforeEach`).
   Ne pas désactiver le throttler.

## Pourquoi NE PAS faire

- ❌ Aligner le code sur l'ancien test : cela aurait rouvert aux co-parents
  les enfants d'un foyer sans son consentement.
- ❌ Passer les tests rouges en `it.skip` : ils redeviendraient des tests que
  rien ne lance.
- ❌ Désactiver `GqlThrottlerGuard` dans l'e2e : un seul visiteur par test
  reproduit la prod et garde la limite active.

## Détection

- Un fichier de test lancé par aucun workflow : chercher son script
  (`test:e2e`, etc.) dans `.github/workflows/`.
- Un dossier de tests hors de l'`include` du `tsconfig.json` de l'appli :
  `npx tsc --noEmit --listFilesOnly | grep /test/` ne renvoie rien.

## Lié

- [pitfalls/throttler-sans-trust-proxy.md](throttler-sans-trust-proxy.md)
- [pitfalls/typecheck-noop-solution-tsconfig.md](typecheck-noop-solution-tsconfig.md)
- [pitfalls/test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [pitfalls/juge-non-fiable-verdict-sans-valeur.md](juge-non-fiable-verdict-sans-valeur.md)
