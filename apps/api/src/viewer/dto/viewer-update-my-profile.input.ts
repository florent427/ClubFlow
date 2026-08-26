import { Field, InputType } from '@nestjs/graphql';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

@InputType()
export class ViewerUpdateMyProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 32)
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  photoUrl?: string;

  // ── Coordonnées postales ──────────────────────────────────────────
  // Réservées aux profils ADHÉRENT : `Contact` n'a pas ces colonnes.
  // Chaque champ n'est accepté que si le club l'affiche dans son
  // catalogue de fiche adhérent — cf. ViewerService.updateMyProfile.

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  addressLine?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  postalCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Date de naissance au format ISO (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
