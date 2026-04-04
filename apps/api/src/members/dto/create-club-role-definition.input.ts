import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateClubRoleDefinitionInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
