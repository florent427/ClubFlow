import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type Invoice,
  type Payment,
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  ClubFinancialAccountKind,
  InvoicePurpose,
  InvoiceStatus,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import {
  parseIsoDate,
  todayInClubTimezone,
} from '../accounting/accounting-fiscal-year.service';
import { AccountingService } from '../accounting/accounting.service';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from '../shop/shop.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';
import { StripeRefundsService } from './stripe-refunds.service';
import { CreditNotesService } from './credit-notes.service';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { ApplyPayerCreditInput } from './dto/apply-payer-credit.input';
import { RecordManualPaymentInput } from './dto/record-manual-payment.input';
import { RecordPayerCreditDepositInput } from './dto/record-payer-credit-deposit.input';
import { UpsertClubPricingRuleInput } from './dto/upsert-pricing-rule.input';
import { resolveInvoiceBalance } from './invoice-balance';
import { invoicePaymentTotals } from './invoice-totals';
import { readPayerCredit } from './payer-credit-balance';
import {
  resolvePayerCreditHolder,
  type PayerCreditHolder,
  type PayerCreditHolderRef,
} from './payer-credit-holder';
import { readPayerCreditTopUpMetadata } from './payer-credit-top-up';
import { assertNotPayerCreditMethod } from './payment-method-rules';
import { applyPricing } from './pricing-rules';
import { lockInvoiceInTx, lockPayerCreditInTx } from './settlement-locks';

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

/** Moyens d'une avance saisie par l'admin (ADR-0022). La carte viendra du portail. */
const PAYER_CREDIT_DEPOSIT_METHODS: ReadonlySet<ClubPaymentMethod> =
  new Set<ClubPaymentMethod>([
    ClubPaymentMethod.MANUAL_CASH,
    ClubPaymentMethod.MANUAL_CHECK,
    ClubPaymentMethod.MANUAL_TRANSFER,
  ]);

