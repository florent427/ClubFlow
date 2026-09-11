# Piège — renvoyer un objet lu par Apollo comme input GraphQL (`__typename`)

## Symptôme

Un formulaire admin renvoie à l'API un objet qu'il vient de recevoir d'une
query ou d'une mutation (un mapping de colonnes, une adresse, une option de
configuration) et la mutation échoue avec :

```
Field "__typename" is not defined by type "CsvMappingInput".
```

Rien ne le signale en local tant qu'on ne renvoie pas l'objet **tel quel** :
`InMemoryCache` d'Apollo Client ajoute `__typename` à chaque objet des
résultats (`addTypename` est vrai par défaut), et les types `input` GraphQL
refusent tout champ inconnu.

Revenu le même jour sur `PayerCard.tsx` (lot 4) : les parts d'un virement
proposées par le serveur, renvoyées telles quelles, ont valu un 400 et un
bouton « Encaisser » qui n'encaissait rien. Le symptôme est discret : le
réseau montre un POST 400, la page ne change pas.

Rencontré le 2026-09-11 sur `ImportStatementDrawer.tsx` (mapping CSV
détecté par `previewCsvStatement`, corrigé par l'utilisateur, renvoyé à
`previewCsvStatement` puis `importBankStatement`).

## Cause

Le type TypeScript de l'admin (`CsvMapping`) ne déclare pas `__typename`,
donc le compilateur laisse passer ; l'objet réel en porte un.

## Fix

Recopier explicitement les champs attendus par l'input avant l'envoi —
`cleanMapping()` dans `apps/admin/src/pages/accounting/reconciliation/format.ts`.
Une fonction de copie par champ vaut mieux qu'un `delete obj.__typename` :
elle protège aussi des champs ajoutés plus tard au type de sortie et absents
de l'input.

## Comment le reconnaître en écrivant

Chaque fois qu'une variable de mutation est construite à partir de `data.xxx`
d'un `useQuery`/`useMutation` (et pas d'un state saisi), se demander : cet
objet passe-t-il par un type `input` ? Si oui, recopier les champs.
