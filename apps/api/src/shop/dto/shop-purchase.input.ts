import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ShopReceiptDiscrepancyReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
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
 * TOUT champ porte un décorateur class-validator.
 *
 * Le ValidationPipe global tourne en `whitelist` + `forbidNonWhitelisted` : un
 * champ nu n'est pas « simplement non validé », il est REJETÉ comme propriété
 * inconnue et la mutation entière renvoie 400. Le balayage statique de
 * `common/dto-validation-whitelist.spec.ts` garde cette invariant.
 */

@InputType()
export class CreateShopSupplierInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountRef?: string | null;

  /** Délai de livraison habituel, en jours. Datera l'arrivée attendue. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

@InputType()
export class UpdateShopSupplierInput {
  @Field(() => ID)
  @IsUUID()
  supplierId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountRef?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** Faux tient lieu de suppression : la FK des commandes est en Restrict. */
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Une ligne de commande, à la création ou par ajout ultérieur. */
@InputType()
export class ShopPurchaseOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  orderedQty!: number;

  /** Prix d'achat unitaire HT en CENTIMES. Reporting seulement (ADR-0013 §1). */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostCents?: number;
}

@InputType()
export class CreateShopPurchaseOrderInput {
  @Field(() => ID)
  @IsUUID()
  supplierId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  /** Facultatives : une commande naît volontiers vide et se remplit ensuite. */
  @Field(() => [ShopPurchaseOrderLineInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ShopPurchaseOrderLineInput)
  lines?: ShopPurchaseOrderLineInput[];
}

@InputType()
export class AddShopPurchaseOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  orderedQty!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostCents?: number;
}

@InputType()
export class RemoveShopPurchaseOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  @Field(() => ID)
  @IsUUID()
  lineId!: string;
}

/**
 * Rapprochement d'une facture fournisseur DÉJÀ SAISIE avec sa commande.
 *
 * Sert aussi bien à poser le lien qu'à le retirer : les deux mutations
 * demandent exactement les deux mêmes identifiants, et un second DTO jumeau
 * n'apporterait qu'une occasion de les faire diverger.
 */
@InputType()
export class ShopPurchaseOrderInvoiceInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  /** L'écriture comptable du grand livre. JAMAIS créée ici (ADR-0013 §1). */
  @Field(() => ID)
  @IsUUID()
  entryId!: string;
}

/** Ce qui est réellement arrivé sur une ligne, pour cette livraison-là. */
@InputType()
export class ReceiveShopPurchaseOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  orderLineId!: string;

  /** Zéro est licite : « rien n'est arrivé », avec son motif. */
  @Field(() => Int)
  @IsInt()
  @Min(0)
  receivedQty!: number;

  /**
   * OBLIGATOIRE dès que le cumul reçu s'écarte du commandé — le service le
   * refuse sinon. Non exigé ici parce qu'un écart ne se constate qu'au regard
   * du cumul déjà reçu, que seul le service connaît.
   */
  @Field(() => ShopReceiptDiscrepancyReason, { nullable: true })
  @IsOptional()
  @IsEnum(ShopReceiptDiscrepancyReason)
  discrepancyReason?: ShopReceiptDiscrepancyReason | null;

  /** Obligatoire quand le motif est OTHER. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  discrepancyNote?: string | null;
}

@InputType()
export class ReceiveShopPurchaseOrderInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  /** Bon de livraison du fournisseur. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryNote?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @Field(() => [ReceiveShopPurchaseOrderLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceiveShopPurchaseOrderLineInput)
  lines!: ReceiveShopPurchaseOrderLineInput[];
}
