# Piège — une mutation qui renvoie un type sans `id` ne met pas l'écran à jour

## Symptôme

On enregistre, la mutation répond 200 avec les bonnes valeurs… et l'écran
affiche toujours l'ancien état. Ici : onglet « Reçus fiscaux » de l'admin,
toujours « non activés » après avoir activé et enregistré. Recharger la
page corrige l'affichage. Aucune erreur, ni console ni réseau.

## Contexte

`TaxReceiptSettingsGraph` (`apps/api/src/accounting/mileage/mileage.graph.ts`)
est un objet de réglages par club : il n'a pas de champ `id`. La requête
`CLUB_TAX_RECEIPT_SETTINGS` et la mutation
`UPDATE_CLUB_TAX_RECEIPT_SETTINGS` renvoient toutes deux ce type.

Rencontré le 2026-10-21 (corrigé par `27c892e`, frais kilométriques et
reçus fiscaux). Même risque pour tout objet « réglages » ou « résumé »
exposé sans identifiant.

## Cause root

Le cache Apollo normalise un objet par `__typename` + `id`. Sans `id`, il
n'a aucune clé : la réponse de la mutation est rangée sous le champ racine
de la mutation, sans rapport avec l'objet que la requête a mis en cache
sous son propre champ racine. Les composants abonnés à la requête ne
voient donc aucun changement et gardent l'ancienne valeur.

Un type **avec** `id` n'a pas ce problème : la mutation renvoie l'objet,
Apollo fusionne par la clé, l'écran suit seul.

## Solution

Relire la requête après la mutation, en attendant la relecture pour ne
pas afficher l'ancien état entre-temps :

```ts
const [saveSettings] = useMutation(UPDATE_CLUB_TAX_RECEIPT_SETTINGS, {
  // Les réglages n'ont pas d'id : Apollo ne peut pas fusionner la réponse
  // de la mutation dans le cache, il faut relire la requête.
  refetchQueries: [CLUB_TAX_RECEIPT_SETTINGS],
  awaitRefetchQueries: true,
});
```

Alternative pour un objet unique par club, si plusieurs écrans le
lisent : déclarer une clé dans les `typePolicies` du client
(`keyFields: []` pour un singleton). L'admin n'en déclare aucune
aujourd'hui ; ne l'introduire que si le `refetchQueries` se multiplie.

## Pourquoi NE PAS faire

- ❌ Ajouter un faux `id` constant côté API pour « faire marcher le
  cache » : deux clubs partageraient la même entrée si l'admin bascule
  de club sans vider le cache.
- ❌ Mettre `fetchPolicy: 'network-only'` sur la requête : relit à chaque
  montage, mais ne rafraîchit pas un composant déjà monté après la
  mutation.

## Détection

En écrivant une mutation, regarder le type renvoyé : pas de champ
`@Field(() => ID) id` → prévoir `refetchQueries` (ou une mise à jour
manuelle du cache) dès l'écriture.

Lister les `@ObjectType` sans champ `id`, classe par classe (un fichier
contient souvent plusieurs types, un `grep -L` par fichier ne voit rien) :

```bash
find apps/api/src -name '*.graph.ts' -o -name '*.model.ts' | xargs awk '
  /@ObjectType\(/ { pending=1; next }
  pending && /^export class / { cls=$3; id=0; open=1; pending=0; next }
  open && /@Field\(\(\) => ID\)/ { nextid=1; next }
  open && nextid && /^[[:space:]]+id[!?]?:/ { id=1 }
  open { nextid=0 }
  open && /^}/ { if (!id) print FILENAME ": " cls; open=0 }
'
```

≈ 120 résultats au 2026-10-21, surtout des sous-objets (lignes, groupes,
compteurs) sans risque. Seuls comptent ceux **renvoyés par une mutation**
et lus par une requête à l'écran. Vérifié : sort
`TaxReceiptSettingsGraph`, pas `MileageVehicleGraph` (qui a un `id`).

## Lié

- [apollo-typename-dans-les-inputs.md](apollo-typename-dans-les-inputs.md) — autre effet de bord du cache Apollo
- [nestjs-graphql-nullable-needs-explicit-type.md](nestjs-graphql-nullable-needs-explicit-type.md)
