import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Input pour la mutation publique `createClubAndAdmin` (signup self-service).
 * Crée un nouveau Club + un User CLUB_ADMIN sur ce club + active les modules
 * MEMBERS, FAMILIES, COMMUNICATION par défaut.
 */
@InputType()
export class CreateClubAndAdminInput {
  /** Nom du club affiché publiquement (ex. "Karaté Club Saint-Paul"). */
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clubName!: string;

  /**
   * Slug désiré (kebab-case). Si omis, dérivé automatiquement du `clubName`.
   * Si le slug est déjà pris ou réservé, l'API renvoie une erreur explicite —
   * le client doit proposer une variante (ex. ajout d'un suffixe numérique).
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'clubSlug doit être en kebab-case (lettres minuscules, chiffres, tirets uniquement).',
  })
  clubSlug?: string;

  /** Email de l'admin du club. Sera l'identifiant de connexion. */
  @Field()
  @IsEmail()
  email!: string;

  /** Mot de passe (8+ chars). Hashé bcrypt salt=10 avant stockage. */
  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  /**
   * Token hCaptcha (anti-bot) — REQUIS si HCAPTCHA_SECRET défini côté API.
   * Si HCAPTCHA_SECRET n'est pas défini (dev local), ce champ peut être
   * absent ou vide. Cf. CaptchaVerifyService.
   */
  @Field({
    nullable: true,
    description: 'Token hCaptcha — requis si HCAPTCHA_SECRET configuré côté serveur.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captchaToken?: string;
}
