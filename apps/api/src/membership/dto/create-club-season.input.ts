import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

@InputType()
export class CreateClubSeasonInput {
  @Field()
  @IsString()
  label!: string;

  @Field()
  @IsDateString()
  startsOn!: string;

  @Field()
  @IsDateString()
  endsOn!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}

@InputType()
export class UpdateClubSeasonInput {
  @Field(() => ID)
  @IsUUID('4')
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
