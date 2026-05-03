import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, Length, ValidateIf } from 'class-validator';

/**
 * Champs "habillage" du club utilisés pour la génération des PDF (facture, avoir)
 * et l'affichage public. Tous nullables : `null` efface la valeur, `undefined` la laisse.
 */
@InputType()
export class UpdateClubBrandingInput {
  /**
   * Nom du club (imprimé sur factures + header admin + site vitrine). Non
   * nullable contrairement aux autres champs : un club a toujours un nom.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  /**
   * URL publique du logo du club (typiquement
   * `http(s)://api/media/<uuid>` issue de `POST /media/upload?kind=image`).
   *
   * Limite à 2000 chars pour rester généreux avec d'éventuelles URLs
   * de CDN signées (S3 / Cloudfront) qui peuvent contenir des query
   * strings longs. Avant on stockait des data URLs base64 ici (50KB+) —
   * solution abandonnée car incompatible avec cette limite et inefficace.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 2000)
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

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 50)
  contactPhone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 200)
  contactEmail?: string | null;
}
