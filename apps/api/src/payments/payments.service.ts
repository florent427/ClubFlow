import {
  BadRequestException,
  ForbiddenException,
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
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { RecordManualPaymentInput } from './dto/record-manual-payment.input';
import { UpsertClubPricingRuleInput } from './dto/upsert-pricing-rule.input';
import { invoicePaymentTotals } from './invoice-totals';
import { applyPricing } from './pricing-rules';

type FamilyForLabel = {
  familyMembers: Array<{
    member: { lastName: string | null; firstName: string | null } | null;
    contact: { lastName: string | null; firstName: string | null } | null;
  }>;
} | null;

function deriveFamilyLabel(family: FamilyForLabel): string | null {
  if (!family) return null;
  const lastNames = new Set<string>();
  for (const fm of family.familyMembers) {
    const ln = fm.contact?.lastName ?? fm.member?.lastName;
    if (ln && ln.trim()) lastNames.add(ln.trim());
  }
  if (lastNames.size === 0) return null;
  const sorted = Array.from(lastNames).sort();
  return `Famille ${sorted.join('-')}`;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly documentsGating: DocumentsGatingService,
  ) {}

  /**
   * Refuse l'enregistrement d'un paiement manuel si le payeur identifié
   * (membre OU contact rattaché à un User) a des documents requis non
   * signés. Pas de gating si :
   *  - aucun payeur identifié n'est passé en input (saisie admin libre)
   *  - le module DOCUMENTS est désactivé pour ce club
   *  - le payeur est un Contact sans User lié (cas dégradé : on tracerait
   *    une signature impossible à vérifier)
   *
   * NB : on ne gate PAS le webhook Stripe (`applyStripePaymentSuccess`) :
   * le paiement est déjà encaissé côté Stripe au moment où on reçoit
   * l'événement, le rejeter génèrerait un trou comptable. Le gating doit
   * être fait en amont, lors de la création de la session Checkout.
   */
  private async assertPayerDocumentsSignedOrThrow(
    clubId: string,
    paidByMemberId: string | null | undefined,
    paidByContactId: string | null | undefined,
  ): Promise<void> {
    if (!paidByMemberId && !paidByContactId) return;
    const moduleRow = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.DOCUMENTS },
      },
      select: { enabled: true },
    });
    if (!moduleRow?.enabled) return;

    let userId: string | null = null;
    let memberId: string | null = null;

    if (paidByMemberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: paidByMemberId, clubId },
        select: { userId: true, id: true },
      });
      if (!member?.userId) return;
      userId = member.userId;
      memberId = member.id;
    } else if (paidByContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: paidByContactId, clubId },
        select: { userId: true },
      });
      if (!contact?.userId) return;
      userId = contact.userId;
    }

    if (!userId) return;
    const result = await this.documentsGating.hasUnsignedRequiredDocuments(
      clubId,
      userId,
      memberId,
    );
    if (result.count > 0) {
      const lines = result.documents.map((d) => `- ${d.name}`).join('\n');
      throw new ForbiddenException(
        `Le payeur doit signer les documents suivants avant tout paiement :\n${lines}`,
      );
    }
  }

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

  /**
   * Somme des avoirs émis sur une facture parente (excluant ceux qui
   * seraient en VOID — annulation d'avoir = rare).
   */
  async sumCreditNotesForInvoice(parentInvoiceId: string): Promise<number> {
    const agg = await this.prisma.invoice.aggregate({
      where: {
        parentInvoiceId,
        isCreditNote: true,
        status: { not: InvoiceStatus.VOID },
      },
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
        // Avoirs liés à cette facture — on déduit leur montant du
        // balanceCents pour que le « Reste dû » reflète bien le crédit
        // émis. On exclut les avoirs eux-mêmes en VOID (rares).
        creditNotes: {
          where: { isCreditNote: true, status: { not: 'VOID' } },
          select: { amountCents: true },
        },
        family: {
          select: {
            label: true,
            familyMembers: {
              include: {
                member: { select: { lastName: true, firstName: true } },
                contact: { select: { lastName: true, firstName: true } },
              },
            },
          },
        },
        householdGroup: { select: { label: true } },
      },
    });
    return rows.map(({ payments, creditNotes, family, householdGroup, ...inv }) => {
      const paid = payments.reduce((s, p) => s + p.amountCents, 0);
      const creditNotesTotal = creditNotes.reduce(
        (s, cn) => s + cn.amountCents,
        0,
      );
      const { totalPaidCents, balanceCents, creditNotesAppliedCents } =
        invoicePaymentTotals(inv.amountCents, paid, creditNotesTotal, inv.isCreditNote);
      return {
        ...inv,
        totalPaidCents,
        balanceCents,
        creditNotesAppliedCents,
        familyLabel: family?.label ?? deriveFamilyLabel(family) ?? null,
        householdGroupLabel: householdGroup?.label ?? null,
      };
    });
  }

  async getInvoiceDetail(clubId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: {
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
            membershipProduct: { select: { id: true, label: true } },
            membershipOneTimeFee: { select: { id: true, label: true } },
            adjustments: { orderBy: { stepOrder: 'asc' } },
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            paidByMember: { select: { id: true, firstName: true, lastName: true } },
            paidByContact: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        creditNotes: {
          where: { isCreditNote: true, status: { not: 'VOID' } },
          select: { id: true, amountCents: true, label: true, createdAt: true },
        },
        family: {
          include: {
            familyMembers: {
              include: {
                member: { select: { lastName: true, firstName: true } },
                contact: { select: { lastName: true, firstName: true } },
              },
            },
          },
        },
        clubSeason: { select: { id: true, label: true } },
      },
    });
    if (!inv) {
      throw new NotFoundException('Facture introuvable');
    }
    const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
    const creditNotesTotal = inv.creditNotes.reduce(
      (s, cn) => s + cn.amountCents,
      0,
    );
    const { totalPaidCents, balanceCents, creditNotesAppliedCents } =
      invoicePaymentTotals(
        inv.amountCents,
        paid,
        creditNotesTotal,
        inv.isCreditNote,
      );
    const familyWithLabel = inv.family
      ? {
          id: inv.family.id,
          label: inv.family.label ?? deriveFamilyLabel(inv.family),
        }
      : null;
    return { ...inv, family: familyWithLabel, totalPaidCents, balanceCents };
  }

  async issueInvoice(clubId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');
    if (inv.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        "Seule une facture en brouillon peut être émise.",
      );
    }
    const lines = await this.prisma.invoiceLine.count({
      where: { invoiceId },
    });
    if (lines === 0) {
      throw new BadRequestException('Facture sans ligne, impossible d\u2019émettre.');
    }
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.OPEN },
    });
  }

  /**
   * Crée un AVOIR (credit note) rattaché à une facture existante.
   * - `amountCents` : montant à rembourser. Si null, reprend le montant de la facture parente.
   * - `reason` : motif affiché sur l'avoir et conservé en DB.
   *
   * Règles :
   * - La facture parente doit exister et appartenir au club.
   * - Le montant ne peut pas excéder le montant total de la facture parente.
   * - L'avoir est créé avec `status: PAID` (document final, pas modifiable).
   */
  async createCreditNote(
    clubId: string,
    parentInvoiceId: string,
    reason: string,
    amountCents?: number | null,
  ) {
    const parent = await this.prisma.invoice.findFirst({
      where: { id: parentInvoiceId, clubId },
    });
    if (!parent) {
      throw new NotFoundException('Facture parente introuvable');
    }
    if (parent.isCreditNote) {
      throw new BadRequestException(
        'Impossible de créer un avoir sur un avoir.',
      );
    }
    const amount = amountCents ?? parent.amountCents;
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (amount > parent.amountCents) {
      throw new BadRequestException(
        "Le montant de l'avoir ne peut excéder celui de la facture.",
      );
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Motif obligatoire pour un avoir.');
    }
    const creditNote = await this.prisma.invoice.create({
      data: {
        clubId,
        familyId: parent.familyId,
        householdGroupId: parent.householdGroupId,
        clubSeasonId: parent.clubSeasonId,
        label: `Avoir — ${parent.label}`,
        baseAmountCents: amount,
        amountCents: amount,
        status: InvoiceStatus.PAID,
        isCreditNote: true,
        parentInvoiceId: parent.id,
        creditNoteReason: trimmedReason,
      },
    });
    // Hook comptable : génère l'entry de contre-passation liée à la
    // facture parente. Silencieux si module compta désactivé.
    await this.accounting.createContraEntryForCreditNote(
      clubId,
      creditNote.id,
    );
    return creditNote;
  }

  async voidInvoice(clubId: string, invoiceId: string, reason?: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: { payments: true },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');
    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Une facture payée ne peut être annulée.');
    }
    if (inv.payments.length > 0) {
      throw new BadRequestException(
        "Des paiements existent : annulez d\u2019abord les encaissements.",
      );
    }
    const labelSuffix = reason ? ` (annul\u00e9 : ${reason})` : ' (annul\u00e9)';
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.VOID,
        label: inv.label.includes('annul\u00e9') ? inv.label : inv.label + labelSuffix,
      },
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
    // Gating Documents à signer : on bloque l'enregistrement d'un paiement
    // si le payeur identifié a des documents non signés. Voir docstring de
    // assertPayerDocumentsSignedOrThrow pour la liste des cas non gatés.
    await this.assertPayerDocumentsSignedOrThrow(
      clubId,
      input.paidByMemberId,
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
    const creditNotesBefore = await this.sumCreditNotesForInvoice(invoice.id);
    const { balanceCents } = invoicePaymentTotals(
      invoice.amountCents,
      paidBefore,
      creditNotesBefore,
      invoice.isCreditNote,
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
    const creditNotesBefore = await this.sumCreditNotesForInvoice(invoice.id);
    const { balanceCents } = invoicePaymentTotals(
      invoice.amountCents,
      paidBefore,
      creditNotesBefore,
      invoice.isCreditNote,
    );
    if (balanceCents <= 0) {
      return;
    }

    // Idempotence : si ce paymentIntent a déjà été enregistré, on ne duplique pas.
    const already = await this.prisma.payment.findFirst({
      where: { invoiceId: invoice.id, externalRef: paymentIntentId },
      select: { id: true },
    });
    if (already) {
      return;
    }

    // Tolérance aux paiements partiels (via Stripe : remboursements partiels,
    // application de coupon côté Stripe, etc.). On n'ignore plus silencieusement
    // un montant différent — on enregistre ce qu'on reçoit, dans la limite du
    // solde dû. Le trop-plein serait un bug Stripe côté marchand.
    const amountToRecord = Math.max(0, Math.min(amountCents, balanceCents));
    if (amountToRecord <= 0) {
      return;
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents: amountToRecord,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: paymentIntentId,
          paidByMemberId,
        },
      });
      const fullyPaid = amountToRecord >= balanceCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          // Ne passe en PAID que si l'invoice est soldée. Sinon, reste OPEN
          // — la balance sera visible côté admin pour relance ou 2e paiement.
          ...(fullyPaid ? { status: InvoiceStatus.PAID } : {}),
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
