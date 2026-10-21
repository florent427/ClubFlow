# Piège — une garde qui injecte un service tue le démarrage du module qui l'oublie

## Symptôme

L'API ne démarre plus :

```
Nest can't resolve dependencies of the ViewerActiveProfileGuard (PrismaService, ?).
Please make sure that the argument FamiliesService at index [1] is available
in the AccountingModule module.
```

`npm run typecheck` vert, `npm test` (unitaires) vert. Seul le job CI
`tests (api e2e)` est rouge — et il tourne **après** le push.

## Contexte

`ViewerActiveProfileGuard` (`common/guards/viewer-active-profile.guard.ts`)
protège les résolveurs côté adhérent. Il injecte `PrismaService` **et**
`FamiliesService`. Une garde posée par `@UseGuards()` est instanciée dans
le module du résolveur : ce module doit donc pouvoir fournir les deux.

Rencontré le 2026-10-21 (`99c7c45` → corrigé par `ab9d5cc`) : le premier
résolveur adhérent du module comptable (frais kilométriques du portail)
a amené la garde dans `AccountingModule`, qui n'importait pas
`FamiliesModule`. Une vingtaine de fichiers utilisent cette garde ; chaque
module qui l'accueille pour la première fois peut retomber dedans.

## Cause root

L'injection de dépendances Nest se résout au démarrage, pas à la
compilation. Les tests unitaires instancient le résolveur ou le service à
la main (`new X(...)`, doubles), jamais le module : ils ne voient pas le
graphe d'injection. Seul un test qui compile `AppModule` en entier
(`test/app.e2e-spec.ts`) le construit.

## Solution

Importer le module qui exporte le service dans celui du résolveur :

```ts
@Module({
  imports: [PrismaModule, /* … */, FamiliesModule],
})
export class AccountingModule {}
```

Modèle : `blog.module.ts`, `booking.module.ts`, `club-life.module.ts`.

Avant de pousser un premier `@UseGuards(ViewerActiveProfileGuard)` (ou
toute garde / tout intercepteur qui injecte un service) dans un module,
démarrer l'API ou lancer l'e2e en local :

```bash
cd apps/api && npm run test:e2e     # demande un PostgreSQL (DATABASE_URL)
```

## Pourquoi NE PAS faire

- ❌ Déclarer `FamiliesService` dans les `providers` du module : seconde
  instance, et ses propres dépendances à fournir à leur tour.
- ❌ Se fier au vert des unitaires et du typecheck : ni l'un ni l'autre ne
  construit le graphe d'injection.

## Détection

Les modules qui utilisent la garde sans importer `FamiliesModule`. Le
résolveur peut vivre dans un sous-dossier sans module
(`accounting/mileage/`) : on remonte jusqu'au premier `*.module.ts`.

```bash
for f in $(grep -rl "ViewerActiveProfileGuard" apps/api/src --include=*.resolver.ts); do
  d=$(dirname "$f")
  while [ "$d" != "apps/api/src" ] && ! ls "$d"/*.module.ts >/dev/null 2>&1; do d=$(dirname "$d"); done
  m=$(ls "$d"/*.module.ts 2>/dev/null | head -1)
  [ -n "$m" ] && ! grep -q FamiliesModule "$m" && echo "$m"
done | sort -u
```

Vide = rien à corriger. Vérifié sur `99c7c45` : sort
`apps/api/src/accounting/accounting.module.ts`.

## Lié

- [test-que-rien-ne-lance-pourrit.md](test-que-rien-ne-lance-pourrit.md) — l'e2e n'attrape que s'il tourne
- [nestjs-graphql-nullable-needs-explicit-type.md](nestjs-graphql-nullable-needs-explicit-type.md) — autre erreur Nest vue seulement au démarrage
