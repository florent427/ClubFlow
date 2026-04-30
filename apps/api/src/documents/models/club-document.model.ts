import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ClubDocumentCategory, ClubDocumentFieldType } from '@prisma/client';

registerEnumType(ClubDocumentCategory, {
  name: 'ClubDocumentCategory',
  description:
    'Catégorie sémantique d\'un document à signer (règlement intérieur, autorisation parentale, droit à l\'image, règlement fédéral, autre).',
});

registerEnumType(ClubDocumentFieldType, {
  name: 'ClubDocumentFieldType',
  description:
    'Type de champ positionnable sur un PDF : signature manuscrite, texte libre, date, case à cocher.',
});

@ObjectType()
export class ClubDocumentFieldGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  page!: number;

  @Field(() => Float)
  x!: number;

  @Field(() => Float)
  y!: number;

  @Field(() => Float)
  width!: number;

  @Field(() => Float)
  height!: number;

  @Field(() => ClubDocumentFieldType)
  fieldType!: ClubDocumentFieldType;

  @Field()
  required!: boolean;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => Int)
  sortOrder!: number;
}

@ObjectType()
export class ClubDocumentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ClubDocumentCategory)
  category!: ClubDocumentCategory;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => ID)
  mediaAssetId!: string;

  /** URL publique du PDF source — résolue via `mediaAsset.publicUrl`. */
  @Field(() => String, { nullable: true })
  mediaAssetUrl!: string | null;

  @Field(() => Int)
  version!: number;

  @Field()
  fileSha256!: string;

  @Field()
  isRequired!: boolean;

  @Field()
  isActive!: boolean;

  @Field()
  validFrom!: Date;

  @Field(() => Date, { nullable: true })
  validTo!: Date | null;

  @Field()
  minorsOnly!: boolean;

  @Field({
    description:
      'Si true, le cron annuel (1er septembre) bump la version + invalide les signatures.',
  })
  resetAnnually!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [ClubDocumentFieldGraph])
  fields!: ClubDocumentFieldGraph[];

  /** Nombre de signatures NON invalidées (version courante). */
  @Field(() => Int)
  signedCount!: number;
}
