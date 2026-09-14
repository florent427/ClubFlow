import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Ce qu'on retire d'une ligne de commande, et ce qu'on prend en échange
 * (ADR-0020). Sans `newVariantId` : annulation d'articles.
 */
@InputType()
export class ShopOrderLineAdjustmentPreviewInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  /** Unités retirées de la ligne. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  /** Échange : la déclinaison prise. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  newVariantId?: string | null;

  /** Échange : combien d'articles sont pris. Par défaut, autant que rendus. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  newQuantity?: number | null;

  /** Commande remise : l'adhérent a rapporté l'article. */
  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  goodsReturned?: boolean | null;

  /** L'article rendu est déclaré perdu, cassé ou volé. */
  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  goodsLost?: boolean | null;
}

@InputType()
export class AdjustShopOrderLineInput extends ShopOrderLineAdjustmentPreviewInput {
  /** Motif, repris sur les avoirs et le bon d'échange. */
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /** Échange d'une commande remise : la personne qui signe. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  signerName?: string | null;

  /** Échange d'une commande remise : `data:image/png;base64,…`. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  signaturePng?: string | null;
}
