import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

@ObjectType()
export class ClubPaymentRouteGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => ID)
  financialAccountId!: string;

  /** Libellé snapshot du compte financier (ex "Caisse buvette"). */
  @Field()
  financialAccountLabel!: string;

  /** Code PCG du compte financier lié. */
  @Field()
  financialAccountCode!: string;
}
