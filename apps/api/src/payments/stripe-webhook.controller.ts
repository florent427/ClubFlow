import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig?: string,
  ): Promise<{ received: boolean }> {
    const buf = req.rawBody;
    if (!Buffer.isBuffer(buf)) {
      throw new BadRequestException(
        'Corps brut requis (NestFactory avec rawBody: true)',
      );
    }
    await this.payments.handleStripeWebhook(buf, sig);
    return { received: true };
  }
}
