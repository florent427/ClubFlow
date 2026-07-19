import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

@InputType()
export class PlaceShopOrderLineInput {
  /**
   * Identifiant de la DÉCLINAISON, pas du produit (ADR-0012).
   *
   * Rupture d'API assumée : on ne peut pas faire passer un couple
   * produit + déclinaison dans un champ UUID, et résoudre implicitement un
   * produit vers sa variante par défaut masquerait les erreurs d'intégration
   * — un client qui oublierait de choisir une taille commanderait au hasard.
   * Un produit simple expose sa variante par défaut : l'appelant l'utilise
   * sans jamais avoir à savoir qu'elle existe.
   */
  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity!: number;
}

@InputType()
export class PlaceShopOrderInput {
  @Field(() => [PlaceShopOrderLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlaceShopOrderLineInput)
  lines!: PlaceShopOrderLineInput[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
