import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ClubFinancialAccountKind } from '@prisma/client';

registerEnumType(ClubFinancialAccountKind, {
  name: 'ClubFinancialAccountKind',
  description:
    'Type de compte financier club : banque, caisse, transit Stripe, autres transits.',
});

@ObjectType()
export class ClubFinancialAccountGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ClubFinancialAccountKind)
  kind!: ClubFinancialAccountKind;

  @Field()
  label!: string;

  @Field(() => ID)
  accountingAccountId!: string;

  /** Code PCG du compte comptable lié (ex "512100"). */
  @Field()
  accountingAccountCode!: string;

  /** Libellé du compte comptable lié (ex "Crédit Agricole pro"). */
  @Field()
  accountingAccountLabel!: string;

  @Field(() => String, { nullable: true })
  iban!: string | null;

  @Field(() => String, { nullable: true })
  bic!: string | null;

  @Field(() => String, { nullable: true })
  stripeAccountId!: string | null;

  @Field()
  isDefault!: boolean;

  @Field()
  isActive!: boolean;

  @Field(() => Int)
  sortOrder!: number;

  @Field(() => String, { nullable: true })
  notes!: string | null;
}
