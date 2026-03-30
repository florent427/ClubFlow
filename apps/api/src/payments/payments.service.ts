import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Invoice,
  ClubPaymentMethod,
  InvoiceStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { RecordManualPaymentInput } from './dto/record-manual-payment.input';
import { UpsertClubPricingRuleInput } from './dto/upsert-pricing-rule.input';
import { applyPricing } from './pricing-rules';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async listInvoices(clubId: string) {
    return this.prisma.invoice.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPricingRules(clubId: string) {
    return this.prisma.clubPricingRule.findMany({ where: { clubId } });
  }

  async upsertPricingRule(
    clubId: string,
    input: UpsertClubPricingRuleInput,
  ) {
    return this.prisma.clubPricingRule.upsert({
      where: {
        clubId_method: { clubId, method: input.method },
      },
      create: {
        clubId,
        method: input.method,
        adjustmentType: input.adjustmentType,
        adjustmentValue: input.adjustmentValue,
      },
      update: {
        adjustmentType: input.adjustmentType,
        adjustmentValue: input.adjustmentValue,
      },
    });
  }

  async createInvoice(
    clubId: string,
    input: CreateInvoiceInput,
  ): Promise<Invoice> {
    if (input.baseAmountCents < 0) {
      throw new BadRequestException('Montant invalide');
    }
    if (input.familyId) {
      const fam = await this.prisma.family.findFirst({
        where: { id: input.familyId, clubId },
      });
      if (!fam) {
        throw new BadRequestException('Famille inconnue pour ce club');
      }
    }
    const rule = await this.prisma.clubPricingRule.findUnique({
      where: {
        clubId_method: { clubId, method: input.pricingMethod },
      },
    });
    const amountCents = applyPricing(
      input.baseAmountCents,
      input.pricingMethod,
      rule,
    );
    return this.prisma.invoice.create({
      data: {
        clubId,
        familyId: input.familyId ?? null,
        label: input.label,
        baseAmountCents: input.baseAmountCents,
        amountCents,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });
  }

  async recordManualPayment(
    clubId: string,
    input: RecordManualPaymentInput,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, clubId },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        'Finalisez la facture (brouillon) avant enregistrement de paiement.',
      );
    }
    if (invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException('Facture déjà soldée ou annulée');
    }
    if (
      input.method === ClubPaymentMethod.STRIPE_CARD ||
      input.amountCents < 1
    ) {
      throw new BadRequestException(
        'Enregistrement manuel : utilisez un mode hors Stripe et un montant > 0',
      );
    }
    if (input.amountCents !== invoice.amountCents) {
      throw new BadRequestException(
        'MVP : le paiement doit couvrir le montant exact de la facture',
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID },
      });
      return p;
    });

    await this.accounting.recordIncomeFromPayment(
      clubId,
      payment.id,
      `Encaissement ${invoice.label}`,
      payment.amountCents,
    );

    return payment;
  }

  /**
   * Phase E.1 — Vérification signature Stripe + idempotence par `event.id`.
   */
  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET manquant');
    }
    if (!signature) {
      throw new BadRequestException('En-tête stripe-signature manquant');
    }
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Signature ou payload Stripe invalide');
    }

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
    });
    if (existing) {
      return;
    }

    await this.prisma.stripeWebhookEvent.create({
      data: { id: event.id },
    });

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      const clubId = pi.metadata?.clubId;
      if (!invoiceId || !clubId) {
        return;
      }
      const amount = pi.amount_received ?? pi.amount;
      await this.applyStripePaymentSuccess(
        clubId,
        invoiceId,
        pi.id,
        amount,
      );
    }
  }

  private async applyStripePaymentSuccess(
    clubId: string,
    invoiceId: string,
    paymentIntentId: string,
    amountCents: number,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId, status: InvoiceStatus.OPEN },
    });
    if (!invoice) {
      return;
    }
    if (amountCents !== invoice.amountCents) {
      return;
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: paymentIntentId,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          stripePaymentIntentId: paymentIntentId,
        },
      });
      return p;
    });

    await this.accounting.recordIncomeFromPayment(
      clubId,
      payment.id,
      `Stripe — ${invoice.label}`,
      payment.amountCents,
    );
  }

  async countOutstandingInvoices(clubId: string): Promise<number> {
    return this.prisma.invoice.count({
      where: { clubId, status: InvoiceStatus.OPEN },
    });
  }

  async sumRevenueCentsInMonth(
    clubId: string,
    ref: Date,
  ): Promise<number> {
    const start = new Date(
      Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const end = new Date(
      Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    const agg = await this.prisma.payment.aggregate({
      where: {
        clubId,
        createdAt: { gte: start, lt: end },
      },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }
}
