# Piège — un test vert qui certifie un invariant que le code n'a pas

## Symptôme

La suite est verte. Le test porte le bon nom, décrit la bonne propriété,
et le code ne la respecte pas.

Deux occurrences le 2026-07-19, à quelques heures d'intervalle.

**Cas 1 — le test inspecte la clause au lieu de l'exécuter.**

```ts
it('ne touche PAS une route choisie délibérément par le club', async () => {
  const { svc, updateMany } = makeSvc({ isDefault: false });
  await seedRoutes(svc);

  const where = updateMany.mock.calls[0][0].where;
  expect(where.isDefault).toBe(true);   // ← vérifie la FORME du filtre
});
```

Vert. Et pourtant le garde-fou ne gardait rien : `isDefault` vaut `true`
par défaut au schéma et **rien ne le met jamais à `false`**. La clause
matchait 100 % des routes, y compris celles choisies par un trésorier.
Le test n'a jamais exécuté le filtre — il a seulement constaté sa
présence.

**Cas 2 — le mock rend le code neuf inatteignable.**

```ts
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  refunds: { create },        // ← pas de `paymentIntents`
}));
```

Après avoir fait lire le montant remboursé *chez Stripe* plutôt qu'en
base, les 15 tests existants restaient verts — parce que
`stripe.paymentIntents.retrieve` n'existait pas sur le double, levait,
et déclenchait le **repli** sur l'ancien chemin. Le code neuf n'était
jamais exercé.

## Contexte

Les deux cas partagent une racine : **le test observe une intention, pas
un effet.** Il vérifie qu'un filtre contient telle clé, qu'une méthode a
été appelée, qu'un objet a telle forme — jamais que l'état résultant est
celui qu'on annonce.

Ça passe inaperçu parce que le test est *sincère* : son nom décrit une
vraie propriété, son auteur y croyait. Rien dans la relecture ne saute
aux yeux.

## Solution

**Faire appliquer le filtre par le double**, plutôt que d'en inspecter
la forme :

```ts
updateMany: jest.fn(async ({ where, data }) => {
  const hit = routes.filter(
    (r) => r.method === where.method && r.isDefault === where.isDefault,
  );
  hit.forEach((r) => (r.financialAccountId = data.financialAccountId));
  return { count: hit.length };
}),

// L'assertion porte alors sur l'ÉTAT, pas sur la requête :
expect(stripeRoute(routes)?.financialAccountId).toBe(BANK);
```

**Et compléter les doubles** dès qu'on ajoute un appel : un mock
incomplet ne fait pas échouer le test, il le fait passer par un autre
chemin.

## La seule vérification qui tranche : le mutation testing

Un test ne vaut que s'il **rougit** quand la propriété disparaît.

```bash
# 1. Neutraliser délibérément le garde-fou dans le code
# 2. Relancer la suite
npx jest src/… | grep "Tests:"
#    Tests: 2 failed, 4 passed   ← le test mord
# 3. Restaurer
```

Si la suite reste verte, le test ne protège rien. Ce contrôle a démasqué
les deux cas ci-dessus, et il a validé chacun des correctifs de la
session. Il coûte deux minutes.

**Le signal d'alarme** : un correctif écrit, la suite verte du premier
coup, sans qu'aucun test n'ait eu besoin d'être ajouté ou modifié. Soit
la propriété était déjà couverte — vérifiable —, soit rien ne la couvre.

## Lié

- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
  — défaut que seul le mutation testing révèle, lui aussi
