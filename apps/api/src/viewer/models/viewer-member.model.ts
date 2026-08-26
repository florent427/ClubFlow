import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCatalogFieldKey, MemberCivility } from '@prisma/client';
import { SignedPhotoField } from '../../media/signed-photo-field.decorator';

/**
 * Un champ de coordonnées que l'adhérent peut compléter depuis le portail.
 *
 * La liste vient du catalogue de fiche adhérent du club
 * (`ClubMemberFieldCatalogSetting`) : c'est la MÊME source que le
 * formulaire admin. Sans ça, le portail proposerait des champs que le club
 * a délibérément masqués, et l'API accepterait des écritures que le
 * back-office refuse.
 */
@ObjectType()
export class EditableProfileFieldGraph {
  @Field(() => MemberCatalogFieldKey)
  key!: MemberCatalogFieldKey;

  @Field(() => String, { description: 'Libellé français prêt à afficher.' })
  label!: string;

  @Field(() => Boolean)
  required!: boolean;
}

@ObjectType()
export class ViewerMemberGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Pseudo messagerie (profil adhérent uniquement).',
  })
  pseudo!: string | null;

  @SignedPhotoField()
  photoUrl!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  // ── Coordonnées postales (profil ADHÉRENT uniquement) ─────────────
  // Null constant sur un profil payeur-contact : `Contact` n'a pas ces
  // colonnes. Le portail s'appuie sur `editableProfileFields` pour savoir
  // lesquelles présenter, plutôt que sur la présence d'une valeur.

  @Field(() => String, { nullable: true })
  addressLine!: string | null;

  @Field(() => String, { nullable: true })
  postalCode!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => Date, { nullable: true })
  birthDate!: Date | null;

  @Field(() => [EditableProfileFieldGraph], {
    description:
      'Champs de coordonnées que CE club expose dans son formulaire de ' +
      'fiche adhérent, avec leur caractère obligatoire. Le portail ne ' +
      'présente que ceux-là : un club qui masque la date de naissance ne ' +
      'doit pas la voir réapparaître par le portail. Vide sur un profil ' +
      'payeur-contact.',
  })
  editableProfileFields!: EditableProfileFieldGraph[];

  @Field(() => MemberCivility)
  civility!: MemberCivility;

  @Field(() => Date, { nullable: true })
  medicalCertExpiresAt!: Date | null;

  @Field(() => ID, { nullable: true })
  gradeLevelId!: string | null;

  @Field(() => String, { nullable: true })
  gradeLevelLabel!: string | null;

  @Field()
  canAccessClubBackOffice!: boolean;

  /** Club à passer au back-office (`X-Club-Id`) lors du switch depuis le portail. */
  @Field(() => ID, { nullable: true })
  adminWorkspaceClubId!: string | null;

  @Field(() => Boolean, {
    description: 'True si cette fiche est déjà rattachée à un foyer du club.',
  })
  hasClubFamily!: boolean;

  @Field(() => Boolean, {
    description:
      'True si l’adhérent peut utiliser le rattachement libre via l’e-mail du payeur (pas encore dans un foyer).',
  })
  canSelfAttachFamilyViaPayerEmail!: boolean;

  @Field(() => Boolean, {
    description: 'Profil portail basé sur un contact payeur (pas une fiche adhérent).',
    defaultValue: false,
  })
  isContactProfile!: boolean;

  /** Masquer progression / planning (payeur contact uniquement). */
  @Field(() => Boolean, { defaultValue: false })
  hideMemberModules!: boolean;

  @Field(() => Boolean, {
    description:
      'True si la fiche membre a relié Telegram (chat_id enregistré côté serveur).',
  })
  telegramLinked!: boolean;

  @Field(() => Boolean, {
    description:
      'True si le viewer est adulte (≥ 18 ans) et désigné payeur de son foyer (rôle PAYER). ' +
      'Réservé à la gestion du projet d’adhésion.',
    defaultValue: false,
  })
  canManageMembershipCart!: boolean;

  @Field(() => Boolean, {
    description:
      "True si l'utilisateur a défini un code PIN à 4 chiffres pour protéger son espace payeur (/factures + /famille). False = accès libre dès qu'on est PAYER.",
    defaultValue: false,
  })
  payerSpacePinSet!: boolean;
}
