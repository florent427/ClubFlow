import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, MaxLength } from 'class-validator';

@InputType()
export class ViewerJoinFamilyByPayerEmailInput {
  @Field(() => String, {
    description: 'E-mail du payeur du foyer cible (comme enregistrée au club).',
  })
  @IsEmail()
  @MaxLength(320)
  payerEmail!: string;
}
