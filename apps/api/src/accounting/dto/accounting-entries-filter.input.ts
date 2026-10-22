import { Field, ID, InputType } from '@nestjs/graphql';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Filtres de la liste paginée des écritures (`clubAccountingEntriesPage`). */
@InputType()
export class AccountingEntriesFilterInput {
  /** Borne inclusive. */
  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  from?: Date | null;

  /** Borne exclusive. */
  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  to?: Date | null;

  @Field(() => AccountingEntryKind, { nullable: true })
  @IsOptional()
  @IsEnum(AccountingEntryKind)
  kind?: AccountingEntryKind | null;

  @Field(() => AccountingEntryStatus, { nullable: true })
  @IsOptional()
  @IsEnum(AccountingEntryStatus)
  status?: AccountingEntryStatus | null;

  @Field(() => AccountingEntrySource, { nullable: true })
  @IsOptional()
  @IsEnum(AccountingEntrySource)
  source?: AccountingEntrySource | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string | null;

  /** Projet porté par au moins une ventilation de l'écriture. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  allocationProjectId?: string | null;

  /** Écritures dont aucune ventilation ne porte de projet. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  withoutAllocationProject?: boolean | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountCode?: string | null;

  /**
   * Recherche libre : libellés, n° de facture, référence de paiement,
   * compte, ou montant exact (« 1300 », « 1 300,00 € »).
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string | null;
}
