import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

/** Envoi du bon de livraison par e-mail (ADR-0017). */
@InputType()
export class SendShopDeliveryNoteInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  /**
   * Adresse choisie par l'admin : celle de l'acheteur par défaut, ou celle
   * d'un parent qui retire pour un enfant.
   */
  @Field()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
