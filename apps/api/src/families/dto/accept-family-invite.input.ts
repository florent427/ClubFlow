import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class AcceptFamilyInviteInput {
  @Field(() => String, { description: 'Code court ou jeton brut reçu.' })
  @IsString()
  @MinLength(4)
  @MaxLength(256)
  code!: string;
}
