import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class RegisterContactInput {
  @Field()
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

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

  /**
   * Slug du club que l'utilisateur rejoint (résolu via `?club=<slug>`
   * sur le portail ou via `searchClubs` sur mobile). Si absent, fallback
   * sur `CLUB_ID` env (compat mono-tenant historique).
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/, { message: 'clubSlug doit être en kebab-case.' })
  clubSlug?: string;
}
