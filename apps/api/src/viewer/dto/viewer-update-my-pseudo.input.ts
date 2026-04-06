import { Field, InputType } from '@nestjs/graphql';
import { IsString, Length, Matches } from 'class-validator';

@InputType()
export class ViewerUpdateMyPseudoInput {
  @Field()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Pseudo : lettres minuscules, chiffres et underscores uniquement.',
  })
  pseudo!: string;
}
