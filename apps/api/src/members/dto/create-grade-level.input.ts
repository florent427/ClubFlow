import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

@InputType()
export class CreateGradeLevelInput {
  @Field()
  @IsString()
  @MaxLength(120)
  label!: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
