import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class MemberCustomFieldValueInput {
  @Field(() => ID)
  @IsUUID()
  definitionId!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Vide ou null pour effacer la valeur',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  value?: string | null;
}
