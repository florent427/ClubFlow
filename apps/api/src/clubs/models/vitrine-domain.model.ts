import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { VitrineDomainStatus } from '@prisma/client';

registerEnumType(VitrineDomainStatus, {
  name: 'VitrineDomainStatus',
  description:
    "État du domaine custom vitrine d'un club (cf. Club.customDomainStatus, ADR-0007).",
});

@ObjectType()
export class VitrineDomainStateGql {
  @Field({ nullable: true, description: "Domaine custom configuré (FQDN), null si jamais configuré." })
  customDomain!: string | null;

  @Field(() => VitrineDomainStatus)
  status!: VitrineDomainStatus;

  @Field({ nullable: true, description: "Date dernier check DNS (ISO)." })
  checkedAt!: Date | null;

  @Field({ nullable: true, description: "Message d'erreur dernier check (DNS pas propagé, etc.)." })
  errorMessage!: string | null;

  @Field({ description: "IP IPv4 attendue à laquelle le domaine doit pointer." })
  expectedIpv4!: string;

  @Field({ description: "IP IPv6 attendue (optionnelle)." })
  expectedIpv6!: string;
}

export { VitrineDomainStatus };
