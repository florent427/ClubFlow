import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsString()
  @MinLength(10)
  token!: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
