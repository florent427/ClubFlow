import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAccountKind,
  AccountingAuditAction,
  AccountingDocumentKind,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  Prisma,
} from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingAllocationService,
  AllocationInput,
} from './accounting-allocation.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingPeriodService } from './accounting-period.service';

/** Filtres supportés sur la query liste. */
export interface ListEntriesFilter {
  from?: Date | null;
  to?: Date | null;
  projectId?: string | null;
  cohortCode?: string | null;
  status?: AccountingEntryStatus | null;
  source?: AccountingEntrySource | null;
  accountCode?: string | null;
  limit?: number;
}

/** Input pour une création manuelle (UI formulaire). */
export interface ManualEntryInput {
  kind: AccountingEntryKind;
  label: string;
  occurredAt?: Date | null;
  accountCode: string;
  amountCents: number;
  vatRate?: number | null;
  vatAmountCents?: number | null;
  projectId?: string | null;
  cohortCode?: string | null;
  disciplineCode?: string | null;
  freeformTags?: string[];
  documentMediaAssetIds?: string[];
}

/**
 * Cœur du module comptabilité analytique : création d'écritures partie
 * double, hooks automatiques (cotisations, Stripe fees, credit notes),
 * ventilation analytique, verrouillage mensuel, audit log.
 */
@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocation: AccountingAllocationService,
    private readonly mapping: AccountingMappingService,
    private readonly period: AccountingPeriodService,
    private readonly audit: AccountingAuditService,
  ) {}

  // ========================================================================
  // Helpers
  // ========================================================================

  async isAccountingEnabled(clubId: string): Promise<boolean> {
    const row = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.ACCOUNTING },
      },
    });
    return row?.enabled === true;
  }

  /**
   * Dérive le côté débit/crédit d'une ligne à partir de la nature du
   * compte et du type d'écriture.
   *
   * Règles PCG standards :
   * - EXPENSE + compte 6xx (EXPENSE kind)     → DEBIT
   * - INCOME + compte 7xx (INCOME kind)        → CREDIT
   * - EXPENSE + compte 512/411 (ASSET)        → CREDIT (sortie trésorerie)
   * - INCOME + compte 512/411 (ASSET)         → DEBIT (entrée trésorerie)
   * - IN_KIND compte 860/864 (NEUTRAL_IN_KIND) → DEBIT (emploi)
   * - IN_KIND compte 870/875 (NEUTRAL_IN_KIND) → CREDIT (ressource)
   * Pour les cas tordus, on passe par `side: DEBIT|CREDIT` explicite.
   */
  private deriveSide(
    accountKind: AccountingAccountKind,
    entryKind: AccountingEntryKind,
    accountCode: string,
  ): AccountingLineSide {
    if (entryKind === AccountingEntryKind.INCOME) {
      if (accountKind === AccountingAccountKind.INCOME)
        return AccountingLineSide.CREDIT;
      if (accountKind === AccountingAccountKind.ASSET)
        return AccountingLineSide.DEBIT;
    } else if (entryKind === AccountingEntryKind.EXPENSE) {
      if (accountKind === AccountingAccountKind.EXPENSE)
        return AccountingLineSide.DEBIT;
      if (accountKind === AccountingAccountKind.ASSET)
        return AccountingLineSide.CREDIT;
    } else if (entryKind === AccountingEntryKind.IN_KIND) {
      // Comptes de classe 8 : 86x = emplois (débit), 87x = ressources (crédit).
      if (accountCode.startsWith('86')) return AccountingLineSide.DEBIT;
      if (accountCode.startsWith('87')) return AccountingLineSide.CREDIT;
    }
    // Par défaut : DEBIT (sera affiné par le service appelant si besoin).
    return AccountingLineSide.DEBIT;
  }

  private async lookupAccount(
    clubId: string,
    code: string,
  ): Promise<{ code: string; label: string; kind: AccountingAccountKind }> {
    const row = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
    });
    if (!row) {
      throw new NotFoundException(
        `Compte comptable ${code} introuvable. Seed ou ajout manuel nécessaire.`,
      );
    }
    return { code: row.code, label: row.label, kind: row.kind };
  }

  // ========================================================================
  // Hooks automatiques (appelés depuis PaymentsService, etc.)
  // ========================================================================

  /**
   * Nouveau hook analytique — extrait les lines + allocations depuis
   * l'Invoice du paiement. Idempotent : si une entry existe déjà pour ce
   * paymentId, ne fait rien.
   *
   * Signature rétro-compatible : les call-sites existants appellent avec
   * (clubId, paymentId, label, amountCents) pour préserver la migration
   * progressive. Les 2 derniers args sont ignorés si Invoice dispo.
   */
  async recordIncomeFromPayment(
    clubId: string,
    paymentId: string,
    legacyLabel?: string,
    legacyAmountCents?: number,
  ): Promise<void> {
    if (!(await this.isAccountingEnabled(clubId))) return;

    // Idempotence
    const existing = await this.prisma.accountingEntry.findFirst({
      where: { clubId, paymentId, source: AccountingEntrySource.AUTO_MEMBER_PAYMENT },
      select: { id: true },
    });
    if (existing) return;

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, clubId },
      include: { invoice: true },
    });
    if (!payment) {
      this.logger.warn(`Payment ${paymentId} introuvable, hook compta ignoré.`);
      return;
    }
    const invoice = payment.invoice;
    const occurredAt = payment.createdAt;
    const amountCents = payment.amountCents;

    // Résout les comptes : 512 (banque) débit + 706xxx (cotisations) crédit
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bankAccount = await this.lookupAccount(clubId, bankCode);
    const revenueCode = await this.mapping.resolveAccountCode(
      clubId,
      'MEMBERSHIP_PRODUCT',
    );
    const revenueAccount = await this.lookupAccount(clubId, revenueCode);

    // Construit les allocations depuis les InvoiceLine
    const allocations = await this.allocation.buildAllocationsForInvoice(
      clubId,
      invoice.id,
      occurredAt,
    );

    // Si le paiement est partiel, on ajuste proportionnellement les
    // allocations pour que leur somme = amountCents versé (et non le total
    // facture).
    const invoiceTotal = invoice.amountCents;
    if (invoiceTotal !== amountCents && invoiceTotal > 0) {
      const ratio = amountCents / invoiceTotal;
      let assigned = 0;
      for (let i = 0; i < allocations.length; i++) {
        if (i === allocations.length - 1) {
          allocations[i].amountCents = amountCents - assigned;
        } else {
          const v = Math.round(allocations[i].amountCents * ratio);
          allocations[i].amountCents = v;
          assigned += v;
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.INCOME,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.AUTO_MEMBER_PAYMENT,
          label:
            legacyLabel ??
            `Encaissement ${invoice.label}`,
          amountCents,
          paymentId,
          occurredAt,
        },
      });

      // Ligne 1 : débit banque (contrepartie trésorerie)
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: bankAccount.code,
          accountLabel: bankAccount.label,
          side: AccountingLineSide.DEBIT,
          debitCents: amountCents,
          creditCents: 0,
          sortOrder: 0,
        },
      });

      // Ligne 2 : crédit revenus (706100 cotisations par défaut)
      const revenueLine = await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: revenueAccount.code,
          accountLabel: revenueAccount.label,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: amountCents,
          sortOrder: 1,
        },
      });

      // Persiste les allocations sur la ligne revenus (c'est elle qui
      // porte la sémantique analytique).
      await this.allocation.persistAllocationsForLine(
        tx,
        revenueLine.id,
        clubId,
        allocations,
      );
    });

    // Log silencieux, userId inconnu (système)
    await this.audit.log({
      clubId,
      userId: 'system',
      action: AccountingAuditAction.CREATE,
      metadata: {
        source: 'AUTO_MEMBER_PAYMENT',
        paymentId,
        invoiceId: invoice.id,
      },
    });
    void legacyAmountCents; // argument legacy ignoré
  }

  /**
   * Hook contre-passation automatique sur credit note. Crée une écriture
   * inverse (source=AUTO_REFUND) liée via `contraEntryId` à l'entry
   * originale (si trouvée).
   */
  async createContraEntryForCreditNote(
    clubId: string,
    creditNoteInvoiceId: string,
  ): Promise<void> {
    if (!(await this.isAccountingEnabled(clubId))) return;

    const creditNote = await this.prisma.invoice.findFirst({
      where: { id: creditNoteInvoiceId, clubId, isCreditNote: true },
    });
    if (!creditNote || !creditNote.parentInvoiceId) return;

    // Trouve l'entry originale (liée au premier paiement de la facture parente)
    const originalEntry = await this.prisma.accountingEntry.findFirst({
      where: {
        clubId,
        payment: { invoiceId: creditNote.parentInvoiceId },
        source: AccountingEntrySource.AUTO_MEMBER_PAYMENT,
        cancelledAt: null,
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });

    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bankAccount = await this.lookupAccount(clubId, bankCode);
    const revenueCode = await this.mapping.resolveAccountCode(
      clubId,
      'MEMBERSHIP_PRODUCT',
    );
    const revenueAccount = await this.lookupAccount(clubId, revenueCode);

    const amountCents = creditNote.amountCents;

    await this.prisma.$transaction(async (tx) => {
      const contra = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.AUTO_REFUND,
          label: `Avoir — ${creditNote.label}`,
          amountCents,
          contraEntryId: originalEntry?.id ?? null,
          occurredAt: creditNote.createdAt,
        },
      });

      // Ligne 1 : débit revenus (annule la recette)
      await tx.accountingEntryLine.create({
        data: {
          entryId: contra.id,
          clubId,
          accountCode: revenueAccount.code,
          accountLabel: revenueAccount.label,
          side: AccountingLineSide.DEBIT,
          debitCents: amountCents,
          creditCents: 0,
          sortOrder: 0,
        },
      });
      // Ligne 2 : crédit banque (sortie trésorerie)
      await tx.accountingEntryLine.create({
        data: {
          entryId: contra.id,
          clubId,
          accountCode: bankAccount.code,
          accountLabel: bankAccount.label,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: amountCents,
          sortOrder: 1,
        },
      });

      // Marque l'entry originale comme cancelledAt si elle existe
      if (originalEntry) {
        await tx.accountingEntry.update({
          where: { id: originalEntry.id },
          data: {
            cancelledAt: new Date(),
            status: AccountingEntryStatus.CANCELLED,
          },
        });
      }
    });

    await this.audit.log({
      clubId,
      userId: 'system',
      action: AccountingAuditAction.CONTRAPASS,
      entryId: originalEntry?.id ?? null,
      metadata: {
        source: 'AUTO_REFUND',
        creditNoteInvoiceId,
        parentInvoiceId: creditNote.parentInvoiceId,
      },
    });
  }

  /**
   * Hook split frais Stripe. À appeler en complément de
   * `recordIncomeFromPayment` quand on a les données frais dispo.
   */
  async recordStripeFeesFromPayment(
    clubId: string,
    paymentId: string,
    feeAmountCents: number,
  ): Promise<void> {
    if (!(await this.isAccountingEnabled(clubId))) return;
    if (feeAmountCents <= 0) return;

    // Idempotence
    const existing = await this.prisma.accountingEntry.findFirst({
      where: { clubId, paymentId, source: AccountingEntrySource.AUTO_STRIPE_FEES },
    });
    if (existing) return;

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, clubId },
    });
    if (!payment) return;

    const feeCode = await this.mapping.resolveAccountCode(clubId, 'STRIPE_FEE');
    const feeAccount = await this.lookupAccount(clubId, feeCode);
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bankAccount = await this.lookupAccount(clubId, bankCode);

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.AUTO_STRIPE_FEES,
          label: `Frais Stripe — ${payment.externalRef ?? paymentId}`,
          amountCents: feeAmountCents,
          paymentId,
          occurredAt: payment.createdAt,
        },
      });
      // Débit 627 (frais bancaires)
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: feeAccount.code,
          accountLabel: feeAccount.label,
          side: AccountingLineSide.DEBIT,
          debitCents: feeAmountCents,
          creditCents: 0,
          sortOrder: 0,
        },
      });
      // Crédit 512 (banque, les frais sortent de la trésorerie)
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: bankAccount.code,
          accountLabel: bankAccount.label,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: feeAmountCents,
          sortOrder: 1,
        },
      });
    });
  }

  // ========================================================================
  // Saisie manuelle
  // ========================================================================

  /**
   * Crée une écriture manuelle simple (1 compte + 1 contrepartie bank).
   * Utilisé pour la saisie directe au formulaire (sans OCR).
   */
  async createManualEntry(
    clubId: string,
    userId: string,
    input: ManualEntryInput,
  ) {
    const occurredAt = input.occurredAt ?? new Date();
    await this.period.assertDateIsOpen(clubId, occurredAt);

    const account = await this.lookupAccount(clubId, input.accountCode);
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bankAccount = await this.lookupAccount(clubId, bankCode);

    const side = this.deriveSide(account.kind, input.kind, account.code);

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: input.kind,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.MANUAL,
          label: input.label,
          amountCents: input.amountCents,
          vatTotalCents: input.vatAmountCents ?? null,
          occurredAt,
          createdByUserId: userId,
        },
      });

      // Ligne "compte principal" (6xx ou 7xx selon kind)
      const mainLine = await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: account.code,
          accountLabel: account.label,
          side,
          debitCents: side === AccountingLineSide.DEBIT ? input.amountCents : 0,
          creditCents:
            side === AccountingLineSide.CREDIT ? input.amountCents : 0,
          vatRate: input.vatRate
            ? new Prisma.Decimal(input.vatRate.toString())
            : null,
          vatAmountCents: input.vatAmountCents ?? null,
          sortOrder: 0,
        },
      });

      // Ligne contrepartie : banque avec côté inverse
      const counterSide =
        side === AccountingLineSide.DEBIT
          ? AccountingLineSide.CREDIT
          : AccountingLineSide.DEBIT;
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: bankAccount.code,
          accountLabel: bankAccount.label,
          side: counterSide,
          debitCents:
            counterSide === AccountingLineSide.DEBIT ? input.amountCents : 0,
          creditCents:
            counterSide === AccountingLineSide.CREDIT ? input.amountCents : 0,
          sortOrder: 1,
        },
      });

      // 1 allocation par ligne principale (portant les dimensions analytiques)
      await this.allocation.persistAllocationsForLine(tx, mainLine.id, clubId, [
        {
          amountCents: input.amountCents,
          projectId: input.projectId ?? null,
          cohortCode: input.cohortCode ?? null,
          disciplineCode: input.disciplineCode ?? null,
          freeformTags: input.freeformTags ?? [],
        },
      ]);

      // Documents attachés (si fournis)
      if (input.documentMediaAssetIds?.length) {
        for (const assetId of input.documentMediaAssetIds) {
          await tx.accountingDocument.create({
            data: {
              clubId,
              entryId: entry.id,
              mediaAssetId: assetId,
              kind: AccountingDocumentKind.RECEIPT,
            },
          });
        }
      }

      return entry;
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: created.id,
      action: AccountingAuditAction.CREATE,
      metadata: { source: 'MANUAL', input: JSON.parse(JSON.stringify(input)) },
    });

    return created;
  }

  /**
   * Finalise une entry après OCR : l'entry existe déjà en statut
   * NEEDS_REVIEW (créée par ReceiptOcrService), on applique les
   * corrections utilisateur + on passe en POSTED.
   */
  async confirmExtraction(
    clubId: string,
    userId: string,
    entryId: string,
    corrections: Partial<ManualEntryInput>,
  ) {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId, status: AccountingEntryStatus.NEEDS_REVIEW },
    });
    if (!entry) {
      throw new NotFoundException(
        'Écriture à valider introuvable ou déjà validée.',
      );
    }
    const occurredAt = corrections.occurredAt ?? entry.occurredAt;
    await this.period.assertDateIsOpen(clubId, occurredAt);

    const updated = await this.prisma.accountingEntry.update({
      where: { id: entryId },
      data: {
        status: AccountingEntryStatus.POSTED,
        ...(corrections.label !== undefined && { label: corrections.label }),
        ...(corrections.amountCents !== undefined && {
          amountCents: corrections.amountCents,
        }),
        ...(corrections.occurredAt
          ? { occurredAt: corrections.occurredAt }
          : {}),
        updatedAt: new Date(),
      },
    });

    await this.audit.log({
      clubId,
      userId,
      entryId,
      action: AccountingAuditAction.UPDATE,
      metadata: { source: 'OCR_CONFIRM', corrections },
    });

    return updated;
  }

  /**
   * Annulation douce (soft cancel) — l'entry reste en base (rétention 10
   * ans obligatoire) mais passe en status=CANCELLED. Interdit si LOCKED.
   */
  async cancelEntry(
    clubId: string,
    userId: string,
    entryId: string,
    reason: string,
  ) {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    if (entry.status === AccountingEntryStatus.LOCKED) {
      throw new ForbiddenException(
        'Écriture verrouillée (période clôturée) — crée une contre-passation datée d\u2019un mois ouvert.',
      );
    }
    const updated = await this.prisma.accountingEntry.update({
      where: { id: entryId },
      data: {
        status: AccountingEntryStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: userId,
      },
    });
    await this.audit.log({
      clubId,
      userId,
      entryId,
      action: AccountingAuditAction.CANCEL,
      metadata: { reason },
    });
    return updated;
  }

  /**
   * Crée une contre-passation manuelle (inversion des lignes) datée
   * d'aujourd'hui. L'entry source doit être POSTED ou LOCKED.
   */
  async createContraEntry(
    clubId: string,
    userId: string,
    entryId: string,
    reason: string,
  ) {
    const source = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
      include: { lines: true },
    });
    if (!source) throw new NotFoundException('Écriture introuvable');
    if (source.contraEntryId) {
      throw new BadRequestException(
        'Cette écriture a déjà été contre-passée.',
      );
    }
    const now = new Date();
    await this.period.assertDateIsOpen(clubId, now);

    const contra = await this.prisma.$transaction(async (tx) => {
      const c = await tx.accountingEntry.create({
        data: {
          clubId,
          kind:
            source.kind === AccountingEntryKind.INCOME
              ? AccountingEntryKind.EXPENSE
              : AccountingEntryKind.INCOME,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.AUTO_REFUND,
          label: `Contre-passation — ${source.label}`,
          amountCents: source.amountCents,
          contraEntryId: source.id,
          occurredAt: now,
          createdByUserId: userId,
        },
      });
      // Inverse les lignes
      for (const line of source.lines) {
        const inverseSide =
          line.side === AccountingLineSide.DEBIT
            ? AccountingLineSide.CREDIT
            : AccountingLineSide.DEBIT;
        await tx.accountingEntryLine.create({
          data: {
            entryId: c.id,
            clubId,
            accountCode: line.accountCode,
            accountLabel: line.accountLabel,
            side: inverseSide,
            debitCents: line.creditCents,
            creditCents: line.debitCents,
            sortOrder: line.sortOrder,
          },
        });
      }
      // Marque la source comme contre-passée
      await tx.accountingEntry.update({
        where: { id: source.id },
        data: {
          contraEntryId: c.id,
          status: AccountingEntryStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: userId,
        },
      });
      return c;
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: source.id,
      action: AccountingAuditAction.CONTRAPASS,
      metadata: { reason, contraEntryId: contra.id },
    });

    return contra;
  }

  // ========================================================================
  // Documents
  // ========================================================================

  async attachDocument(
    clubId: string,
    userId: string,
    entryId: string,
    mediaAssetId: string,
    kind: AccountingDocumentKind = AccountingDocumentKind.RECEIPT,
  ) {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    return this.prisma.accountingDocument.upsert({
      where: { entryId_mediaAssetId: { entryId, mediaAssetId } },
      create: { clubId, entryId, mediaAssetId, kind },
      update: { kind },
    });
  }

  async detachDocument(
    clubId: string,
    userId: string,
    documentId: string,
  ): Promise<boolean> {
    const doc = await this.prisma.accountingDocument.findFirst({
      where: { id: documentId, clubId },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.accountingDocument.delete({ where: { id: documentId } });
    return true;
  }

  // ========================================================================
  // Queries
  // ========================================================================

  async listEntries(clubId: string, filter: ListEntriesFilter = {}) {
    const where: Prisma.AccountingEntryWhereInput = { clubId };
    if (filter.from || filter.to) {
      where.occurredAt = {};
      if (filter.from) where.occurredAt.gte = filter.from;
      if (filter.to) where.occurredAt.lt = filter.to;
    }
    if (filter.status) where.status = filter.status;
    if (filter.source) where.source = filter.source;
    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.cohortCode || filter.accountCode) {
      where.lines = {
        some: {
          ...(filter.accountCode && { accountCode: filter.accountCode }),
          ...(filter.cohortCode && {
            allocations: { some: { cohortCode: filter.cohortCode } },
          }),
        },
      };
    }
    return this.prisma.accountingEntry.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: filter.limit ?? 200,
      include: {
        lines: {
          include: {
            allocations: {
              include: { project: { select: { id: true, title: true } } },
            },
          },
        },
        documents: { include: { mediaAsset: true } },
      },
    });
  }

  async getEntry(clubId: string, entryId: string) {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
      include: {
        lines: {
          include: {
            allocations: {
              include: {
                project: { select: { id: true, title: true } },
                member: { select: { id: true, firstName: true, lastName: true } },
                groupTags: true,
              },
            },
          },
        },
        documents: { include: { mediaAsset: true } },
        extraction: true,
      },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    return entry;
  }

  async listReviewQueue(clubId: string) {
    return this.prisma.accountingEntry.findMany({
      where: { clubId, status: AccountingEntryStatus.NEEDS_REVIEW },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { include: { mediaAsset: true } },
        extraction: true,
      },
    });
  }

  /**
   * Résumé P&L simplifié (revenus, dépenses, balance) sur une période.
   * Ne prend en compte que les entries POSTED (ignore DRAFT / NEEDS_REVIEW
   * / CANCELLED).
   */
  async summary(
    clubId: string,
    range?: { from?: Date | null; to?: Date | null },
  ) {
    const where: Prisma.AccountingEntryWhereInput = {
      clubId,
      status: AccountingEntryStatus.POSTED,
    };
    if (range?.from || range?.to) {
      where.occurredAt = {};
      if (range.from) where.occurredAt.gte = range.from;
      if (range.to) where.occurredAt.lt = range.to;
    }
    const rows = await this.prisma.accountingEntry.findMany({
      where,
      select: { kind: true, amountCents: true },
    });
    let income = 0;
    let expense = 0;
    let inKind = 0;
    for (const r of rows) {
      if (r.kind === AccountingEntryKind.INCOME) income += r.amountCents;
      else if (r.kind === AccountingEntryKind.EXPENSE) expense += r.amountCents;
      else if (r.kind === AccountingEntryKind.IN_KIND) inKind += r.amountCents;
    }
    return {
      incomeCents: income,
      expenseCents: expense,
      balanceCents: income - expense,
      inKindCents: inKind,
      needsReviewCount: await this.prisma.accountingEntry.count({
        where: { clubId, status: AccountingEntryStatus.NEEDS_REVIEW },
      }),
    };
  }

  // ========================================================================
  // Legacy compat (appelée par accounting.resolver.ts actuel)
  // ========================================================================

  /**
   * @deprecated Utiliser `cancelEntry` (soft cancel) à la place.
   * Conservé pour compat UI ancienne — ne supprime plus vraiment.
   */
  async deleteEntry(clubId: string, id: string) {
    return this.cancelEntry(clubId, 'system', id, 'delete-legacy');
  }
}
