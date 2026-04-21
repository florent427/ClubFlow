import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, Length, ValidateIf } from 'class-validator';

/**
 * Champs "habillage" du club utilisés pour la génération des PDF (facture, avoir)
 * et l'affichage public. Tous nullables : `null` efface la valeur, `undefined` la laisse.
 */
@InputType()
export class UpdateClubBrandingInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 500)
  logoUrl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 32)
  siret?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 500)
  address?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 2000)
  legalMentions?: string | null;
}
