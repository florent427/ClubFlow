import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Invoice,
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { RecordManualPaymentInput } from './dto/record-manual-payment.input';
import { UpsertClubPricingRuleInput } from './dto/upsert-pricing-rule.input';
import { invoicePaymentTotals } from './invoice-totals';
import { applyPricing } from './pricing-rules';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  private async assertPaidByMemberAllowedForInvoice(
    invoice: {
      clubId: string;
      familyId: string | null;
      householdGroupId: string | null;
    },
    paidByMemberId: string | null | undefined,
  ): Promise<void> {
    if (paidByMemberId == null || paidByMemberId === '') {
      return;
    }
    const payer = await this.prisma.member.findFirst({
      where: {
        id: paidByMemberId,
        clubId: invoice.clubId,
        status: MemberStatus.ACTIVE,
      },
    });
    if (!payer) {
      throw new BadRequestException('Payeur membre introuvable pour ce club');
    }
    let gId = invoice.householdGroupId;
    if (!gId && invoice.familyId) {
      const fam = await this.prisma.family.findFirst({
        where: { id: invoice.familyId },
        select: { householdGroupId: true },
      });
      gId = fam?.householdGroupId ?? null;
    }
    if (gId) {
      const ok = await this.prisma.familyMember.findFirst({
        where: {
          memberId: paidByMemberId,
          family: { householdGroupId: gId },
        },
      });
      if (!ok) {
        throw new BadRequestException(
          'Le payeur doit être rattaché au même groupe foyer que la facture',
        );
      }
      return;
    }
    if (invoice.familyId) {
      const ok = await this.prisma.familyMember.findFirst({
        where: { memberId: paidByMemberId, familyId: invoice.familyId },
      });
      if (!ok) {
        throw new BadRequestException(
          'Le payeur doit appartenir au foyer de la facture',
        );
      }
      return;
    }
    throw new BadRequestException(
      'Payeur renseigné impossible : facture sans foyer ni groupe',
    );
  }

  private async assertPaidByContactAllowedForInvoice(
    invoice: {
      clubId: string;
      familyId: string | null;
      householdGroupId: string | null;
    },
    paidByContactId: string | null | undefined,
  ): Promise<void> {
    if (paidByContactId == null || paidByContactId === '') {
      return;
    }
    const payer = await this.prisma.contact.findFirst({
      where: { id: paidByContactId, clubId: invoice.clubId },
    });
    if (!payer) {
      throw new BadRequestException('Payeur contact introuvable pour ce club');
    }
    let gId = invoice.householdGroupId;
    if (!gId && invoice.familyId) {
      const fam = await this.prisma.family.findFirst({
        where: { id: invoice.familyId },
        select: { householdGroupId: true },
      });
      gId = fam?.householdGroupId ?? null;
    }
    if (gId) {
      const ok = await this.prisma.familyMember.findFirst({
        where: {
          contactId: paidByContactId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { householdGroupId: gId },
        },
      });
      if (!ok) {
        throw new BadRequestException(
          'Le contact payeur doit être rattaché au même groupe foyer que la facture',
        );
      }
      return;
    }
    if (invoice.familyId) {
      const ok = await this.prisma.familyMember.findFirst({
        where: {
          contactId: paidByContactId,
          linkRole: FamilyMemberLinkRole.PAYER,
          familyId: invoice.familyId,
        },
      });
      if (!ok) {
        throw new BadRequestException(
          'Le contact payeur doit être désigné pour le foyer de la facture',
        );
      }
      return;
    }
    throw new BadRequestException(
      'Payeur contact impossible : facture sans foyer ni groupe',
    );
  }

  async sumPaidCentsForInvoice(invoiceId: string): Promise<number> {
    const agg = await this.prisma.payment.aggregate({
      where: { invoiceId },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }

  async listInvoices(clubId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: { select: { amountCents: true } },
      },
    });
    return rows.map(({ payments, ...inv }) => {
      const paid = payments.reduce((s, p) => s + p.amountCents, 0);
      const { totalPaidCents, balanceCents } = invoicePaymentTotals(
        inv.amountCents,
        paid,
      );
      return { ...inv, totalPaidCents, balanceCents };
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
    let householdGroupId: string | null =
      input.householdGroupId === undefined || input.householdGroupId === ''
        ? null
        : input.householdGroupId;
    let familyId = input.familyId ?? null;
    if (input.householdGroupId) {
      const grp = await this.prisma.householdGroup.findFirst({
        where: { id: input.householdGroupId, clubId },
      });
      if (!grp) {
        throw new BadRequestException('Groupe foyer inconnu pour ce club');
      }
      householdGroupId = grp.id;
      if (familyId == null && grp.carrierFamilyId != null) {
        familyId = grp.carrierFamilyId;
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
        familyId,
        householdGroupId,
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
    const hasMember = !!(
      input.paidByMemberId != null && input.paidByMemberId !== ''
    );
    const hasContact = !!(
      input.paidByContactId != null && input.paidByContactId !== ''
    );
    if (hasMember && hasContact) {
      throw new BadRequestException(
        'Un seul payeur : renseigner paidByMemberId ou paidByContactId, pas les deux',
      );
    }
    await this.assertPaidByMemberAllowedForInvoice(
      invoice,
      input.paidByMemberId,
    );
    await this.assertPaidByContactAllowedForInvoice(
      invoice,
      input.paidByContactId,
    );
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

    const paidBefore = await this.sumPaidCentsForInvoice(invoice.id);
    const { balanceCents } = invoicePaymentTotals(
      invoice.amountCents,
      paidBefore,
    );
    if (balanceCents <= 0) {
      throw new BadRequestException('Facture déjà entièrement encaissée');
    }
    if (input.amountCents > balanceCents) {
      throw new BadRequestException(
        `Montant trop élevé : reste à payer ${balanceCents} cts (centimes).`,
      );
    }

    const ref = input.externalRef?.trim() || null;
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
          externalRef: ref,
          paidByMemberId: input.paidByMemberId ?? null,
          paidByContactId: input.paidByContactId ?? null,
        },
      });
      const newPaid = paidBefore + input.amountCents;
      if (newPaid === invoice.amountCents) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.PAID },
        });
      }
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
      const paidByMemberId =
        typeof pi.metadata?.paidByMemberId === 'string' &&
        pi.metadata.paidByMemberId.length > 0
          ? pi.metadata.paidByMemberId
          : null;
      await this.applyStripePaymentSuccess(
        clubId,
        invoiceId,
        pi.id,
        amount,
        paidByMemberId,
      );
    }
  }

  private async applyStripePaymentSuccess(
    clubId: string,
    invoiceId: string,
    paymentIntentId: string,
    amountCents: number,
    paidByMemberId: string | null,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId, status: InvoiceStatus.OPEN },
    });
    if (!invoice) {
      return;
    }
    await this.assertPaidByMemberAllowedForInvoice(invoice, paidByMemberId);
    const paidBefore = await this.sumPaidCentsForInvoice(invoice.id);
    const { balanceCents } = invoicePaymentTotals(
      invoice.amountCents,
      paidBefore,
    );
    if (balanceCents <= 0) {
      return;
    }
    if (amountCents !== balanceCents) {
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
          paidByMemberId,
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
