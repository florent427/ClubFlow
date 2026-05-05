import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MembershipOneTimeFeeKind } from '@prisma/client';

registerEnumType(MembershipOneTimeFeeKind, {
  name: 'MembershipOneTimeFeeKind',
  description:
    'Type de frais ponctuel : LICENSE (licence fédérale, skip si déjà existante), MANDATORY (toujours ajouté), OPTIONAL (à cocher).',
});

@ObjectType()
export class MembershipOneTimeFeeGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => MembershipOneTimeFeeKind)
  kind!: MembershipOneTimeFeeKind;

  /** Auto-ajouté à chaque item du panier (forcé true si MANDATORY/LICENSE). */
  @Field(() => Boolean)
  autoApply!: boolean;

  /** Regex JS pour valider `existingLicenseNumber` (LICENSE only). */
  @Field(() => String, { nullable: true })
  licenseNumberPattern!: string | null;

  /** Texte humain affiché à l'utilisateur. */
  @Field(() => String, { nullable: true })
  licenseNumberFormatHint!: string | null;
}
