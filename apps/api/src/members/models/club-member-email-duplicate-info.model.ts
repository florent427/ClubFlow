import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ClubMemberEmailDuplicateInfoGraph {
  @Field(() => Boolean, {
    description: 'Aucun adhérent actif ne partage cette e-mail',
  })
  isClear!: boolean;

  @Field(() => ID, {
    nullable: true,
    description:
      'Foyer auquel rattacher la nouvelle fiche pour autoriser le doublon d’e-mail',
  })
  suggestedFamilyId?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Libellé du foyer (paramétrable par le club)',
  })
  familyLabel?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'E-mail normalisée concernée (identique à la saisie du formulaire)',
  })
  sharedEmail?: string | null;

  @Field(() => [String], {
    nullable: true,
    description: 'Adhérents existants avec cette e-mail dans le foyer',
  })
  existingMemberLabels?: string[] | null;

  @Field(() => String, {
    nullable: true,
    description:
      'Si présent, la création sans rattachement au foyer proposé reste impossible',
  })
  blockedMessage?: string | null;
}
