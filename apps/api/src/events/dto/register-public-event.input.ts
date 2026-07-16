import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Inscription publique à un événement depuis la landing vitrine
 * (visiteur anonyme → devient Contact du club, cf. pattern
 * `VitrineContactService`).
 */
@InputType()
export class RegisterPublicEventInput {
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  clubSlug!: string;

  /** Slug public de l'événement (landing /evenements/<slug>). */
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  eventSlug!: string;

  /**
   * Créneaux du programme choisis. Un visiteur peut en sélectionner
   * PLUSIEURS. Requis (au moins un) si l'événement propose des créneaux
   * réservables.
   */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  programItemIds?: string[];

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

  @Field()
  @IsEmail()
  email!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Message libre optionnel (ex. âge de l'enfant pour un essai). */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
