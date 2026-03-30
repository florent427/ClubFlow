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
  annualAmountCents!: number;

  @Field(() => Int)
  monthlyAmountCents!: number;

  @Field(() => Int, { nullable: true })
  minAge!: number | null;

  @Field(() => Int, { nullable: true })
  maxAge!: number | null;

  @Field(() => [ID])
  gradeLevelIds!: string[];

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
