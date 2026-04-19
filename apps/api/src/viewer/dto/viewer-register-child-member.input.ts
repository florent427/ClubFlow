import { Field, InputType } from '@nestjs/graphql';
import { MemberCivility } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class ViewerRegisterChildMemberInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field({ description: 'Date de naissance de l’enfant (ISO YYYY-MM-DD).' })
  @IsDateString()
  birthDate!: string;
}
