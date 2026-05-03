import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ClubSignedDocumentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  documentId!: string;

  @Field(() => Int)
  version!: number;

  @Field(() => ID)
  userId!: string;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID)
  signedAssetId!: string;

  /** URL publique du PDF signé (rendu final avec overlay). */
  @Field(() => String, { nullable: true })
  signedAssetUrl!: string | null;

  @Field()
  signedSha256!: string;

  @Field()
  sourceSha256!: string;

  @Field(() => String, { nullable: true })
  ipAddress!: string | null;

  @Field(() => String, { nullable: true })
  userAgent!: string | null;

  @Field()
  signedAt!: Date;

  @Field(() => Date, { nullable: true })
  invalidatedAt!: Date | null;

  /** Nom complet du signataire (User.displayName ou Member firstName+lastName). */
  @Field(() => String, { nullable: true })
  signerDisplayName!: string | null;
}
