# Piège — un `@Field` sur une union `string | null` fait tomber l'API au démarrage

## Symptôme

Typecheck vert, tests unitaires verts, déploiement vert jusqu'à la phase
« Restart services », puis :

```
❌ clubflow-api-staging DOWN
Active: activating (auto-restart) (Result: exit-code)
```

et dans `/var/log/clubflow-api-staging.log` :

```
UndefinedTypeError: Undefined type error. Make sure you are providing an
explicit type for the "userAgent" of the "RegisterPushSubscriptionInput" class.
```

Arrivé le 2026-09-10 au déploiement `e42a991` (Web Push) : API staging en
boucle de redémarrage pendant ~10 minutes, admin et portail hors service.

## Contexte

Un DTO GraphQL code-first NestJS :

```ts
@Field({ nullable: true })
userAgent?: string | null;   // ← union
```

## Cause root

NestJS lit le type du champ dans les métadonnées `design:type` émises par
TypeScript. Sur une union (`string | null`, `string | undefined` avec
`strictNullChecks`), TypeScript émet `Object`, que NestJS ne sait pas
traduire en type GraphQL. L'erreur n'apparaît qu'à la construction du
schéma, c'est-à-dire au boot de l'application : rien ne la détecte avant.

## Solution

Toujours donner le type explicitement dès que le champ est optionnel ou
nullable :

```ts
@Field(() => String, { nullable: true })
userAgent?: string | null;
```

Et couvrir le module par un test qui construit le schéma sans démarrer
l'API (cf. `apps/api/src/push/push.resolver.schema.spec.ts`) :

```ts
const factory = moduleRef.get(GraphQLSchemaFactory);
const schema = await factory.create([PushResolver]); // lève UndefinedTypeError
```

## Pourquoi NE PAS faire X

- ❌ Retirer `| null` du type TS pour « faire passer » : le client envoie
  bien `null`, la validation `@IsOptional` l'accepte, le type mentirait.
- ❌ Compter sur le typecheck ou `nest build` : tous deux passent.

## Détection

Avant de pousser un nouveau résolveur : `npx jest src/<module>` avec un
test de construction de schéma, ou `npm run start` en local. Sur le
serveur, la phase 7 du script de déploiement affiche le service DOWN ; le
message exact est dans le log de l'API.

## Lié

- [pitfalls/nestjs-graphql-nullable-needs-explicit-type.md](nestjs-graphql-nullable-needs-explicit-type.md)
  — même famille (nullable sans type), vue ailleurs
- `apps/api/src/push/dto/register-push-subscription.input.ts`
