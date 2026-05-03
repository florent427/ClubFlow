import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberPseudoService } from './member-pseudo.service';
import { MessagingAdminResolver } from './messaging-admin.resolver';
import { MessagingAdminService } from './messaging-admin.service';
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
    MessagingAdminService,
    MessagingGateway,
    MessagingResolver,
    MessagingAdminResolver,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
    GqlThrottlerGuard,
  ],
  exports: [
    MemberPseudoService,
    MessagingService,
    MessagingAdminService,
    MessagingGateway,
  ],
})
export class MessagingModule {}
