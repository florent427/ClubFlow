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
import { BlogModule } from '../blog/blog.module';
import { ShopModule } from '../shop/shop.module';
import { PublicSiteModule } from '../public-site/public-site.module';
import { VitrineModule } from '../vitrine/vitrine.module';
import { AiModule } from '../ai/ai.module';
import { AgentModule } from '../agent/agent.module';
import { MediaModule } from '../media/media.module';
import { MembersModule } from '../members/members.module';
import { MembershipModule } from '../membership/membership.module';
import { MailModule } from '../mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { PdfModule } from '../pdf/pdf.module';
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
import '../events/models/club-event-attachment.model';
import '../events/models/event-convocation-result.model';
import '../events/dto/create-event.input';
import '../events/dto/update-event.input';
import '../events/dto/send-event-convocation.input';
import '../events/enums/event-convocation-mode.enum';
import '../booking/models/bookable-slot.model';
import '../blog/models/blog-post.model';
import '../blog/dto/create-blog-post.input';
import '../blog/dto/update-blog-post.input';
import '../shop/models/shop-product.model';
import '../shop/models/shop-order.model';
import '../shop/dto/create-shop-product.input';
import '../shop/dto/update-shop-product.input';
import '../shop/dto/place-shop-order.input';
import '../public-site/models/public-club.model';
import '../vitrine/models/vitrine-models';
import '../vitrine/dto/vitrine-inputs';
import '../ai/models/ai-models';
import '../ai/dto/ai-inputs';
import '../agent/models/agent-models';
import '../agent/dto/agent-inputs';
import '../external-finance/models/sponsorship-deal.model';
import '../external-finance/models/grant-application.model';
import '../external-finance/dto/create-sponsorship-deal.input';
import '../external-finance/dto/update-sponsorship-deal.input';
import '../external-finance/dto/create-grant-application.input';
import '../external-finance/dto/update-grant-application.input';
import '../accounting/models/accounting-entry.model';
import '../accounting/models/accounting-summary.model';
import '../accounting/dto/create-accounting-entry.input';
import '../dashboard/models/admin-dashboard.model';
import '../dashboard/models/club-search.model';
import '../viewer/dto/viewer-update-my-pseudo.input';
import '../viewer/dto/viewer-update-my-profile.input';
import '../viewer/models/viewer-checkout-session.model';
import '../clubs/dto/update-club-branding.input';

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
    PdfModule,
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
    BlogModule,
    ShopModule,
    PublicSiteModule,
    MediaModule,
    VitrineModule,
    AiModule,
    AgentModule,
  ],
})
export class GraphqlAppModule {}
