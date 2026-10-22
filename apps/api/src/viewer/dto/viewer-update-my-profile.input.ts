import { Field, InputType } from '@nestjs/graphql';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { MEMBER_PHOTO_URL_MAX } from '../../members/member-photo-intake';
import { COORDINATE_LIMITS } from './viewer-coordinates.input';

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

  // Le portail n'envoie qu'une URL de média : il n'a pas de recadrage inline,
  // sa photo passe par `/media/upload`. La borne est donc celle d'une URL, et
  // non celle de l'admin, qui accepte une image inline convertie à l'écriture
  // (cf. `MEMBER_PHOTO_DATA_URL_MAX`).
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, MEMBER_PHOTO_URL_MAX)
  photoUrl?: string;

  // ── Coordonnées postales ──────────────────────────────────────────
  // Profil ADHÉRENT : chaque champ n'est accepté que si le club l'affiche
  // dans son catalogue de fiche adhérent — cf. ViewerService.updateMyProfile.
  // Profil CONTACT : toujours acceptés, l'adhésion en ligne les exige.

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

  // ── Lieu de naissance (profil adhérent) ───────────────────────────
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.birthCity)
  birthCity?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.inseeCode)
  birthCityInseeCode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.countryCode)
  birthCountryCode?: string;
}
