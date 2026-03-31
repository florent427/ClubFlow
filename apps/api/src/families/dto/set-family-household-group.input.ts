import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class SetFamilyHouseholdGroupInput {
  @Field(() => ID)
  @IsUUID()
  familyId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  /** null = retirer le foyer du groupe étendu */
  householdGroupId?: string | null;
}
