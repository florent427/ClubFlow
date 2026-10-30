import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
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

  /**
   * Version des CGV montrée à l'adhérent et acceptée par lui (ADR-0017).
   * Exigée par le serveur dès que le club a des CGV en ligne.
   */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  acceptedTermsId?: string;
}

/**
 * Remise consentie au comptoir, appliquée au PRIX UNITAIRE. Trois façons de la
 * dire, exactement une renseignée — contrôle fait côté service :
 *
 *  - `percent` : pourcentage du prix catalogue (12,5 = 12,5 %) ;
 *  - `amountCents` : montant retiré de chaque article ;
 *  - `targetUnitPriceCents` : prix de vente voulu pour chaque article.
 *
 * Au prix unitaire et non au total : la ligne garde un prix par article, et
 * c'est lui qu'une annulation ou un remboursement rendra plus tard.
 */
@InputType()
export class ShopCounterDiscountInput {
  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  percent?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetUnitPriceCents?: number;

  /** Motif obligatoire : une remise doit pouvoir se justifier après coup. */
  @Field()
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * Vente au comptoir. L'acheteur est DÉSIGNÉ par l'admin — d'où les deux
 * identifiants optionnels dont exactement un doit être fourni, contrôle fait
 * côté service pour qu'il vaille sur tout appelant.
 */
@InputType()
export class RecordShopCounterSaleInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string;

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

  @Field(() => ShopCounterDiscountInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShopCounterDiscountInput)
  discount?: ShopCounterDiscountInput;
}
