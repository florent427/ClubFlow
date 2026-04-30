import { Field, ID, InputType } from '@nestjs/graphql';
import { ClubDocumentFieldType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

@InputType()
export class SignClubDocumentFieldValueInput {
  @Field(() => ID)
  @IsUUID()
  fieldId!: string;

  @Field(() => ClubDocumentFieldType)
  @IsEnum(ClubDocumentFieldType)
  type!: ClubDocumentFieldType;

  /**
   * Image PNG signature (dataURL `data:image/png;base64,...` ou base64 brut).
   * Requis pour `type === SIGNATURE`.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  valuePngBase64?: string;

  /**
   * Texte saisi (ou date au format texte). Requis pour TEXT, optionnel pour
   * DATE (sinon date du jour utilisée).
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  text?: string;

  /** Booléen requis pour CHECKBOX. */
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  bool?: boolean;
}

@InputType()
export class SignClubDocumentInput {
  @Field(() => ID)
  @IsUUID()
  documentId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @Field(() => [SignClubDocumentFieldValueInput])
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SignClubDocumentFieldValueInput)
  fieldValues!: SignClubDocumentFieldValueInput[];
}
