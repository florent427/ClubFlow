import { Field, ID, ObjectType } from '@nestjs/graphql';
import { UserNotificationKind } from '@prisma/client';

/** Entrée du centre de notifications du portail (compte × club). */
@ObjectType()
export class UserNotificationGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => UserNotificationKind)
  kind!: UserNotificationKind;

  @Field()
  title!: string;

  @Field()
  body!: string;

  /** Chemin relatif au portail ouvert au clic, s'il y en a un. */
  @Field(() => String, { nullable: true })
  url!: string | null;

  /** ISO 8601 ; null tant que non lue. */
  @Field(() => String, { nullable: true })
  readAt!: string | null;

  /** ISO 8601. */
  @Field()
  createdAt!: string;
}
