import { Field, ID, InputType } from '@nestjs/graphql';
import { ClubDocumentCategory, MembershipRole } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class CreateClubDocumentInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Field(() => ClubDocumentCategory)
  @IsEnum(ClubDocumentCategory)
  category!: ClubDocumentCategory;

  @Field(() => ID)
  @IsUUID()
  mediaAssetId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field()
  @IsDate()
  @Type(() => Date)
  validFrom!: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validTo?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  minorsOnly?: boolean;

  @Field({
    nullable: true,
    description:
      'Si true, le cron annuel (1er septembre) bump la version + invalide les signatures pour forcer une re-signature à chaque saison.',
  })
  @IsOptional()
  @IsBoolean()
  resetAnnually?: boolean;

  @Field(() => [MembershipRole], {
    nullable: true,
    description:
      'Ciblage par rôles système. Vide ou non fourni = tous rôles éligibles. Combiné en OR avec targetCustomRoleIds.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MembershipRole, { each: true })
  targetSystemRoles?: MembershipRole[];

  @Field(() => [ID], {
    nullable: true,
    description:
      'Ciblage par rôles personnalisés (ClubRoleDefinition.id). Vide ou non fourni = pas de filtre par rôle custom. Combiné en OR avec targetSystemRoles.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  targetCustomRoleIds?: string[];
}
