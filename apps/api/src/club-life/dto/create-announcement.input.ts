import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateAnnouncementInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
