import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramApiService } from './telegram-api.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramResolver } from './telegram.resolver';
import { TelegramWebhookController } from './telegram-webhook.controller';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramApiService, TelegramLinkService, TelegramResolver],
  exports: [TelegramApiService, TelegramLinkService],
})
export class TelegramModule {}
