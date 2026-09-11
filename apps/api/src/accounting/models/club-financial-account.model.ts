import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ClubFinancialAccountKind } from '@prisma/client';
import { CsvMappingGraph } from '../bank-import/models/bank-statement.model';

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

  /** Solde d'ouverture à la date de reprise (ADR-0014 §1). Null = non renseigné. */
  @Field(() => Int, { nullable: true })
  openingBalanceCents!: number | null;

  /** « YYYY-MM-DD ». */
  @Field(() => String, { nullable: true })
  openingBalanceOn!: string | null;

  /** Mapping CSV mémorisé au premier import de relevé (ADR-0014 §3). */
  @Field(() => CsvMappingGraph, { nullable: true })
  csvMapping!: CsvMappingGraph | null;
}
