import { Field, InputType } from '@nestjs/graphql';
import { MemberCivility } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

@InputType()
export class ViewerPromoteSelfToMemberInput {
  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field({ nullable: true, description: 'Date de naissance ISO (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
