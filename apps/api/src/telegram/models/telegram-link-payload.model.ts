import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TelegramLinkPayload {
  @Field({
    description:
      'URL d’invitation (également envoyée par e-mail au membre lorsque l’adresse est valide).',
  })
  url!: string;

  @Field(() => Date)
  expiresAt!: Date;

  @Field({
    description:
      'True si un e-mail transactionnel avec le lien a été envoyé au membre.',
  })
  emailSent!: boolean;
}
