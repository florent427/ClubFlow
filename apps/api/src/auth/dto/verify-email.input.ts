import { Field, InputType } from '@nestjs/graphql';
import { IsString, MinLength } from 'class-validator';

@InputType()
export class VerifyEmailInput {
  @Field()
  @IsString()
  @MinLength(10)
  token!: string;
}
