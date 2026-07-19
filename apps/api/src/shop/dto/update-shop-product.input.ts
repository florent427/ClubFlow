import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateShopProductInput {
  /**
   * `@IsUUID()` n'est pas décoratif ici : le ValidationPipe global tourne en
   * `whitelist + forbidNonWhitelisted` (main.ts), donc tout champ SANS
   * décorateur class-validator est rejeté comme propriété inconnue —
   * « property id should not exist », erreur 400, mutation inutilisable.
   *
   * Ce champ n'en avait aucun depuis le premier commit : `updateShopProduct`
   * n'a jamais fonctionné. Aucun test ne l'a vu, les tests unitaires appelant
   * le service directement et court-circuitant le pipe.
   */
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
