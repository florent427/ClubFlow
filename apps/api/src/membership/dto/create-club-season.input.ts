import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

@InputType()
export class CreateClubSeasonInput {
  @Field(() => String)
  @IsString()
  label!: string;

  @Field(() => String)
  @IsDateString()
  startsOn!: string;

  @Field(() => String)
  @IsDateString()
  endsOn!: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}

@InputType()
export class UpdateClubSeasonInput {
  @Field(() => ID)
  @IsUUID('4')
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
