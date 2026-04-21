import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Club courant (tenant)' })
export class ClubGraphModel {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;

  @Field(() => String, {
    nullable: true,
    description: 'URL du logo club (utilisée en en-tête des PDF).',
  })
  logoUrl!: string | null;

  @Field(() => String, { nullable: true })
  siret!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Adresse postale affichée sur les documents officiels.',
  })
  address!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Mentions légales imprimées en pied de facture.',
  })
  legalMentions!: string | null;
}
