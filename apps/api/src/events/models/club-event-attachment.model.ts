import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Métadonnées GraphQL d'une pièce jointe d'événement.
 * Le téléchargement passe par l'endpoint REST
 *   GET /events/:eventId/attachments/:attachmentId
 * (voir EventAttachmentsController) — GraphQL ne fait que lister.
 */
@ObjectType()
export class ClubEventAttachmentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  eventId!: string;

  @Field()
  fileName!: string;

  @Field()
  mimeType!: string;

  @Field(() => Int, {
    description: 'Taille en octets — pour affichage côté UI.',
  })
  sizeBytes!: number;

  @Field()
  createdAt!: Date;
}
