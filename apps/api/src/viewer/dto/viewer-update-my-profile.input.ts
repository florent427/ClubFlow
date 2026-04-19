import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

@InputType()
export class ViewerUpdateMyProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 32)
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  photoUrl?: string;
}
