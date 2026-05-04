# Piège — `@Field({ nullable: true })` GraphQL crash sans type explicite

## Symptôme

Au boot NestJS (juste après `Mapped /graphql, POST` dans les logs) :

```
/path/to/node_modules/@nestjs/graphql/dist/utils/reflection.utilts.js:17
            throw new undefined_type_error_1.UndefinedTypeError(
              get(prototype, 'constructor.name'), propertyKey, index);

UndefinedTypeError: Undefined type error.
Make sure you are providing an explicit type for the "customDomain"
of the "VitrineDomainStateGql" class.
    at reflectTypeFromMetadata (...reflection.utilts.js:17:19)
    at applyMetadataFn (...field.decorator.js:33:107)
    ...
```

Le service systemd boucle en restart (`activating (auto-restart) Result: exit-code`).

## Contexte

Tu déclares un nouveau `@ObjectType()` GraphQL avec un champ nullable :

```ts
@ObjectType()
export class VitrineDomainStateGql {
  @Field({ nullable: true })
  customDomain!: string | null;   // ← CRASH au boot
}
```

`tsc --noEmit` passe sans erreur. Le build `nest build` réussit.
Le crash arrive **uniquement au runtime**, dans la phase de génération
du schema GraphQL au démarrage.

## Cause root

`@nestjs/graphql` utilise `reflect-metadata` pour deviner le type
GraphQL depuis le type TypeScript du field décoré. Mais TypeScript
**efface les unions à la compilation** :

- `string | null` → reflect-metadata renvoie `Object` (union non
  serialisable au runtime)
- `Date | null` → idem `Object`
- `T[] | null` → idem `Object`

Sans hint explicite, NestJS ne sait pas si c'est `String`, `Int`,
`Boolean`, etc. → throw `UndefinedTypeError`.

## Solution

**Toujours déclarer un type GraphQL explicite via `() => Type`** quand le
champ est nullable :

```ts
@ObjectType()
export class VitrineDomainStateGql {
  @Field(() => String, { nullable: true })
  customDomain!: string | null;

  @Field(() => Date, { nullable: true })
  checkedAt!: Date | null;

  @Field(() => [String], { nullable: true })
  tags!: string[] | null;
}
```

Pour les champs **non-nullable**, l'inférence marche : `@Field()` suffit,
parce que TypeScript préserve les types primitifs `string`, `Date`, etc.
Mais par cohérence on peut quand même mettre `() => Type` partout.

## Pourquoi NE PAS faire

- ❌ `@Field({ nullable: true })` sur un union type → crash garanti
- ❌ Faire confiance à `tsc --noEmit` pour valider le code GraphQL — il
  ne vérifie que TypeScript, pas le schema NestJS
- ❌ Désactiver `nullable` pour contourner — change la sémantique

## Détection

Pour grep tous les `@Field(...)` sans type explicite dans le repo :

```bash
# Cherche les @Field qui n'ont pas un () => quelque chose
grep -rn "@Field({" apps/api/src/ --include='*.ts' | head -20
# Filtrer ceux qui n'ont pas { nullable: true } (les non-nullable inférés sont OK
# mais c'est plus safe d'expliciter)
grep -rn "@Field({ nullable" apps/api/src/ --include='*.ts'
```

Pour chaque match, vérifier que le `@Field` est sur un champ non-union
ou ajouter le type explicite.

## Test local pour reproduire

```bash
cd apps/api
npm run start:dev   # ou nest start
# Si le boot affiche "UndefinedTypeError" → tu as un @Field nullable sans type
```

⚠️ Le `npm run build` (= `nest build`) **ne reproduit pas** ce crash
parce que le schema n'est pas généré au build, seulement au boot.

## Lecons

1. **Type-check ≠ runtime check** pour NestJS GraphQL — toujours faire un
   boot test local avant de push.
2. **Hotfix patterns** : crash au boot d'un nouveau model = grep
   `UndefinedTypeError` dans les logs systemd, ça pointe direct sur le
   field fautif.
3. **Préventif** : ajouter au workflow `modif-locale-vers-prod` une
   étape "boot l'API en local au moins 1 fois après modif des
   `*.model.ts`" avant push.

## Lié

- [knowledge/stack.md](../../knowledge/stack.md) — NestJS 11 + GraphQL Apollo Server v5
- [runbooks/deploy.md](../../runbooks/deploy.md) — smoke test post-deploy détecte ce genre de crash
- Doc NestJS GraphQL : https://docs.nestjs.com/graphql/resolvers#schema-first-vs-code-first
