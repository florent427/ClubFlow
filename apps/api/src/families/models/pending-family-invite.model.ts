import { Field, ID, ObjectType } from '@nestjs/graphql';
import { FamilyInviteRole } from '@prisma/client';

/**
 * Invitation familiale en attente pour l'email de l'utilisateur connecté.
 * Retournée par `viewerPendingFamilyInvites` pour afficher une notification
 * in-app (pas besoin pour le destinataire de passer par le lien du mail).
 */
@ObjectType()
export class PendingFamilyInviteGraph {
  @Field(() => ID) id!: string;
  @Field() code!: string;
  @Field(() => FamilyInviteRole) role!: FamilyInviteRole;
  @Field(() => String, { nullable: true }) familyLabel!: string | null;
  @Field() inviterName!: string;
  @Field() expiresAt!: Date;
}
