import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { CommsResolver } from './comms.resolver';
import { CommsService } from './comms.service';

@Module({
  imports: [PrismaModule, MembersModule, MailModule],
  providers: [CommsService, CommsResolver, ClubModuleEnabledGuard],
  exports: [CommsService],
})
export class CommsModule {}
