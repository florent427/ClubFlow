import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Appels HTTPS vers l’API Bot Telegram (sendMessage).
 * @see https://core.telegram.org/bots/api
 */
@Injectable()
export class TelegramApiService {
  private readonly log = new Logger(TelegramApiService.name);

  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      throw new BadRequestException(
        'Telegram non configuré : définissez TELEGRAM_BOT_TOKEN sur l’API.',
      );
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      this.log.warn(`telegram sendMessage failed: ${res.status} ${errText}`);
      throw new BadRequestException(
        `Telegram a refusé l’envoi (${res.status}). Vérifiez le chat ou le token.`,
      );
    }
  }
}
