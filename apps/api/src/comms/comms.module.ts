import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { CommsResolver } from './comms.resolver';
import { CommsService } from './comms.service';

@Module({
  imports: [
    PrismaModule,
    MembersModule,
    MailModule,
    MessagingModule,
    TelegramModule,
    PushModule,
  ],
  providers: [CommsService, CommsResolver, ClubModuleEnabledGuard],
  exports: [CommsService],
})
export class CommsModule {}
