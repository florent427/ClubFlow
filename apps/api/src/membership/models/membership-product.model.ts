import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MembershipProductGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  baseAmountCents!: number;

  @Field(() => ID)
  dynamicGroupId!: string;

  @Field()
  allowProrata!: boolean;

  @Field()
  allowFamily!: boolean;

  @Field()
  allowPublicAid!: boolean;

  @Field()
  allowExceptional!: boolean;

  @Field(() => Int, { nullable: true })
  exceptionalCapPercentBp!: number | null;
}