function eurosFr(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Ce qu'un contrôle de payeur lit d'une facture. */
type InvoiceForPayer = {
  id: string;
  clubId: string;
  familyId: string | null;
  householdGroupId: string | null;
  shopOrderId?: string | null;
  shopAdjustmentId?: string | null;
};

type PayerProfile = {
  paidByMemberId: string | null;
  paidByContactId: string | null;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly documentsGating: DocumentsGatingService,
    private readonly connect: StripeConnectService,
    private readonly paymentSchedules: PaymentScheduleService,
    private readonly scheduleEngine: PaymentScheduleEngineService,
    private readonly stripeFees: StripeFeesService,
    private readonly stripeRefunds: StripeRefundsService,
    private readonly creditNotes: CreditNotesService,
    private readonly shop: ShopService,
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
    invoice: InvoiceForPayer,
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
    // Facture sans foyer (ADR-0022, §3) : son acheteur boutique, ou le membre
    // facturé, peut la régler.
    if (await this.isInvoicePartyMember(invoice, paidByMemberId)) return;
    throw new BadRequestException(
      'Payeur renseigné impossible : facture sans foyer ni groupe',
    );
  }

  private async assertPaidByContactAllowedForInvoice(
    invoice: InvoiceForPayer,
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
    // Facture sans foyer (ADR-0022, §3) : son acheteur boutique, ou le membre
    // facturé, peut la régler.
    if (await this.isInvoicePartyContact(invoice, paidByContactId)) return;
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
    await this.assertNotPayerCreditDeposit(
      clubId,
      parentInvoiceId,
      'Un reçu d’avance ne reçoit pas d’avoir : ce n’est pas une dette, et l’argent versé reste au crédit de la personne.',
    );
    // Délégué : le remboursement Stripe passe par le même service, et deux
    // chemins d'avoir divergents produiraient des documents différents.
    //
    // Sur une facture réglée par crédit, l'avoir rend au crédit ce qu'il
    // rembourse, dans SA transaction (ADR-0022, §3) : un avoir sans son
    // paiement négatif laisserait le crédit consommé à tort.
    const { creditNote, returned } = await this.prisma.$transaction(async (tx) => {
      await lockInvoiceInTx(tx, parentInvoiceId);
      const note = await this.creditNotes.create({
        tx,
        clubId,
        parentInvoiceId,
        reason,
        amountCents,
      });
      return {
        creditNote: note,
        returned: await this.returnPayerCreditInTx(
          tx,
          clubId,
          parentInvoiceId,
          note.amountCents,
        ),
      };
    });
    const returnedCents = returned.reduce((sum, r) => sum + r.amountCents, 0);
    if (returnedCents === 0) {
      await this.creditNotes.recordAccounting(clubId, creditNote.id);
      return creditNote;
    }
    // La part rendue au crédit se contre-passe sur 419100 ; le reste suit
    // l'encaissement d'origine, comme pour tout avoir.
    await this.creditNotes.recordAccounting(
      clubId,
      creditNote.id,
      returned[0].sourcePaymentId,
      null,
      returnedCents,
    );
    if (creditNote.amountCents > returnedCents) {
      await this.creditNotes.recordAccounting(
        clubId,
        creditNote.id,
        null,
        null,
        creditNote.amountCents - returnedCents,
      );
    }
    return creditNote;
  }

  async voidInvoice(clubId: string, invoiceId: string, reason?: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: { payments: true },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');
    if (inv.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT) {
      throw new BadRequestException(
        'Un reçu d’avance ne s’annule pas : l’argent a été versé, il reste au crédit de la personne.',
      );
    }
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
    const voided = await this.prisma.$transaction(async (tx) => {
      // Relu sous le verrou de la facture (ADR-0022, §3) : un règlement qui l'a
      // relue ouverte attend ce commit, et un règlement déjà commité se voit
      // ici. Sans le verrou, l'annulation passait entre la relecture d'un
      // règlement et son commit.
      await lockInvoiceInTx(tx, invoiceId);
      const current = await tx.invoice.findFirst({
        where: { id: invoiceId, clubId },
        select: { status: true, payments: { select: { id: true } } },
      });
      if (!current) throw new NotFoundException('Facture introuvable');
      if (current.status === InvoiceStatus.PAID || current.payments.length > 0) {
        throw new BadRequestException(
          'Un règlement vient d’être enregistré sur cette facture : rechargez-la avant de l’annuler.',
        );
      }
      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.VOID,
          voidReason: reason?.trim() || null,
        },
      });
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
    assertNotPayerCreditMethod(
      input.method,
      'Le crédit ne porte pas de règle tarifaire : il règle le montant de la facture.',
    );
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
    assertNotPayerCreditMethod(
      input.pricingMethod,
      'Le crédit ne porte pas de règle tarifaire : il règle le montant de la facture.',
    );
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
    userId: string | null = null,
  ) {
    assertNotPayerCreditMethod(
      input.method,
      'Le crédit ne s’encaisse pas à la main : réglez la facture avec le crédit depuis son tiroir.',
    );
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, clubId },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (invoice.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT) {
      throw new BadRequestException(
        'Un reçu d’avance est déjà encaissé : pour verser à nouveau, encaissez une nouvelle avance.',
      );
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

    // Compte bancaire imposé (encaissement depuis un relevé, ADR-0014 §7) :
    // il doit être une banque active de CE club, sinon la recette
    // atterrirait sur le compte d'un autre.
    if (input.financialAccountId) {
      const fin = await this.financialAccounts.getById(
        clubId,
        input.financialAccountId,
      );
      if (fin.kind !== ClubFinancialAccountKind.BANK || !fin.isActive) {
        throw new BadRequestException(
          'Le compte d’encaissement doit être un compte bancaire actif du club.',
        );
      }
    }

    const ref = input.externalRef?.trim() || null;
    // Un chèque naît en portefeuille (ADR-0015) : sa fiche est créée dans la
    // MÊME transaction que le paiement, jamais après. Un paiement par chèque
    // sans fiche serait invisible à la remise, et la banque le verrait sans
    // que rien ne l'explique.
    const chequeData =
      input.method === ClubPaymentMethod.MANUAL_CHECK
        ? await this.buildChequeData(clubId, invoice.label, input, ref, userId)
        : null;
    const { payment, settled } = await this.prisma.$transaction(async (tx) => {
      // Relu sous verrou : deux saisies simultanées ne surpaient plus la
      // facture (ADR-0022, §3). Les contrôles d'avant restent, pour un refus
      // clair sans transaction.
      await lockInvoiceInTx(tx, invoice.id);
      const current = await resolveInvoiceBalance(tx, invoice.id, clubId);
      if (
        current.status !== InvoiceStatus.OPEN ||
        input.amountCents > current.collectableCents
      ) {
        throw new BadRequestException(
          `La facture vient de changer : reste à encaisser ${eurosFr(current.collectableCents)}. Rechargez-la avant de saisir.`,
        );
      }
      return this.settleInvoicePaymentInTx(tx, {
        clubId,
        invoice,
        balanceCents: current.balanceCents,
        payment: {
          amountCents: input.amountCents,
          method: input.method,
          externalRef: ref,
          paidByMemberId: input.paidByMemberId ?? null,
          paidByContactId: input.paidByContactId ?? null,
        },
        chequeData,
      });
    });

    await this.afterInvoicePaymentCommit(clubId, {
      invoiceId: invoice.id,
      settled,
      paymentId: payment.id,
      amountCents: payment.amountCents,
      label: `Encaissement ${invoice.label}`,
      financialAccountId: input.financialAccountId ?? null,
    });

    return payment;
  }

  /**
   * Effets d'un règlement sur sa facture, dans la transaction de l'appelant
   * (ADR-0022, §3). La saisie manuelle et l'imputation de crédit passent par
   * ici : paiement, fiche chèque, facture PAYÉE au solde avoirs déduits,
   * commande boutique servie. L'appelant tient le verrou de la facture et
   * fournit le reste dû qu'il vient d'y relire.
   */
  private async settleInvoicePaymentInTx(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      invoice: { id: string; shopOrderId?: string | null };
      /** Reste dû relu sous verrou, avant ce règlement. */
      balanceCents: number;
      payment: {
        amountCents: number;
        method: ClubPaymentMethod;
        externalRef: string | null;
        paidByMemberId: string | null;
        paidByContactId: string | null;
      };
      chequeData?: Omit<Prisma.ChequeUncheckedCreateInput, 'paymentId'> | null;
    },
  ): Promise<{ payment: Payment; settled: boolean }> {
    const payment = await tx.payment.create({
      data: {
        clubId: args.clubId,
        invoiceId: args.invoice.id,
        ...args.payment,
      },
    });
    // Un chèque naît en portefeuille (ADR-0015) : sa fiche vit ou meurt avec
    // son paiement.
    if (args.chequeData) {
      await tx.cheque.create({ data: { ...args.chequeData, paymentId: payment.id } });
    }
    // Le SOLDE décide, avoirs déduits : l'égalité au montant nominal laissait
    // ouverte une facture qu'un avoir avait réduite.
    const settled = args.balanceCents - args.payment.amountCents <= 0;
    if (settled) {
      await tx.invoice.update({
        where: { id: args.invoice.id },
        data: { status: InvoiceStatus.PAID },
      });
      // Commande boutique soldée : servie dans la même transaction, comme côté
      // Stripe. La sortie de stock est une garantie ; `fulfill` ne lève jamais
      // et reste idempotent.
      if (args.invoice.shopOrderId) {
        await this.shop.fulfillPaidShopOrderInTx(
          tx,
          args.clubId,
          args.invoice.shopOrderId,
        );
      }
    }
    return { payment, settled };
  }

  /**
   * Après le commit d'un règlement. La clôture de l'échéancier passe AVANT
   * l'écriture : placée après, elle sautait dès que l'écriture échouait, et le
   * moteur continuait de prélever une facture payée.
   */
  private async afterInvoicePaymentCommit(
    clubId: string,
    args: {
      invoiceId: string;
      settled: boolean;
      paymentId: string;
      amountCents: number;
      label: string;
      financialAccountId: string | null;
    },
  ): Promise<void> {
    if (args.settled) {
      await this.scheduleEngine.closeScheduleForInvoice(
        args.invoiceId,
        InvoiceStatus.PAID,
      );
    }
    await this.tryRecordIncome(
      clubId,
      args.paymentId,
      args.label,
      args.amountCents,
      args.financialAccountId,
    );
  }

  /**
   * Règle une facture avec le crédit d'une personne (ADR-0022, §3) : mêmes
   * effets qu'un encaissement manuel, sans mouvement d'argent. Sous deux
   * verrous, la personne puis la facture, le crédit et le reste dû sont relus
   * avant d'écrire. Deux imputations simultanées ne dépensent donc pas deux
   * fois le même crédit, et ne surpaient pas la facture.
   */
  async applyPayerCredit(clubId: string, input: ApplyPayerCreditInput) {
    if (
      input.amountCents != null &&
      (!Number.isInteger(input.amountCents) || input.amountCents < 1)
    ) {
      throw new BadRequestException('Le montant à régler doit être positif.');
    }
    const holder = await resolvePayerCreditHolder(this.prisma, clubId, input);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, clubId },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (invoice.isCreditNote || invoice.purpose !== InvoicePurpose.CHARGE) {
      throw new BadRequestException(
        'Le crédit règle une facture : ni un avoir, ni un reçu d’avance.',
      );
    }
    if (invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException(
        'Seule une facture ouverte se règle avec le crédit.',
      );
    }
    const payer = await this.payerProfileForCredit(invoice, holder);
    await this.assertPayerDocumentsSignedOrThrow(
      clubId,
      payer.paidByMemberId,
      payer.paidByContactId,
    );

    const applied = await this.prisma.$transaction(async (tx) => {
      await lockPayerCreditInTx(tx, holder.personKey);
      await lockInvoiceInTx(tx, invoice.id);
      const credit = await readPayerCredit(tx, clubId, holder);
      const current = await resolveInvoiceBalance(tx, invoice.id, clubId);
      if (current.status !== InvoiceStatus.OPEN) {
        throw new BadRequestException(
          'La facture vient d’être soldée ou annulée : rechargez-la.',
        );
      }
      // Un crédit négatif est à régulariser : il bloque toute imputation (§4).
      if (credit.balanceCents <= 0) {
        throw new BadRequestException(
          `${holder.displayName} n’a pas de crédit disponible.`,
        );
      }
      if (current.collectableCents <= 0) {
        throw new BadRequestException(
          'Rien ne reste à encaisser sur cette facture.',
        );
      }
      const ceilingCents = Math.min(credit.balanceCents, current.collectableCents);
      const amountCents = input.amountCents ?? ceilingCents;
      if (amountCents > ceilingCents) {
        throw new BadRequestException(
          `Au plus ${eurosFr(ceilingCents)} : crédit disponible ${eurosFr(credit.balanceCents)}, reste à encaisser ${eurosFr(current.collectableCents)}.`,
        );
      }
      const settled = await this.settleInvoicePaymentInTx(tx, {
        clubId,
        invoice,
        balanceCents: current.balanceCents,
        payment: {
          amountCents,
          method: ClubPaymentMethod.PAYER_CREDIT,
          externalRef: null,
          ...payer,
        },
      });
      return {
        ...settled,
        creditBalanceCents: credit.balanceCents - amountCents,
        invoiceBalanceCents: Math.max(0, current.balanceCents - amountCents),
      };
    });

    await this.afterInvoicePaymentCommit(clubId, {
      invoiceId: invoice.id,
      settled: applied.settled,
      paymentId: applied.payment.id,
      amountCents: applied.payment.amountCents,
      label: `Crédit — ${invoice.label}`,
      financialAccountId: null,
    });

    return {
      payment: applied.payment,
      invoiceId: invoice.id,
      invoiceStatus: applied.settled ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
      invoiceBalanceCents: applied.invoiceBalanceCents,
      creditBalanceCents: applied.creditBalanceCents,
    };
  }

  /**
   * Les personnes qui peuvent régler cette facture avec leur crédit, et combien
   * elles en ont. Le contrôle est celui de l'imputation elle-même : la liste ne
   * propose rien que la mutation refuserait.
   */
  async listPayerCreditCandidates(
    clubId: string,
    invoiceId: string,
  ): Promise<
    Array<{
      memberId: string | null;
      contactId: string | null;
      displayName: string;
      balanceCents: number;
    }>
  > {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (
      invoice.status !== InvoiceStatus.OPEN ||
      invoice.isCreditNote ||
      invoice.purpose !== InvoicePurpose.CHARGE
    ) {
      return [];
    }
    const candidates: Array<{
      memberId: string | null;
      contactId: string | null;
      displayName: string;
      balanceCents: number;
    }> = [];
    const seen = new Set<string>();
    for (const ref of await this.invoicePartyProfiles(invoice)) {
      let holder: PayerCreditHolder;
      try {
        holder = await resolvePayerCreditHolder(this.prisma, clubId, ref);
      } catch {
        continue;
      }
      if (seen.has(holder.personKey)) continue;
      seen.add(holder.personKey);
      let payer: PayerProfile;
      try {
        payer = await this.payerProfileForCredit(invoice, holder);
      } catch (err) {
        if (err instanceof BadRequestException) continue;
        throw err;
      }
      const credit = await readPayerCredit(this.prisma, clubId, holder);
      if (credit.balanceCents <= 0) continue;
      candidates.push({
        memberId: payer.paidByMemberId,
        contactId: payer.paidByContactId,
        displayName: holder.displayName,
        balanceCents: credit.balanceCents,
      });
    }
    return candidates;
  }

  /**
   * Le profil de la personne qui peut régler cette facture : le même contrôle
   * que pour tout payeur, sur ses profils membre puis contact.
   */
  private async payerProfileForCredit(
    invoice: InvoiceForPayer,
    holder: PayerCreditHolder,
  ): Promise<PayerProfile> {
    for (const memberId of holder.memberIds) {
      try {
        await this.assertPaidByMemberAllowedForInvoice(invoice, memberId);
        return { paidByMemberId: memberId, paidByContactId: null };
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
      }
    }
    for (const contactId of holder.contactIds) {
      try {
        await this.assertPaidByContactAllowedForInvoice(invoice, contactId);
        return { paidByMemberId: null, paidByContactId: contactId };
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
      }
    }
    throw new BadRequestException(
      `${holder.displayName} ne peut pas régler cette facture : elle n’est ni de son foyer, ni à son nom.`,
    );
  }

  /** Les profils liés à une facture : son foyer, son acheteur, ses membres facturés. */
  private async invoicePartyProfiles(
    invoice: InvoiceForPayer,
  ): Promise<Array<{ memberId?: string; contactId?: string }>> {
    const refs: Array<{ memberId?: string; contactId?: string }> = [];
    let groupId = invoice.householdGroupId;
    if (!groupId && invoice.familyId) {
      const family = await this.prisma.family.findFirst({
        where: { id: invoice.familyId, clubId: invoice.clubId },
        select: { householdGroupId: true },
      });
      groupId = family?.householdGroupId ?? null;
    }
    if (groupId || invoice.familyId) {
      const links = await this.prisma.familyMember.findMany({
        where: groupId
          ? { family: { householdGroupId: groupId, clubId: invoice.clubId } }
          : { familyId: invoice.familyId as string },
        select: { memberId: true, contactId: true },
      });
      for (const link of links) {
        if (link.memberId) refs.push({ memberId: link.memberId });
        if (link.contactId) refs.push({ contactId: link.contactId });
      }
    }
    const buyer = await this.shopBuyerOf(invoice);
    if (buyer?.memberId) refs.push({ memberId: buyer.memberId });
    if (buyer?.contactId) refs.push({ contactId: buyer.contactId });
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      select: { memberId: true },
    });
    for (const line of lines) refs.push({ memberId: line.memberId });
    return refs;
  }

  /** L'acheteur d'une commande boutique ou d'un échange, s'il y en a un. */
  private async shopBuyerOf(
    invoice: InvoiceForPayer,
  ): Promise<{ memberId: string | null; contactId: string | null } | null> {
    if (invoice.shopOrderId) {
      return this.prisma.shopOrder.findFirst({
        where: { id: invoice.shopOrderId, clubId: invoice.clubId },
        select: { memberId: true, contactId: true },
      });
    }
    if (invoice.shopAdjustmentId) {
      const adjustment = await this.prisma.shopOrderAdjustment.findFirst({
        where: { id: invoice.shopAdjustmentId, clubId: invoice.clubId },
        select: { order: { select: { memberId: true, contactId: true } } },
      });
      return adjustment?.order ?? null;
    }
    return null;
  }

  /**
   * Rend au crédit ce qu'un avoir rembourse sur une facture réglée par crédit
   * (ADR-0022, §3), dans la transaction de l'avoir, déjà créé. Un paiement
   * négatif PAYER_CREDIT par imputation rendue, la plus récente d'abord. Un
   * avoir qui ne fait qu'éteindre une dette ne rend rien.
   */
  private async returnPayerCreditInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    invoiceId: string,
    creditNoteCents: number,
  ): Promise<Array<{ sourcePaymentId: string; amountCents: number }>> {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, clubId },
      select: {
        amountCents: true,
        payments: {
          select: {
            id: true,
            amountCents: true,
            method: true,
            refundedPaymentId: true,
            paidByMemberId: true,
            paidByContactId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!invoice) return [];
    const creditUses = invoice.payments
      .filter((p) => p.method === ClubPaymentMethod.PAYER_CREDIT && p.amountCents > 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (creditUses.length === 0) return [];

    const creditNotes = await tx.invoice.aggregate({
      where: {
        parentInvoiceId: invoiceId,
        clubId,
        isCreditNote: true,
        status: { not: InvoiceStatus.VOID },
      },
      _sum: { amountCents: true },
    });
    const netPaidCents = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
    const stillDueCents = Math.max(
      0,
      invoice.amountCents - (creditNotes._sum.amountCents ?? 0),
    );
    // Ce que l'avoir rembourse : ce qui a été payé au-delà du dû qu'il laisse.
    let remainingCents = Math.min(
      creditNoteCents,
      Math.max(0, netPaidCents - stillDueCents),
    );

    const returned: Array<{ sourcePaymentId: string; amountCents: number }> = [];
    for (const use of creditUses) {
      if (remainingCents <= 0) break;
      const alreadyReturnedCents = invoice.payments
        .filter((p) => p.refundedPaymentId === use.id)
        .reduce((sum, p) => sum - p.amountCents, 0);
      const takeCents = Math.min(remainingCents, use.amountCents - alreadyReturnedCents);
      if (takeCents <= 0) continue;
      await tx.payment.create({
        data: {
          clubId,
          invoiceId,
          amountCents: -takeCents,
          method: ClubPaymentMethod.PAYER_CREDIT,
          refundedPaymentId: use.id,
          paidByMemberId: use.paidByMemberId,
          paidByContactId: use.paidByContactId,
        },
      });
      returned.push({ sourcePaymentId: use.id, amountCents: takeCents });
      remainingCents -= takeCents;
    }
    return returned;
  }

  /**
   * Facture sans foyer (ADR-0022, §3) : son acheteur boutique ou un membre
   * facturé sur ses lignes peut la régler.
   */
  private async isInvoicePartyMember(
    invoice: InvoiceForPayer,
    memberId: string,
  ): Promise<boolean> {
    const buyer = await this.shopBuyerOf(invoice);
    if (buyer?.memberId === memberId) return true;
    const line = await this.prisma.invoiceLine.findFirst({
      where: { invoiceId: invoice.id, memberId },
      select: { id: true },
    });
    return line !== null;
  }

  private async isInvoicePartyContact(
    invoice: InvoiceForPayer,
    contactId: string,
  ): Promise<boolean> {
    const buyer = await this.shopBuyerOf(invoice);
    return buyer?.contactId === contactId;
  }

  /**
   * Encaisse une avance sans facture (ADR-0022, §2). Un reçu d'avance naît
   * PAYÉ, avec son paiement et, pour un chèque, sa fiche en portefeuille, dans
   * UNE transaction. Il n'est jamais ouvert : aucune relance, aucun retard,
   * aucun échéancier ne peut le prendre pour une dette. L'écriture suit le
   * commit, comme pour tout encaissement.
   *
   * Pas de contrôle des documents à signer : ils conditionnent le règlement
   * d'une adhésion, pas la réception d'argent versé d'avance.
   */
  async recordPayerCreditDeposit(
    clubId: string,
    input: RecordPayerCreditDepositInput,
    userId: string | null = null,
  ) {
    if (!PAYER_CREDIT_DEPOSIT_METHODS.has(input.method)) {
      throw new BadRequestException(
        'Une avance s’encaisse en espèces, par chèque ou par virement.',
      );
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
      throw new BadRequestException('Le montant d’une avance doit être positif.');
    }
    const holder = await resolvePayerCreditHolder(this.prisma, clubId, input);
    if (input.financialAccountId) {
      const fin = await this.financialAccounts.getById(
        clubId,
        input.financialAccountId,
      );
      if (fin.kind !== ClubFinancialAccountKind.BANK || !fin.isActive) {
        throw new BadRequestException(
          'Le compte d’encaissement doit être un compte bancaire actif du club.',
        );
      }
    }

    const label = `Avance — ${holder.displayName}`;
    const ref = input.externalRef?.trim() || null;
    const chequeData =
      input.method === ClubPaymentMethod.MANUAL_CHECK
        ? await this.buildChequeData(
            clubId,
            holder.displayName,
            {
              cheque: input.cheque,
              amountCents: input.amountCents,
              paidByMemberId: holder.memberId,
              paidByContactId: holder.contactId,
            },
            ref,
            userId,
          )
        : null;

    const { invoice, payment } = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.invoice.create({
        data: {
          clubId,
          label,
          baseAmountCents: input.amountCents,
          amountCents: input.amountCents,
          status: InvoiceStatus.PAID,
          purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
          payerCreditMemberId: holder.memberId,
          payerCreditContactId: holder.contactId,
        },
      });
      const p = await tx.payment.create({
        data: {
          clubId,
          invoiceId: receipt.id,
          amountCents: input.amountCents,
          method: input.method,
          externalRef: ref,
          paidByMemberId: holder.memberId,
          paidByContactId: holder.contactId,
        },
      });
      if (chequeData) {
        await tx.cheque.create({ data: { ...chequeData, paymentId: p.id } });
      }
      return { invoice: receipt, payment: p };
    });

    await this.tryRecordIncome(
      clubId,
      payment.id,
      label,
      payment.amountCents,
      input.financialAccountId ?? null,
    );

    return { invoice, payment };
  }

  /**
   * Un reçu d'avance (ADR-0022) n'est pas une dette : on ne l'encaisse pas, on
   * ne l'annule pas, on ne lui émet pas d'avoir. Son argent est au crédit de la
   * personne.
   */
  private async assertNotPayerCreditDeposit(
    clubId: string,
    invoiceId: string,
    message: string,
  ): Promise<void> {
    const row = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      select: { purpose: true },
    });
    if (row?.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT) {
      throw new BadRequestException(message);
    }
  }

  /**
   * Fiche du chèque d'un paiement manuel. Les champs absents ont un défaut
   * raisonnable : n° = référence du paiement, émetteur = payeur connu sinon
   * libellé de facture, réception = aujourd'hui (jour du club).
   */
  private async buildChequeData(
    clubId: string,
    fallbackDrawerName: string,
    input: Pick<
      RecordManualPaymentInput,
      'cheque' | 'paidByMemberId' | 'paidByContactId' | 'amountCents'
    >,
    ref: string | null,
    userId: string | null,
  ) {
    const c = input.cheque;
    let drawerName = c?.drawerName?.trim() || '';
    if (!drawerName && input.paidByMemberId) {
      const m = await this.prisma.member.findFirst({
        where: { id: input.paidByMemberId, clubId },
        select: { firstName: true, lastName: true },
      });
      drawerName = [m?.firstName, m?.lastName].filter(Boolean).join(' ').trim();
    }
    if (!drawerName && input.paidByContactId) {
      const ct = await this.prisma.contact.findFirst({
        where: { id: input.paidByContactId, clubId },
        select: { firstName: true, lastName: true },
      });
      drawerName = [ct?.firstName, ct?.lastName].filter(Boolean).join(' ').trim();
    }
    if (!drawerName) drawerName = fallbackDrawerName;
    return {
      clubId,
      number: c?.number?.trim() || ref,
      drawerName: drawerName.slice(0, 120),
      bankName: c?.bankName?.trim() || null,
      amountCents: input.amountCents,
      receivedOn: c?.receivedOn ? parseIsoDate(c.receivedOn) : todayInClubTimezone(),
      imageAssetId: c?.imageAssetId ?? null,
      createdByUserId: userId,
    };
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

    // Remboursement confirmé par Stripe. On écoute l'événement plutôt que de
    // n'enregistrer qu'au retour de notre propre appel : un club peut aussi
    // rembourser depuis son dashboard Stripe, et le webhook est le seul point
    // de passage commun aux deux origines.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      if (!paymentIntentId || !eventAccount) return;

      const clubId =
        charge.metadata?.clubId ?? (await this.clubIdForAccount(eventAccount));
      if (!clubId) return;

      const refunds = await this.stripeRefunds.listRefundsForCharge(
        charge,
        eventAccount,
      );
      await this.stripeRefunds.applyChargeRefunds({
        clubId,
        paymentIntentId,
        stripeAccountId: eventAccount,
        // Au-delà de l'encaissement enregistré, ce que Stripe a reçu est un
        // excédent sans paiement (ENCAISSEMENT ORPHELIN PARTIEL).
        capturedCents: charge.amount_captured,
        refunds,
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

    // La banque a REFUSÉ le virement, ou Stripe l'a annulé avant exécution :
    // les fonds retournent au solde Stripe. L'écriture de virement, elle, est
    // déjà postée — il faut la défaire, sans quoi la banque affiche un
    // encaissement qu'elle n'a jamais reçu et le transit reste durablement
    // en dessous de ce que Stripe doit au club (ADR-0010).
    if (event.type === 'payout.failed' || event.type === 'payout.canceled') {
      const payout = event.data.object as Stripe.Payout;
      if (!eventAccount) return;
      const club = await this.prisma.club.findFirst({
        where: { stripeAccountId: eventAccount },
        select: { id: true },
      });
      if (!club) {
        this.logger.warn(
          `[payout] rejet du virement ${payout.id} reçu du compte ${eventAccount} — aucun club rattaché.`,
        );
        return;
      }
      await this.accounting.reverseStripePayout({
        clubId: club.id,
        payoutId: payout.id,
        reason:
          event.type === 'payout.canceled'
            ? 'annulé'
            : (payout.failure_message ??
              payout.failure_code ??
              'rejet bancaire'),
        // Le rejet est constaté MAINTENANT, pas à la date d'arrivée prévue :
        // c'est la date à laquelle l'argent est effectivement reparti.
        occurredAt: new Date(event.created * 1000),
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
      // Avance par carte (« Créditer mon compte », ADR-0022) : pas de facture,
      // le reçu naît ici.
      const topUp = readPayerCreditTopUpMetadata(pi.metadata);
      if (topUp) {
        await this.applyStripePayerCreditTopUp(
          topUp,
          pi.id,
          pi.amount_received ?? pi.amount,
          eventAccount,
        );
        return;
      }
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

  /**
   * Avance par carte encaissée (« Créditer mon compte », ADR-0022, lot 3) : le
   * reçu d'avance naît PAYÉ avec son paiement carte, dans une transaction.
   * `Invoice.stripePaymentIntentId`, unique, rend un rejeu inoffensif, même
   * concurrent. L'écriture (TRANSFER 512300 / 419100) et les frais suivent le
   * commit, comme pour tout encaissement carte.
   *
   * L'argent est déjà chez le club : ce qui ne peut pas s'enregistrer n'est pas
   * refusé mais journalisé en ENCAISSEMENT ORPHELIN, et le webhook répond sans
   * erreur. Une exception le ferait rejouer par Stripe, en boucle.
   */
  private async applyStripePayerCreditTopUp(
    topUp: { clubId: string; ref: PayerCreditHolderRef } | 'illisible',
    paymentIntentId: string,
    amountCents: number,
    stripeAccountId: string | null,
  ): Promise<void> {
    if (topUp === 'illisible') {
      this.logOrphanStripeTopUp(
        paymentIntentId,
        amountCents,
        'sans club ni personne lisibles',
      );
      return;
    }
    const { clubId, ref } = topUp;
    if (amountCents <= 0) return;

    // Garde-fou multi-tenant, plus strict que pour une facture : une avance
    // n'existe qu'en direct charge sur le compte du club (ADR-0008). Sans ce
    // contrôle, un compte connecté tiers créditerait la personne d'un autre club.
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { stripeAccountId: true },
    });
    if (!stripeAccountId || club?.stripeAccountId !== stripeAccountId) {
      this.logOrphanStripeTopUp(
        paymentIntentId,
        amountCents,
        `reçue du compte ${stripeAccountId ?? 'plateforme'}, qui n'est pas celui du club ${clubId}`,
      );
      return;
    }

    let holder: PayerCreditHolder;
    try {
      holder = await resolvePayerCreditHolder(this.prisma, clubId, ref);
    } catch (err) {
      if (
        !(err instanceof NotFoundException) &&
        !(err instanceof BadRequestException)
      ) {
        throw err;
      }
      this.logOrphanStripeTopUp(
        paymentIntentId,
        amountCents,
        `pour une personne introuvable du club ${clubId}`,
      );
      return;
    }

    const label = `Avance — ${holder.displayName}`;
    const recorded = async () =>
      this.prisma.payment.findFirst({
        where: { clubId, externalRef: paymentIntentId, amountCents: { gt: 0 } },
        select: { id: true, amountCents: true },
      });
    let payment = await recorded();
    if (!payment) {
      try {
        payment = await this.prisma.$transaction(async (tx) => {
          const receipt = await tx.invoice.create({
            data: {
              clubId,
              label,
              baseAmountCents: amountCents,
              amountCents,
              status: InvoiceStatus.PAID,
              purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
              payerCreditMemberId: holder.memberId,
              payerCreditContactId: holder.contactId,
              stripePaymentIntentId: paymentIntentId,
            },
          });
          return tx.payment.create({
            data: {
              clubId,
              invoiceId: receipt.id,
              amountCents,
              method: ClubPaymentMethod.STRIPE_CARD,
              externalRef: paymentIntentId,
              paidByMemberId: holder.memberId,
              paidByContactId: holder.contactId,
              // Compte où l'argent est tombé : on rembourse depuis celui-là.
              stripeAccountId,
            },
            select: { id: true, amountCents: true },
          });
        });
      } catch (err) {
        // Une livraison concurrente a créé le reçu de ce paymentIntent.
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
        payment = await recorded();
        if (!payment) throw err;
      }
    }

    // Un rejeu reprend ce qui suit le commit : les deux sont idempotents.
    await this.tryRecordIncome(
      clubId,
      payment.id,
      `Stripe — ${label}`,
      payment.amountCents,
    );
    await this.trySyncFees(payment.id);
  }

  private logOrphanStripeTopUp(
    paymentIntentId: string,
    amountCents: number,
    cause: string,
  ): void {
    this.logger.error(
      `[stripe] ENCAISSEMENT ORPHELIN : avance par carte ${paymentIntentId} ` +
        `(${amountCents} cts) ${cause}. Aucun reçu créé — remboursement probablement dû.`,
    );
  }

  /** Club propriétaire d'un compte connecté, pour les événements sans metadata. */
  private async clubIdForAccount(account: string | null): Promise<string | null> {
    if (!account) return null;
    const club = await this.prisma.club.findFirst({
      where: { stripeAccountId: account },
      select: { id: true },
    });
    return club?.id ?? null;
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
    // Sans filtre sur le statut : il se décide sous le verrou, plus bas. Filtrée
    // sur OPEN, cette lecture prenait le rejeu d'un paiement qui avait soldé la
    // facture pour un ENCAISSEMENT ORPHELIN, et ce qui suit le commit n'était
    // jamais retenté.
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
    });
    if (!invoice) {
      this.logOrphanStripePayment(
        paymentIntentId,
        amountCents,
        invoiceId,
        clubId,
        'introuvable',
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
    const payer = await this.stripePaymentPayer(invoice, paidByMemberId);

    // Ce qui décide de l'écriture se relit sous le verrou de la facture
    // (ADR-0022, §3), pris avant toute écriture, commande boutique comprise.
    // Une saisie, une imputation ou une annulation en cours attend ce commit ;
    // celle qui est déjà commitée se voit ici. Sans le verrou, une annulation
    // passait entre la lecture ci-dessus et l'écriture, et le paiement restait
    // sur une facture annulée.
    //
    // L'argent est déjà chez le club : ce qui ne s'enregistre plus n'est pas
    // refusé mais journalisé, et le webhook répond sans erreur. Une exception le
    // ferait rejouer par Stripe, en boucle, sur une facture qui ne changera plus.
    const settlement = await this.prisma.$transaction(async (tx) => {
      await lockInvoiceInTx(tx, invoice.id);

      // L'idempotence d'abord : une seconde livraison de ce paymentIntent,
      // arrivée pendant la première, trouve ici son paiement. Relue après le
      // statut, elle prendrait la facture que ce paiement vient de solder pour
      // un encaissement orphelin.
      const already = await tx.payment.findFirst({
        where: { invoiceId: invoice.id, externalRef: paymentIntentId },
        select: { id: true },
      });
      if (already) return { kind: 'replay', paymentId: already.id } as const;

      // Le reste dû constaté, et non l'encaissable : pour une échéance,
      // `resolveInvoiceBalance` compte encore ce paymentIntent en vol, et le
      // déduirait de lui-même.
      const current = await resolveInvoiceBalance(tx, invoice.id, clubId);
      if (current.status !== InvoiceStatus.OPEN) {
        return { kind: 'orphan', cause: "qui n'est pas OPEN" } as const;
      }
      if (current.balanceCents <= 0) {
        return { kind: 'orphan', cause: 'dont le solde est déjà nul' } as const;
      }

      // Au plus le reste dû : la facture ne se surpaie pas. Ce que la carte
      // apporte en plus vient d'une saisie, d'un avoir ou d'une imputation passés
      // pendant le paiement. Cet excédent n'a pas de paiement : il est signalé
      // après le commit (ENCAISSEMENT ORPHELIN PARTIEL).
      const amountToRecord = Math.max(
        0,
        Math.min(amountCents, current.balanceCents),
      );
      if (amountToRecord <= 0) return { kind: 'ignored' } as const;

      const payment = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents: amountToRecord,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: paymentIntentId,
          paidByMemberId: payer.paidByMemberId,
          // Compte sur lequel l'argent est réellement tombé : indispensable
          // pour rembourser sur le bon compte plus tard (ADR-0008).
          stripeAccountId,
        },
      });
      const fullyPaid = amountToRecord >= current.balanceCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          // Ne passe en PAID que si l'invoice est soldée. Sinon, reste OPEN
          // — la balance sera visible côté admin pour relance ou 2e paiement.
          ...(fullyPaid ? { status: InvoiceStatus.PAID } : {}),
          stripePaymentIntentId: paymentIntentId,
        },
      });

      // Facture d'une commande boutique soldée : la marchandise quitte le
      // placard. La sortie de stock est une GARANTIE (pas un accessoire) : elle
      // vit DANS la transaction de l'encaissement — si elle échoue, le Payment
      // n'est pas commité et Stripe rejouera proprement, plutôt que de retomber
      // sur un garde d'idempotence qui laisserait la sortie définitivement
      // perdue (cf. pitfall garantie-derriere-effet-de-bord). Le fulfill est
      // lui-même idempotent : PENDING → PAID conditionnel, aucune double sortie.
      if (fullyPaid && invoice.shopOrderId) {
        await this.shop.fulfillPaidShopOrderInTx(tx, clubId, invoice.shopOrderId);
      }
      return { kind: 'recorded', payment } as const;
    });

    if (settlement.kind === 'orphan') {
      this.logOrphanStripePayment(
        paymentIntentId,
        amountCents,
        invoiceId,
        clubId,
        settlement.cause,
      );
      return;
    }
    if (settlement.kind === 'replay') {
      // Rejeu de webhook : rien à dupliquer, mais ce qui suit le commit est à
      // reprendre. Une livraison qui a levé après son commit revient ici ; sans
      // cette reprise, son échéance attendrait le rattrapage quotidien.
      // `markInstallmentPaid` est idempotent. Les frais aussi : c'est souvent la
      // raison même du rejeu.
      if (installmentId) {
        await this.scheduleEngine.markInstallmentPaid(
          installmentId,
          settlement.paymentId,
        );
      }
      await this.trySyncFees(settlement.paymentId);
      return;
    }
    if (settlement.kind === 'ignored') return;
    const { payment } = settlement;

    // Signalé avant tout ce qui peut lever après le commit : un rejeu trouve le
    // paiement et ne redit rien.
    if (payment.amountCents < amountCents) {
      this.logPartialOrphanStripePayment(
        paymentIntentId,
        amountCents,
        payment.amountCents,
        invoiceId,
        clubId,
      );
    }
    if (payer.refusal) {
      this.logger.warn(
        `[stripe] paymentIntent ${paymentIntentId} (facture ${invoiceId}, club ${clubId}) : ` +
          `le payeur ${paidByMemberId} ne passe plus le contrôle — ${payer.refusal}. ` +
          (payer.paidByMemberId
            ? 'Paiement enregistré à son nom.'
            : 'Fiche absente du club : paiement enregistré sans payeur.'),
      );
    }

    await this.tryRecordIncome(
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
   * De l'argent encaissé par Stripe pour une facture qui n'attend plus rien :
   * introuvable, annulée, soldée, ou dont le reste dû est nul. On ne peut pas
   * l'enregistrer, mais se taire reviendrait à le faire disparaître des comptes.
   * Le trésorier doit pouvoir le retrouver et le rembourser.
   */
  private logOrphanStripePayment(
    paymentIntentId: string,
    amountCents: number,
    invoiceId: string,
    clubId: string,
    cause: string,
  ): void {
    this.logger.error(
      `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent ${paymentIntentId} ` +
        `(${amountCents} cts) reçu pour la facture ${invoiceId} du club ${clubId}, ` +
        `${cause}. Aucun Payment créé — remboursement probablement dû.`,
    );
  }

  /**
   * De l'argent encaissé par Stripe au-delà du reste dû. Le paiement enregistre
   * ce reste, la facture ne se surpayant pas ; l'excédent n'a pas de paiement.
   * Le trésorier doit le lire pour le rendre. Rendu depuis Stripe, il n'écrit ni
   * paiement négatif ni avoir (`StripeRefundsService.applyRefundConfirmed`).
   */
  private logPartialOrphanStripePayment(
    paymentIntentId: string,
    amountCents: number,
    recordedCents: number,
    invoiceId: string,
    clubId: string,
  ): void {
    this.logger.error(
      `[stripe] ENCAISSEMENT ORPHELIN PARTIEL : paymentIntent ${paymentIntentId} ` +
        `(${amountCents} cts) reçu pour la facture ${invoiceId} du club ${clubId}, ` +
        `dont le reste dû n'était que de ${recordedCents} cts. ` +
        `Payment de ${recordedCents} cts créé ; ${amountCents - recordedCents} cts ` +
        `sans Payment — remboursement de l'excédent probablement dû.`,
    );
  }

  /**
   * Le payeur qu'enregistre un encaissement carte.
   *
   * Le portail a contrôlé ce payeur à l'ouverture du paiement. Quand Stripe
   * annonce l'argent, le même contrôle peut refuser : fiche désactivée, sortie
   * du foyer ou supprimée entre-temps. L'argent est déjà chez le club, le refus
   * n'arrête donc pas l'encaissement : lever ferait rejouer Stripe en boucle,
   * sans paiement ni signalement. Le payeur reste celui qui a payé tant que sa
   * fiche existe dans le club ; sinon le paiement s'enregistre sans payeur,
   * qu'une clé étrangère refuserait. Une lecture en panne n'est pas un refus :
   * elle lève, et Stripe rejoue.
   */
  private async stripePaymentPayer(
    invoice: InvoiceForPayer,
    paidByMemberId: string | null,
  ): Promise<{ paidByMemberId: string | null; refusal: string | null }> {
    if (!paidByMemberId) return { paidByMemberId: null, refusal: null };
    try {
      await this.assertPaidByMemberAllowedForInvoice(invoice, paidByMemberId);
      return { paidByMemberId, refusal: null };
    } catch (err) {
      if (!(err instanceof BadRequestException)) throw err;
      const member = await this.prisma.member.findFirst({
        where: { id: paidByMemberId, clubId: invoice.clubId },
        select: { id: true },
      });
      return { paidByMemberId: member?.id ?? null, refusal: err.message };
    }
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
  /**
   * Écriture de recette, isolée du sort de l'encaissement.
   *
   * L'encaissement est DÉJÀ commité quand on arrive ici : l'argent est chez le
   * club et la facture est à jour. Laisser une erreur comptable remonter
   * jusqu'au webhook libérerait la réservation d'idempotence, Stripe rejouerait,
   * et le rejeu sortirait aussitôt sur le Payment déjà créé — succès apparent,
   * écriture définitivement perdue, et 500 dans les statistiques de livraison.
   * C'est exactement ce qui s'est produit sur staging.
   *
   * L'échec est journalisé en ERROR et non en WARN : une recette non
   * comptabilisée fausse le résultat du club, ça n'est pas un incident mineur.
   */
  private async tryRecordIncome(
    clubId: string,
    paymentId: string,
    label: string,
    amountCents: number,
    financialAccountId: string | null = null,
  ): Promise<void> {
    try {
      await this.accounting.recordIncomeFromPayment(
        clubId,
        paymentId,
        label,
        amountCents,
        financialAccountId,
      );
    } catch (err) {
      this.logger.error(
        `[compta] RECETTE NON COMPTABILISÉE pour le paiement ${paymentId} ` +
          `(club ${clubId}, ${amountCents} cts) — ${(err as Error).message}. ` +
          `L'encaissement est enregistré ; l'écriture est à reprendre à la main.`,
      );
    }
  }

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
}
