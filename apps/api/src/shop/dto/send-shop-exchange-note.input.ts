import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

/** Envoi du bon d'échange par e-mail (ADR-0020). */
@InputType()
export class SendShopExchangeNoteInput {
  @Field(() => ID)
  @IsUUID()
  adjustmentId!: string;

  /** Adresse choisie par l'admin : celle de l'acheteur par défaut. */
  @Field()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
