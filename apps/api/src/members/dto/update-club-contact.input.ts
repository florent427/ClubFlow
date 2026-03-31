import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

@InputType()
export class UpdateClubContactInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

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
}
