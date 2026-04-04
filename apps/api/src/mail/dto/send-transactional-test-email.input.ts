import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, MaxLength } from 'class-validator';

@InputType()
export class SendTransactionalTestEmailInput {
  @Field()
  @IsEmail()
  @MaxLength(320)
  to!: string;
}
