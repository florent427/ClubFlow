import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { VitrineDomainStatus } from '@prisma/client';

registerEnumType(VitrineDomainStatus, {
  name: 'VitrineDomainStatus',
  description:
    "État du domaine custom vitrine d'un club (cf. Club.customDomainStatus, ADR-0007).",
});

/**
 * ⚠️ Tous les champs nullable doivent déclarer leur type GraphQL **explicitement**
 * via `@Field(() => Type, ...)`. NestJS GraphQL ne peut pas inférer le type
 * depuis `string | null` ou `Date | null` (TypeScript efface l'union à la
 * compilation, le type runtime reçu par le décorateur devient `Object`).
 * Sans le `() => Type` explicite, on crash au boot avec UndefinedTypeError.
 * Cf. pitfall `nestjs-graphql-nullable-needs-explicit-type.md`.
 */
@ObjectType()
export class VitrineDomainStateGql {
  @Field(() => String, {
    nullable: true,
    description:
      "Domaine custom configuré (FQDN), null si jamais configuré.",
  })
  customDomain!: string | null;

  @Field(() => VitrineDomainStatus)
  status!: VitrineDomainStatus;

  @Field(() => Date, {
    nullable: true,
    description: "Date dernier check DNS (ISO).",
  })
  checkedAt!: Date | null;

  @Field(() => String, {
    nullable: true,
    description: "Message d'erreur dernier check (DNS pas propagé, etc.).",
  })
  errorMessage!: string | null;

  @Field(() => String, {
    description: "IP IPv4 attendue à laquelle le domaine doit pointer.",
  })
  expectedIpv4!: string;

  @Field(() => String, {
    description: "IP IPv6 attendue (optionnelle).",
  })
  expectedIpv6!: string;
}

export { VitrineDomainStatus };
