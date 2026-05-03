import {
  Field,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { MembershipPricingRulePattern } from '@prisma/client';

registerEnumType(MembershipPricingRulePattern, {
  name: 'MembershipPricingRulePattern',
  description:
    'Type de pattern de règle de remise (FAMILY_PROGRESSIVE, PRODUCT_BUNDLE, AGE_RANGE_DISCOUNT, NEW_MEMBER_DISCOUNT, LOYALTY_DISCOUNT).',
});

@ObjectType()
export class MembershipPricingRuleGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => MembershipPricingRulePattern)
  pattern!: MembershipPricingRulePattern;

  @Field()
  label!: string;

  @Field()
  isActive!: boolean;

  @Field(() => Int)
  priority!: number;

  /**
   * Config spécifique au pattern, sérialisée en JSON (string).
   * Le client la parse selon `pattern` pour récupérer un objet typé.
   * Évite la dépendance graphql-type-json non présente sur ce projet.
   */
  @Field(() => String)
  configJson!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
