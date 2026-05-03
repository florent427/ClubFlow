import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class PreviewFamilyInviteInput {
  @Field(() => String, { description: 'Code court ou jeton brut reçu.' })
  @IsString()
  @MinLength(4)
  @MaxLength(256)
  code!: string;
}
