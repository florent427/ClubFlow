import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Remise signée d'une commande (ADR-0017). La signature voyage en data URL
 * PNG ; c'est le service qui en vérifie la forme, pour que la règle vaille sur
 * tout appelant et pas seulement sur GraphQL.
 */
@InputType()
export class DeliverShopOrderInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  /** Personne qui retire et signe : l'adhérent, ou un parent pour un enfant. */
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  signerName!: string;

  /** `data:image/png;base64,…` produit par le pavé de signature. */
  @Field()
  @IsString()
  @MaxLength(400_000)
  signaturePng!: string;
}
