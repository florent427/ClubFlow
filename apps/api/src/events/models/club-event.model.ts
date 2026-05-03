import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubEventRegistrationStatus, ClubEventStatus } from '@prisma/client';
import { ClubEventAttachmentGraph } from './club-event-attachment.model';

@ObjectType()
export class ClubEventRegistrationGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  eventId!: string;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field(() => ClubEventRegistrationStatus)
  status!: ClubEventRegistrationStatus;

  @Field()
  registeredAt!: Date;

  @Field(() => Date, { nullable: true })
  cancelledAt!: Date | null;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => String, { nullable: true })
  displayName!: string | null;
}

@ObjectType()
export class ClubEventGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;

  @Field(() => Int, { nullable: true })
  capacity!: number | null;

  @Field(() => Date, { nullable: true })
  registrationOpensAt!: Date | null;

  @Field(() => Date, { nullable: true })
  registrationClosesAt!: Date | null;

  @Field(() => Int, { nullable: true })
  priceCents!: number | null;

  @Field(() => ClubEventStatus)
  status!: ClubEventStatus;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field()
  allowContactRegistration!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => Int)
  registeredCount!: number;

  @Field(() => Int)
  waitlistCount!: number;

  @Field(() => ClubEventRegistrationStatus, { nullable: true })
  viewerRegistrationStatus!: ClubEventRegistrationStatus | null;

  @Field(() => [ClubEventRegistrationGraph])
  registrations!: ClubEventRegistrationGraph[];

  @Field(() => [ClubEventAttachmentGraph], {
    description:
      "Pièces jointes (PDF, images). Téléchargement via REST : GET /events/:eventId/attachments/:id",
  })
  attachments!: ClubEventAttachmentGraph[];
}
