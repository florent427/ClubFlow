import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Chèque HORS facture (sponsor, subvention, remboursement d'un fournisseur…).
 * Crée l'écriture de produit avec 511200 en contrepartie, et le chèque en
 * portefeuille (ADR-0015).
 */
@InputType()
export class CreateStandaloneChequeInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string | null;

  @Field({ description: 'Nom porté sur le chèque.' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  drawerName!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string | null;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @Field({ description: 'Date de réception, YYYY-MM-DD. Date comptable de la recette.' })
  @Matches(ISO_DATE)
  receivedOn!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  imageAssetId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @Field({ description: 'Compte de produit (7xx) crédité.' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  accountCode!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Libellé de l’écriture. Défaut : « Chèque <émetteur> ».',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'Tranche de subvention que ce chèque règle : elle est marquée reçue et rattachée à l’écriture, sans en créer une seconde.',
  })
  @IsOptional()
  @IsUUID()
  grantInstallmentId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Tranche de sponsoring que ce chèque règle (exclusif avec la subvention).',
  })
  @IsOptional()
  @IsUUID()
  sponsorshipInstallmentId?: string | null;
}

/** Corrections d'un chèque encore en portefeuille. Le montant ne se modifie pas. */
@InputType()
export class UpdateChequeInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  drawerName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string | null;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(ISO_DATE)
  receivedOn?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

@InputType()
export class CreateChequeDepositInput {
  @Field(() => ID, { description: 'Compte bancaire crédité.' })
  @IsUUID()
  financialAccountId!: string;

  @Field({ description: 'Date du dépôt, YYYY-MM-DD.' })
  @Matches(ISO_DATE)
  depositedOn!: string;

  @Field(() => [ID])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  chequeIds!: string[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
