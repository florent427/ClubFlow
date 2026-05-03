import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { FamiliesResolver } from './families.resolver';
import { FamiliesService } from './families.service';
import { FamilyInviteResolver } from './family-invite.resolver';
import { FamilyInviteService } from './family-invite.service';

@Module({
  imports: [PrismaModule, forwardRef(() => MailModule)],
  providers: [
    FamiliesService,
    FamiliesResolver,
    FamilyInviteService,
    FamilyInviteResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [FamiliesService, FamilyInviteService],
})
export class FamiliesModule {}
