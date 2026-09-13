import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class CancelAndRefundShopOrderInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  /** Motif de l'annulation, repris sur les avoirs. */
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /** Commande remise : l'adhérent a rapporté les articles. */
  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  goodsReturned?: boolean;

  /** Lignes dont l'article rendu est déclaré perdu ; les autres sont remises en vente. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  lostLineIds?: string[];
}
