import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@InputType()
export class UpdateAccountingFiscalSettingsInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  fiscalYearStartDay?: number;

  /** « YYYY-MM-DD ». Omis = inchangé ; null = efface la date de reprise. */
  @Field(() => String, {
    nullable: true,
    description:
      'Date de reprise de la compta (YYYY-MM-DD). Omis = inchangé, null = effacé.',
  })
  @IsOptional()
  @Matches(ISO_DATE)
  accountingStartsOn?: string | null;
}

@InputType()
export class SetFinancialAccountOpeningBalanceInput {
  @Field(() => ID)
  @IsUUID()
  financialAccountId!: string;

  /** Négatif accepté : un découvert est un solde comme un autre. */
  @Field(() => Int)
  @IsInt()
  balanceCents!: number;

  /** « YYYY-MM-DD », en général la date de reprise. */
  @Field()
  @Matches(ISO_DATE)
  on!: string;
}
