import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class HouseholdGroupGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Foyer porteur (factures transitoires rattachées à familyId).',
  })
  carrierFamilyId!: string | null;
}
