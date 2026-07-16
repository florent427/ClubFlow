import { Field, ID, InputType } from '@nestjs/graphql';
import {
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

  /** Créneau du programme choisi (requis si l'événement en propose). */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  programItemId?: string;

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
