import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

@InputType()
export class CreateClubFamilyInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @Field(() => ID, {
    nullable: true,
    description:
      'Membre désigné comme payeur (inclus dans memberIds). Laisser vide si payeur = contact.',
  })
  @ValidateIf((_o, v) => v != null && v !== '')
  @IsUUID()
  payerMemberId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'Contact portail payeur du foyer (sans fiche adhérent). Exclusif avec payerMemberId.',
  })
  @ValidateIf((_o, v) => v != null && v !== '')
  @IsUUID()
  payerContactId?: string | null;

  @Field(() => [ID], { description: 'Adhérents du foyer (le payeur adhérent doit être dans la liste)' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberIds!: string[];
}
