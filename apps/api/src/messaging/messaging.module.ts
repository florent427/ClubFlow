import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberPseudoService } from './member-pseudo.service';
import { MessagingGateway } from './messaging.gateway';
import { MessagingResolver } from './messaging.resolver';
import { MessagingService } from './messaging.service';

@Module({
  imports: [
    PrismaModule,
    FamiliesModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-development',
    }),
  ],
  providers: [
    MemberPseudoService,
    MessagingService,
    MessagingGateway,
    MessagingResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
    GqlThrottlerGuard,
  ],
  exports: [MemberPseudoService, MessagingService],
})
export class MessagingModule {}
