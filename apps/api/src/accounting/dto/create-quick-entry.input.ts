import { Field, InputType, Int } from '@nestjs/graphql';
import { AccountingEntryKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Un article au sein d'une facture (ex: "Ordinateur portable" dans une
 * facture fournisseur). Chaque article = 1 ligne comptable dans
 * l'écriture générée. L'IA catégorise CHAQUE article séparément.
 */
@InputType()
export class QuickEntryArticleInput {
  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;

  /** Compte optionnel : si fourni, court-circuite la suggestion IA. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  accountCode?: string;

  /**
   * Override de la ventilation analytique POUR CET ARTICLE. Si `null`,
   * on utilise le `projectId` / `cohortCode` / `disciplineCode` global
   * de l'écriture. Permet les factures mixtes (ex : Tatamis → projet
   * "Coupe SKSR", Sifflet → Fonctionnement général).
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  cohortCode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  disciplineCode?: string;
}

/**
 * Input pour la création "rapide" d'une écriture par facture :
 * - Mode simple : 1 seul article avec label + montant → 1 ligne débit +
 *   contrepartie banque.
 * - Mode facture multi-lignes : `articles[]` avec ≥ 2 items → N lignes
 *   débit (une par article, compte IA par article) + 1 contrepartie
 *   crédit (banque) totalisant la somme des articles.
 *
 * L'IA catégorise chaque article EN ARRIÈRE-PLAN (setImmediate) après
 * création — pas de blocage utilisateur.
 */
@InputType()
export class CreateQuickAccountingEntryInput {
  @Field(() => AccountingEntryKind)
  @IsEnum(AccountingEntryKind)
  kind!: AccountingEntryKind;

  /** Libellé principal (ex: "Facture Dell 02/2026"). */
  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  /**
   * Montant total de l'écriture. En mode simple (pas d'articles), c'est
   * le montant de la seule ligne. En mode multi-articles, doit être égal
   * à la somme des articles (sinon erreur).
   */
  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;

  /**
   * Articles détaillés pour une facture multi-lignes. Optionnel.
   * Si fourni, chaque article génère une ligne comptable distincte
   * (ordinateur 1200€ → immobilisation 218300, souris 30€ → charge 606400,
   * etc.). L'IA analyse chaque article indépendamment.
   */
  @Field(() => [QuickEntryArticleInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuickEntryArticleInput)
  articles?: QuickEntryArticleInput[];

  @Field(() => Date, { nullable: true })
  @IsOptional()
  occurredAt?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  cohortCode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  disciplineCode?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  freeformTags?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  documentMediaAssetIds?: string[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatAmountCents?: number;

  /**
   * Compte financier de contrepartie (banque/caisse/transit). Permet à
   * l'utilisateur de choisir "encaissé sur Caisse buvette" plutôt que
   * "Banque principale". Null = fallback BANK default du club.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string;
}
