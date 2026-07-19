import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';
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
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly documentsGating: DocumentsGatingService,
    private readonly connect: StripeConnectService,
    private readonly paymentSchedules: PaymentScheduleService,
    private readonly scheduleEngine: PaymentScheduleEngineService,
    private readonly stripeFees: StripeFeesService,
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
    // Motif stock\u00e9 en champ d\u00e9di\u00e9 \u2014 le label reste intact (le statut VOID
    // porte d\u00e9j\u00e0 l'information \u00ab Annul\u00e9e \u00bb c\u00f4t\u00e9 UI).
    const voided = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.VOID,
        voidReason: reason?.trim() || null,
      },
    });

    // Une facture annul\u00e9e ne doit plus rien pr\u00e9lever : sans cette cl\u00f4ture, un
    // \u00e9ch\u00e9ancier rest\u00e9 ACTIVE continuerait de d\u00e9biter l'adh\u00e9rent pour une
    // facture qui n'existe plus comptablement.
    await this.scheduleEngine.closeScheduleForInvoice(
      invoiceId,
      InvoiceStatus.VOID,
    );

    return voided;
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

    // Un prélèvement peut être parti sans être encore dénoué — 3 à 5 jours en
    // SEPA. Il n'apparaît dans aucun Payment, donc `balanceCents` le croit
    // encore dû. C'est le cas réel le plus probable de double paiement :
    // l'adhérent ne voit rien sur son compte, remet un chèque, et le
    // prélèvement se dénoue ensuite. On refuse la part qui ferait doublon,
    // sans bloquer un encaissement partiel qui, lui, ne chevauche rien.
    const engaged = await this.scheduleEngine.sumInFlightForInvoice(invoice.id);
    if (engaged > 0 && input.amountCents > balanceCents - engaged) {
      throw new BadRequestException(
        `Un prélèvement de ${engaged} cts est en cours de dénouement sur cette facture. ` +
          `Vous pouvez encaisser au plus ${Math.max(0, balanceCents - engaged)} cts sans risque ` +
          `de double paiement. Attendez son issue, ou annulez l’échéancier avant de saisir.`,
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

    // AVANT la comptabilité, et c'est délibéré. Un règlement encaissé hors
    // échéancier peut solder la facture ; sans cette clôture, le plan reste
    // ACTIVE et le moteur continuerait de prélever une facture déjà payée.
    // Placée après le hook comptable, la clôture sautait dès que celui-ci
    // échouait — un club sans compte financier configuré suffisait — et
    // laissait exactement l'état dangereux qu'elle doit empêcher.
    //
    // On se base sur le solde réel, avoirs déduits, et non sur le passage en
    // PAID : celui-ci repose sur une égalité stricte au montant nominal, qui
    // ne couvre pas le cas d'un avoir.
    if (balanceCents - input.amountCents <= 0) {
      await this.scheduleEngine.closeScheduleForInvoice(
        invoice.id,
        InvoiceStatus.PAID,
      );
    }

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

    // Réservation de l'événement. La contrainte d'unicité arbitre : si deux
    // livraisons concurrentes arrivent, une seule crée la ligne et traite.
    // (L'ancien findUnique-puis-create n'était pas atomique.)
    try {
      await this.prisma.stripeWebhookEvent.create({ data: { id: event.id } });
    } catch {
      // Déjà réservé — traitement en cours ou terminé.
      return;
    }

    try {
      await this.dispatchWebhookEvent(event);
    } catch (err) {
      // On LIBÈRE la réservation avant de propager l'erreur, sinon la
      // réessai de Stripe se heurterait au marqueur et sortirait aussitôt :
      // le travail restant serait perdu définitivement. Constaté en staging
      // le 2026-07-18 — une échéance encaissée est restée non rattachée.
      await this.prisma.stripeWebhookEvent
        .delete({ where: { id: event.id } })
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Aiguillage par type d'événement. Isolé de la réservation d'idempotence
   * pour que toute erreur ici puisse être rejouée par Stripe.
   */
  private async dispatchWebhookEvent(event: Stripe.Event): Promise<void> {
    // Compte connecté émetteur de l'événement (direct charges, ADR-0008).
    // Null pour les événements émis par le compte plateforme lui-même.
    const eventAccount = event.account ?? null;

    // Onboarding Connect : Stripe notifie chaque changement de capacité
    // (KYC validé, virements activés, pièces manquantes…).
    if (event.type === 'account.updated') {
      await this.connect.applyAccountUpdated(event.data.object as Stripe.Account);
      return;
    }

    // Fin du parcours d'enregistrement d'un moyen de paiement pour un
    // échéancier (ADR-0009). On écoute le SetupIntent plutôt que la session :
    // il porte directement le payment_method et, en SEPA, le mandat.
    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object as Stripe.SetupIntent;
      const scheduleId = si.metadata?.scheduleId;
      if (!scheduleId || !eventAccount) return;
      const paymentMethodId =
        typeof si.payment_method === 'string'
          ? si.payment_method
          : (si.payment_method?.id ?? null);
      if (!paymentMethodId) return;
      const mandateReference =
        typeof si.mandate === 'string' ? si.mandate : (si.mandate?.id ?? null);
      await this.paymentSchedules.applySetupCompleted({
        scheduleId,
        stripeAccountId: eventAccount,
        paymentMethodId,
        mandateReference,
      });
      return;
    }

    // Mandat SEPA révoqué : l'adhérent peut le faire auprès de sa banque à
    // tout moment. Continuer à prélever ne produirait que des rejets facturés.
    if (event.type === 'mandate.updated') {
      await this.scheduleEngine.applyMandateUpdated(
        event.data.object as Stripe.Mandate,
        eventAccount,
      );
      return;
    }

    // Échec de prélèvement signalé après coup. Vital pour le SEPA, dont le
    // rejet survient plusieurs jours après l'ordre : sans ça, l'échéance
    // resterait bloquée en PROCESSING indéfiniment.
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.scheduleEngine.applyAsyncFailure({
        paymentIntentId: pi.id,
        stripeAccountId: eventAccount,
        code: pi.last_payment_error?.code ?? 'payment_failed',
        message:
          pi.last_payment_error?.message ?? 'Prélèvement refusé par la banque',
      });
      return;
    }

    // Stripe a viré au club le net de ses encaissements : on solde le compte
    // de transit vers la banque. Sans cette écriture, le transit gonflerait
    // indéfiniment et la banque resterait vide alors que l'argent y est.
    if (event.type === 'payout.paid') {
      const payout = event.data.object as Stripe.Payout;
      if (!eventAccount) return;
      const club = await this.prisma.club.findFirst({
        where: { stripeAccountId: eventAccount },
        select: { id: true },
      });
      if (!club) {
        this.logger.warn(
          `[payout] virement ${payout.id} reçu du compte ${eventAccount} — aucun club rattaché.`,
        );
        return;
      }
      await this.accounting.recordStripePayout({
        clubId: club.id,
        payoutId: payout.id,
        amountCents: payout.amount,
        // `arrival_date` est en secondes ; c'est la date à laquelle les fonds
        // atteignent la banque, donc la date comptable pertinente.
        occurredAt: new Date(payout.arrival_date * 1000),
      });
      return;
    }

    // Le prélèvement off-session réclame une authentification forte.
    if (event.type === 'payment_intent.requires_action') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.scheduleEngine.applyRequiresAction(pi.id, eventAccount);
      return;
    }

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
      // Présent uniquement quand le paiement vient du moteur d'échéancier.
      const installmentId =
        typeof pi.metadata?.installmentId === 'string' &&
        pi.metadata.installmentId.length > 0
          ? pi.metadata.installmentId
          : null;
      await this.applyStripePaymentSuccess(
        clubId,
        invoiceId,
        pi.id,
        amount,
        paidByMemberId,
        eventAccount,
        installmentId,
      );
    }
  }

  private async applyStripePaymentSuccess(
    clubId: string,
    invoiceId: string,
    paymentIntentId: string,
    amountCents: number,
    paidByMemberId: string | null,
    stripeAccountId: string | null = null,
    installmentId: string | null = null,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId, status: InvoiceStatus.OPEN },
    });
    if (!invoice) {
      // De l'argent a été encaissé sur le compte du club pour une facture qui
      // n'est plus ouverte. On ne peut pas l'enregistrer — la facture n'attend
      // plus rien — mais se taire reviendrait à le faire disparaître des
      // comptes. Le trésorier doit pouvoir retrouver et rembourser.
      this.logger.error(
        `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent ${paymentIntentId} ` +
          `(${amountCents} cts) reçu pour la facture ${invoiceId} du club ${clubId}, ` +
          `qui n'est pas OPEN. Aucun Payment créé — remboursement probablement dû.`,
      );
      return;
    }

    // Garde-fou multi-tenant : l'événement doit provenir du compte connecté
    // de CE club. Sans ce contrôle, un compte connecté tiers pourrait, en
    // forgeant les metadata, faire passer la facture d'un autre club en PAID.
    if (stripeAccountId) {
      const club = await this.prisma.club.findUnique({
        where: { id: clubId },
        select: { stripeAccountId: true },
      });
      if (club?.stripeAccountId && club.stripeAccountId !== stripeAccountId) {
        this.logger.warn(
          `[stripe] payment_intent ${paymentIntentId} reçu du compte ${stripeAccountId} ` +
            `mais le club ${clubId} est rattaché à ${club.stripeAccountId} — ignoré.`,
        );
        return;
      }
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
      this.logger.error(
        `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent ${paymentIntentId} ` +
          `(${amountCents} cts) reçu pour la facture ${invoiceId} du club ${clubId}, ` +
          `dont le solde est déjà nul. Aucun Payment créé — remboursement probablement dû.`,
      );
      return;
    }

    // Idempotence : si ce paymentIntent a déjà été enregistré, on ne duplique pas.
    const already = await this.prisma.payment.findFirst({
      where: { invoiceId: invoice.id, externalRef: paymentIntentId },
      select: { id: true },
    });
    if (already) {
      // Rejeu de webhook. On ressort sans rien dupliquer, mais on en profite
      // pour retenter les frais : c'est souvent la raison même du rejeu, et
      // sans cette tentative le rejeu serait entièrement stérile.
      await this.trySyncFees(already.id);
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
          // Compte sur lequel l'argent est réellement tombé : indispensable
          // pour rembourser sur le bon compte plus tard (ADR-0008).
          stripeAccountId,
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

    // Prélèvement d'échéancier : le Payment vient d'être créé, on peut donc
    // solder l'échéance correspondante. Le moteur ne fait jamais cette
    // écriture lui-même — un seul chemin crée un encaissement (ADR-0009).
    if (installmentId) {
      await this.scheduleEngine.markInstallmentPaid(installmentId, payment.id);
    }

    // En DERNIER, et sans jamais lever. Les frais sont une information de
    // confort comptable : ni l'encaissement, ni le soldage d'échéance ne
    // doivent en dépendre. En carte ils sont déjà connus ; en SEPA la charge
    // n'est pas dénouée et c'est le balayage quotidien qui repassera.
    await this.trySyncFees(payment.id);
  }

  /**
   * Récupération des frais, isolée du sort de l'encaissement.
   *
   * `StripeFeesService` s'engage déjà à ne jamais lever, mais ce garde-fou est
   * ici parce que la conséquence d'un manquement serait disproportionnée : une
   * exception ferait échouer le webhook, libérerait la réservation
   * d'idempotence, et Stripe rejouerait en boucle un encaissement pourtant
   * correctement enregistré — le rejeu retombant à chaque fois sur la même
   * exception. Une discipline d'appelé ne se vérifie pas au moment où elle
   * compte ; ce catch, si.
   */
  private async trySyncFees(paymentId: string): Promise<void> {
    try {
      await this.stripeFees.syncFeesForPayment(paymentId);
    } catch (err) {
      this.logger.warn(
        `[stripe] frais non récupérés pour le paiement ${paymentId} — ${(err as Error).message}`,
      );
    }
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
