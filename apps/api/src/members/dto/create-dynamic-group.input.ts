import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateDynamicGroupInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  minAge?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  maxAge?: number;

  @Field(() => [ID], {
    nullable: true,
    description: 'Grades requis ; tableau vide = tous les grades',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  gradeLevelIds?: string[];
}
