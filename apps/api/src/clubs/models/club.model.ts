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

  @Field(() => String, {
    nullable: true,
    description: 'Téléphone de contact du club affiché sur les factures.',
  })
  contactPhone!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'E-mail de contact du club affiché sur les factures.',
  })
  contactEmail!: string | null;

  @Field({
    description:
      'True si le club a marqué le champ MEDICAL_CERT_EXPIRES_AT comme ' +
      '`required=true` dans son catalogue de champs adhérent. Utilisé par ' +
      "le mobile pour afficher (ou non) l'alerte « Certificat non renseigné »",
  })
  requiresMedicalCertificate!: boolean;
}
