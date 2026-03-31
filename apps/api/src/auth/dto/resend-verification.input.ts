import { Field, InputType } from '@nestjs/graphql';
import { IsEmail } from 'class-validator';

@InputType()
export class ResendVerificationInput {
  @Field()
  @IsEmail()
  email!: string;
}
