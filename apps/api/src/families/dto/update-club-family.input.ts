import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

@InputType()
export class UpdateClubFamilyInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Nouveau libellé ; null ou chaîne vide pour effacer (foyer sans nom)',
  })
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;
}
