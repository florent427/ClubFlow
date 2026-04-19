import { join } from 'path';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { ClubModulesModule } from '../modules/club-modules.module';
import { ClubsModule } from '../clubs/clubs.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CommsModule } from '../comms/comms.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ExternalFinanceModule } from '../external-finance/external-finance.module';
import { FamiliesModule } from '../families/families.module';
import { ViewerModule } from '../viewer/viewer.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClubLifeModule } from '../club-life/club-life.module';
import { EventsModule } from '../events/events.module';
import { BookingModule } from '../booking/booking.module';
import { MembersModule } from '../members/members.module';
import { MembershipModule } from '../membership/membership.module';
import { MailModule } from '../mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlanningModule } from '../planning/planning.module';
import './register-enums';
/** Charge tôt les @ObjectType membres (MemberGraph, AssignedDynamicGroupGraph, …) pour le build du schéma GraphQL. */
import '../members/models/member.model';
import '../members/models/club-contact.model';
import '../members/models/promote-contact-result.model';
import '../members/dto/update-club-contact.input';
/** Domaine d’envoi e-mail (évite qu’un schéma généré sans ces types si résolution d’ordre fragile). */
import '../mail/models/club-sending-domain.model';
import '../mail/models/mail-dns-record.model';
import '../mail/dto/create-club-sending-domain.input';
import '../mail/dto/send-transactional-test-email.input';
import '../comms/dto/send-quick-message.input';
import '../telegram/models/telegram-link-payload.model';
import '../messaging/models/chat-room-gql.model';
import '../messaging/models/chat-message-gql.model';
import '../messaging/dto/create-chat-group.input';
import '../messaging/dto/post-chat-message.input';
import '../club-life/models/club-announcement.model';
import '../club-life/models/club-survey.model';
import '../club-life/dto/create-announcement.input';
import '../club-life/dto/update-announcement.input';
import '../club-life/dto/create-survey.input';
import '../club-life/dto/respond-survey.input';
import '../events/models/club-event.model';
import '../events/dto/create-event.input';
import '../events/dto/update-event.input';
import '../booking/models/bookable-slot.model';
import '../viewer/dto/viewer-update-my-pseudo.input';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      context: ({
        req,
        res,
      }: {
        req: Request;
        res: Response;
      }) => ({ req, res }),
    }),
    AuthModule,
    CatalogModule,
    ClubsModule,
    DashboardModule,
    ClubModulesModule,
    MembersModule,
    FamiliesModule,
    PlanningModule,
    AccountingModule,
    PaymentsModule,
    MembershipModule,
    CommsModule,
    MailModule,
    ExternalFinanceModule,
    ViewerModule,
    TelegramModule,
    MessagingModule,
    ClubLifeModule,
    EventsModule,
    BookingModule,
  ],
})
export class GraphqlAppModule {}
