# Piège — une supposition qui survit à la décision compte deux fois

## Symptôme

Aucun. Rien ne plante, rien n'est rouge : il reste simplement, dans la file
de revue comptable, une écriture qui n'a plus lieu d'être — et un bouton
« Tout valider » qui propose de la comptabiliser.

Constaté sur staging le 2026-09-11, club démo. Une ligne de relevé
« VERSEMENT ESPECES BORDEREAU 4413 · +80,00 € » portait une proposition de
l'IA à 95 % : **DÉBIT 512000 / CRÉDIT 530000, 80,00 €** — exactement
l'écriture que le dépôt saisi depuis l'écran de caisse venait de créer. La
ligne rapprochée, la proposition restait vivante. La valider aurait fait
sortir 80 € de la caisse une seconde fois.

## Cause

Deux mécanismes peuvent résoudre la même ligne :

1. la **catégorisation** propose une écriture et l'attache à la ligne
   (`proposedEntryId`), en `NEEDS_REVIEW` ;
2. le **rapprochement** relie la ligne à une écriture réelle.

Le second ne savait rien du premier. `onEntryPosted` efface la proposition
quand c'est elle qu'on valide, mais le rapprochement manuel, le
rapprochement automatique et le nouveau rapprochement à rebours rendaient
la ligne `MATCHED` en laissant l'écriture proposée dans la file.

La catégorisation tourne dès l'import : une ligne orpheline porte **presque
toujours** une proposition au moment où l'écriture réelle arrive. Le cas
n'est pas rare, c'est le cas normal.

## Solution

Poser la règle au **seul endroit** qui rend une ligne rapprochée, et non
sur chaque chemin qui y mène.

```ts
// applyMatch — le goulot par lequel passent auto, manuel et à rebours.
const current = await tx.bankStatementLine.findUnique({
  where: { id: line.id },
  select: { proposedEntryId: true },
});
await this.dropPendingProposal(clubId, line.id, current?.proposedEntryId ?? null, tx);
```

Et distinguer les deux natures :

- une proposition **encore en revue** est une supposition : elle cède, et
  son écriture est supprimée ;
- une proposition **déjà comptabilisée** est une décision humaine : on ne
  passe pas par-dessus.

## Le réflexe à garder

- Quand deux mécanismes peuvent résoudre la même chose, se demander **ce
  qu'il advient du perdant**. S'il survit, il finira par être validé.
- Une règle de ce genre se pose au goulot, pas sur les chemins. Chercher la
  fonction par laquelle tout le monde passe (`applyMatch` ici) : si elle
  n'existe pas, c'est le signe qu'il faut la créer.
- Ce défaut ne se voit pas en lisant le code d'un chemin : il se voit en
  regardant l'ÉTAT après coup. C'est la vérification sur staging qui l'a
  sorti, pas les tests unitaires.

## Lié

- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
