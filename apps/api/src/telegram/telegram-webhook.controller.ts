import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramApiService } from './telegram-api.service';
import { TelegramLinkService } from './telegram-link.service';

/** Payload minimal Telegram Update (message privé /start). */
type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
  };
};

@Controller('webhooks')
export class TelegramWebhookController {
  private readonly log = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly link: TelegramLinkService,
    private readonly telegramApi: TelegramApiService,
  ) {}

  private verifySecret(header: string | undefined): void {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected) {
      return;
    }
    if (header !== expected) {
      throw new UnauthorizedException();
    }
  }

  @Post('telegram')
  @HttpCode(200)
  async telegramWebhook(
    @Body() body: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: boolean }> {
    this.verifySecret(secretToken);
    try {
      const msg = body?.message;
      if (!msg?.text?.startsWith('/start')) {
        return { ok: true };
      }
      const parts = msg.text.trim().split(/\s+/);
      const payload = parts[1];
      if (!payload) {
        return { ok: true };
      }
      const chatId = String(msg.chat.id);
      await this.link.consumeStartPayload(payload, chatId);
      try {
        await this.telegramApi.sendMessage(
          chatId,
          'Compte ClubFlow relié. Vous pouvez recevoir les messages du club sur Telegram.',
        );
      } catch (e) {
        this.log.warn(`telegram welcome after link failed: ${e}`);
      }
    } catch (e) {
      this.log.error(`telegram webhook: ${e}`);
    }
    return { ok: true };
  }
}
