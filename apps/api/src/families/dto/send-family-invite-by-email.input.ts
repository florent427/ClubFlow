import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

@InputType()
export class SendFamilyInviteByEmailInput {
  @Field(() => String, {
    description:
      "Code à 8 caractères de l'invitation déjà générée (issu de createFamilyInvite).",
  })
  @IsString()
  @Length(6, 16)
  code!: string;

  @Field(() => String, {
    description: 'Adresse email du destinataire de l\u2019invitation.',
  })
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /**
   * URL absolue du portail membre pour la page "/rejoindre?token=..." —
   * construite côté client pour inclure le rawToken retourné par
   * createFamilyInvite. Permet au destinataire d'accepter l'invitation en
   * un clic (sans recopier le code).
   */
  @Field(() => String)
  @IsString()
  @MaxLength(1000)
  inviteUrl!: string;
}
