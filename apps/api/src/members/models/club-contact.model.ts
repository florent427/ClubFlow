import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('ClubContact')
export class ClubContactGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  userId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  email!: string;

  @Field()
  emailVerified!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Portable, E.164 si saisi via le sélecteur de pays',
  })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  addressLine!: string | null;

  @Field(() => String, { nullable: true })
  postalCode!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => ID, { nullable: true })
  linkedMemberId!: string | null;

  @Field()
  canDeleteContact!: boolean;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}
