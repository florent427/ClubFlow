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
import { AccountingSeedService } from './accounting-seed.service';
import { AccountingSuggestionService } from './accounting-suggestion.service';
import { ClubFinancialAccountsService } from './club-financial-accounts.service';

/** Filtres supportés sur la query liste. */
export interface ListEntriesFilter {
  from?: Date | null;
  to?: Date | null;
  projectId?: string | null;
  cohortCode?: string | null;
  status?: AccountingEntryStatus | null;
  source?: AccountingEntrySource | null;
  accountCode?: string | null;
  /** Filtre par compte financier (banque/caisse/transit) — multi-banques. */
  financialAccountId?: string | null;
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
  /**
   * Compte financier de contrepartie (banque/caisse/transit). Si null,
   * utilise le compte BANK par défaut du club. Permet de choisir
   * "encaissé sur Caisse buvette" plutôt que "Banque principale".
   */
  financialAccountId?: string | null;
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
    private readonly suggestion: AccountingSuggestionService,
    private readonly seed: AccountingSeedService,
    private readonly financialAccounts: ClubFinancialAccountsService,
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

  /**
   * Helper de résolution de la contrepartie pour les saisies manuelles
   * (createManualEntry, createQuickEntry).
   *  - Si `financialAccountId` fourni → vérifie qu'il existe et est actif
   *    pour ce club, le retourne.
   *  - Sinon → fallback sur le BANK par défaut du club via le service
   *    multi-comptes.
   */
  private async resolveFinancialAccountForManual(
    clubId: string,
    financialAccountId: string | null,
  ) {
    if (financialAccountId) {
      const fin = await this.prisma.clubFinancialAccount.findFirst({
        where: { clubId, id: financialAccountId, isActive: true },
        include: { accountingAccount: true },
      });
      if (!fin) {
        throw new BadRequestException(
          `Compte financier ${financialAccountId} introuvable ou inactif.`,
        );
      }
      return fin;
    }
    // Fallback : utilise le routage default du service. On simule
    // STRIPE_CARD pour passer par STRIPE_TRANSIT en priorité, puis BANK.
    // Pour la saisie manuelle, on préfère BANK direct.
    const def = await this.financialAccounts.getDefault(clubId, 'BANK');
    if (def) return def;
    // Si pas de BANK default, on prend la première active.
    const any = await this.prisma.clubFinancialAccount.findFirst({
      where: { clubId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      include: { accountingAccount: true },
    });
    if (!any) {
      throw new BadRequestException(
        'Aucun compte financier configuré. ' +
          'Va dans Paramètres → Comptabilité → Comptes bancaires & caisses.',
      );
    }
    return any;
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

    // Résout les comptes : la contrepartie débit (banque/caisse/transit)
    // est désormais routée selon `payment.method` via le service multi-
    // comptes financiers (CASH → caisse, STRIPE_CARD → transit Stripe,
    // virement/chèque → banque). Fallback automatique sur la banque par
    // défaut si pas de route configurée.
    const fin = await this.financialAccounts.resolveForPayment(
      clubId,
      payment.method,
    );
    const bankAccount = await this.lookupAccount(
      clubId,
      fin.accountingAccount.code,
    );
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
          // Trace le compte financier réel pour le rapprochement bancaire
          // et l'affichage UI ("encaissé sur Caisse buvette").
          financialAccountId: fin.id,
        },
      });

      // Idempotence : on persiste aussi le financialAccountId sur le Payment
      // si pas encore rempli (cas paiements créés avant la migration).
      if (!payment.financialAccountId) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { financialAccountId: fin.id },
        });
      }

      // Ligne 1 : débit contrepartie trésorerie (banque/caisse/transit)
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
    // Important : les frais Stripe sortent du compte STRIPE_TRANSIT
    // (compte sur lequel l'argent encaissé est tombé), pas de la banque
    // physique finale. Le routage va donc préférer le compte Stripe si
    // configuré, sinon fallback BANK.
    const fin = await this.financialAccounts.resolveForPayment(
      clubId,
      payment.method,
    );
    const bankAccount = await this.lookupAccount(
      clubId,
      fin.accountingAccount.code,
    );

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
          financialAccountId: fin.id,
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
    // Résolution de la contrepartie : explicite (input.financialAccountId)
    // ou défaut BANK du club via fallback.
    const fin = await this.resolveFinancialAccountForManual(
      clubId,
      input.financialAccountId ?? null,
    );
    const bankAccount = await this.lookupAccount(
      clubId,
      fin.accountingAccount.code,
    );

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
          financialAccountId: fin.id,
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
   * Création "rapide" d'une écriture avec catégorisation IA en arrière-plan.
   *
   * Mode 1 (simple) : `articles` vide ou non fourni → 1 ligne débit
   * unique avec le libellé global + contrepartie banque. L'IA catégorise
   * cette ligne en background.
   *
   * Mode 2 (facture multi-lignes) : `articles[]` avec N items → N lignes
   * débit (une par article, chacune catégorisée séparément par l'IA en
   * background) + 1 contrepartie banque crédit totalisant la facture.
   *
   * Cas typique mode 2 : facture Dell
   *   - Ordinateur 1200€ → ligne 1, compte IA = 218300 (immobilisation)
   *   - Souris 30€ → ligne 2, compte IA = 606400 (charge)
   *   - Contrepartie banque 1230€ crédit
   */
  async createQuickEntry(
    clubId: string,
    userId: string,
    input: Omit<ManualEntryInput, 'accountCode'> & {
      kind: AccountingEntryKind;
      articles?: Array<{
        label: string;
        amountCents: number;
        accountCode?: string | null;
        /** Override analytique par article (facture mixte) */
        projectId?: string | null;
        cohortCode?: string | null;
        disciplineCode?: string | null;
      }>;
    },
  ): Promise<{ id: string; pendingCategorization: boolean }> {
    const occurredAt = input.occurredAt ?? new Date();
    await this.period.assertDateIsOpen(clubId, occurredAt);

    // Top-up du plan comptable avant toute création d'écriture : garantit
    // que tous les comptes (y compris les immobilisations classe 2 et
    // les comptes ajoutés dans des versions ultérieures) existent en DB
    // pour ce club. Sans ça, l'IA catégorisant en background pourrait
    // proposer un compte qui n'existe pas encore et échouer silencieusement.
    await this.seed.seedIfEmpty(clubId);

    // Normalise les articles. Si vide, crée un article unique depuis
    // le libellé principal.
    const articles =
      input.articles && input.articles.length > 0
        ? input.articles
        : [{ label: input.label, amountCents: input.amountCents, accountCode: null }];

    // Vérifie cohérence montant total vs somme articles (mode multi-ligne
    // doit être cohérent).
    const sumArticles = articles.reduce((s, a) => s + a.amountCents, 0);
    if (input.articles && input.articles.length > 0 && sumArticles !== input.amountCents) {
      throw new BadRequestException(
        `Total écriture (${input.amountCents / 100}€) ne correspond pas à la somme des articles (${sumArticles / 100}€).`,
      );
    }

    // Compte fallback selon kind (sera remplacé par l'IA en background
    // si l'article n'a pas de compte imposé).
    const fallbackCode =
      input.kind === AccountingEntryKind.INCOME
        ? await this.mapping.resolveAccountCode(clubId, 'INCOME_GENERIC')
        : input.kind === AccountingEntryKind.IN_KIND
          ? '871000'
          : await this.mapping.resolveAccountCode(clubId, 'EXPENSE_GENERIC');

    // Résolution de la contrepartie : explicite via input.financialAccountId
    // (l'utilisateur a choisi "encaissé sur Caisse buvette") OU défaut BANK
    // du club (rétrocompat).
    const fin = await this.resolveFinancialAccountForManual(
      clubId,
      input.financialAccountId ?? null,
    );
    const bankAccount = await this.lookupAccount(
      clubId,
      fin.accountingAccount.code,
    );

    // Pour chaque article : résout le compte (soit fourni par user, soit
    // fallback en attente d'IA), calcule le côté débit/crédit, et
    // résout la ventilation analytique (override par article → défaut entry).
    interface PreparedLine {
      articleLabel: string;
      amountCents: number;
      accountCode: string;
      accountLabel: string;
      side: AccountingLineSide;
      userChoseAccount: boolean; // true = ne pas override avec IA
      // Analytique effective pour cette ligne (override article > défaut entry)
      projectId: string | null;
      cohortCode: string | null;
      disciplineCode: string | null;
    }

    const preparedLines: PreparedLine[] = [];
    for (const art of articles) {
      const code = art.accountCode?.trim() || fallbackCode;
      const account = await this.lookupAccount(clubId, code);
      const side = this.deriveSide(account.kind, input.kind, account.code);
      preparedLines.push({
        articleLabel: art.label,
        amountCents: art.amountCents,
        accountCode: account.code,
        accountLabel: account.label,
        side,
        userChoseAccount: Boolean(art.accountCode),
        // Override par article SINON fallback sur la valeur globale de
        // l'écriture. Cas d'usage : facture Budo avec Tatamis → projet
        // "Coupe SKSR" et Sifflet → Fonctionnement général.
        projectId: art.projectId ?? input.projectId ?? null,
        cohortCode: art.cohortCode ?? input.cohortCode ?? null,
        disciplineCode: art.disciplineCode ?? input.disciplineCode ?? null,
      });
    }

    // Côté contrepartie banque : inverse du côté majoritaire des articles.
    // Dans une facture classique, les articles sont tous DEBIT (EXPENSE) →
    // contrepartie CREDIT banque.
    const firstSide = preparedLines[0]?.side ?? AccountingLineSide.DEBIT;
    const counterSide =
      firstSide === AccountingLineSide.DEBIT
        ? AccountingLineSide.CREDIT
        : AccountingLineSide.DEBIT;

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: input.kind,
          status: AccountingEntryStatus.NEEDS_REVIEW,
          source: AccountingEntrySource.MANUAL,
          label: input.label,
          amountCents: input.amountCents,
          vatTotalCents: input.vatAmountCents ?? null,
          occurredAt,
          createdByUserId: userId,
          financialAccountId: fin.id,
        },
      });

      const createdLineIds: Array<{
        lineId: string;
        article: PreparedLine;
      }> = [];

      // 1 ligne par article
      for (let i = 0; i < preparedLines.length; i++) {
        const p = preparedLines[i];
        const line = await tx.accountingEntryLine.create({
          data: {
            entryId: entry.id,
            clubId,
            accountCode: p.accountCode,
            accountLabel: p.accountLabel,
            label: p.articleLabel,
            side: p.side,
            debitCents: p.side === AccountingLineSide.DEBIT ? p.amountCents : 0,
            creditCents:
              p.side === AccountingLineSide.CREDIT ? p.amountCents : 0,
            sortOrder: i,
            // Si compte choisi par l'user → marqué comme validé direct
            // (pas besoin de revue IA). Sinon → en attente.
            ...(p.userChoseAccount
              ? { validatedAt: new Date(), validatedByUserId: userId }
              : {}),
          },
        });
        createdLineIds.push({ lineId: line.id, article: p });

        // Allocation analytique par ligne — utilise `p.projectId` /
        // `p.cohortCode` / `p.disciplineCode` déjà résolus (override
        // article ou défaut entry). Les freeformTags restent globaux.
        await this.allocation.persistAllocationsForLine(
          tx,
          line.id,
          clubId,
          [
            {
              amountCents: p.amountCents,
              projectId: p.projectId,
              cohortCode: p.cohortCode,
              disciplineCode: p.disciplineCode,
              freeformTags: input.freeformTags ?? [],
            },
          ],
        );
      }

      // Ligne contrepartie banque (total facture) — auto-validée car
      // c'est la contrepartie, pas une ligne "article" à catégoriser.
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
          sortOrder: preparedLines.length,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });

      if (input.documentMediaAssetIds?.length) {
        for (const assetId of input.documentMediaAssetIds) {
          await tx.accountingDocument.create({
            data: {
              clubId,
              entryId: entry.id,
              mediaAssetId: assetId,
              kind: 'RECEIPT',
            },
          });
        }
      }

      return { entry, lines: createdLineIds };
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: created.entry.id,
      action: AccountingAuditAction.CREATE,
      metadata: {
        source: 'QUICK_ENTRY',
        pendingCategorization: true,
        articlesCount: preparedLines.length,
      },
    });

    // Lance la catégorisation IA par ligne en arrière-plan pour les
    // articles où l'utilisateur n'a pas imposé un compte.
    const linesNeedingAi = created.lines.filter(
      (l) => !l.article.userChoseAccount,
    );
    if (linesNeedingAi.length > 0) {
      setImmediate(() => {
        void this.runBackgroundCategorizationPerLine(
          clubId,
          created.entry.id,
          input.kind,
          linesNeedingAi.map((l) => ({
            lineId: l.lineId,
            articleLabel: l.article.articleLabel,
            amountCents: l.article.amountCents,
          })),
        );
      });
    }

    return { id: created.entry.id, pendingCategorization: linesNeedingAi.length > 0 };
  }

  /**
   * Job async : catégorise CHAQUE ligne article séparément via l'IA.
   * Important pour les factures multi-lignes où chaque article peut
   * basculer entre charge (606xxx) et immobilisation (218xxx) selon son
   * montant et sa nature.
   */
  private async runBackgroundCategorizationPerLine(
    clubId: string,
    entryId: string,
    kind: AccountingEntryKind,
    articles: Array<{
      lineId: string;
      articleLabel: string;
      amountCents: number;
    }>,
  ): Promise<void> {
    const kindArg =
      kind === AccountingEntryKind.INCOME
        ? 'INCOME'
        : kind === AccountingEntryKind.IN_KIND
          ? 'IN_KIND'
          : 'EXPENSE';

    this.logger.log(
      `[Entry ${entryId}] Catégorisation IA démarrage : ${articles.length} article(s) — kind=${kindArg}`,
    );

    for (const art of articles) {
      try {
        this.logger.log(
          `[Entry ${entryId}] 🤖 Article "${art.articleLabel}" (${(art.amountCents / 100).toFixed(2)}€, line=${art.lineId}) — appel IA…`,
        );
        const suggestion = await this.suggestion.suggest(clubId, {
          label: art.articleLabel,
          amountCents: art.amountCents,
          kind: kindArg,
        });

        if (!suggestion.accountCode) {
          this.logger.warn(
            `[Entry ${entryId}] ⚠️ Article "${art.articleLabel}" : IA sans accountCode — ${suggestion.errorMessage ?? 'no account'}`,
          );
          continue;
        }

        const newAccount = await this.lookupAccount(
          clubId,
          suggestion.accountCode,
        );
        const newSide = this.deriveSide(newAccount.kind, kind, newAccount.code);

        const updateResult = await this.prisma.$transaction(async (tx) => {
          const entry = await tx.accountingEntry.findUnique({
            where: { id: entryId },
            select: { status: true },
          });
          if (!entry) return { status: 'entry-missing' as const };
          if (entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
            return { status: `status-${entry.status}` as const };
          }
          const confPct = Math.round(
            (suggestion.confidencePerField.accountCode ?? 0) * 100,
          );
          const updated = await tx.accountingEntryLine.update({
            where: { id: art.lineId },
            data: {
              accountCode: newAccount.code,
              accountLabel: newAccount.label,
              // Label propre (juste le nom de l'article) — reasoning
              // stocké dans iaReasoning pour affichage dédié UI.
              label: art.articleLabel,
              side: newSide,
              debitCents:
                newSide === AccountingLineSide.DEBIT ? art.amountCents : 0,
              creditCents:
                newSide === AccountingLineSide.CREDIT ? art.amountCents : 0,
              iaSuggestedAccountCode: newAccount.code,
              iaReasoning: suggestion.reasoning?.slice(0, 500) ?? null,
              iaConfidencePct: confPct,
            },
          });
          return { status: 'ok' as const, lineId: updated.id };
        });

        if (updateResult.status === 'ok') {
          this.logger.log(
            `[Entry ${entryId}] ✅ Article "${art.articleLabel}" → ${newAccount.code} "${newAccount.label}" (${Math.round((suggestion.confidencePerField.accountCode ?? 0) * 100)}%) — ${suggestion.reasoning?.slice(0, 100) ?? ''}`,
          );
        } else {
          this.logger.warn(
            `[Entry ${entryId}] ⚠️ Article "${art.articleLabel}" : update skippé (raison=${updateResult.status})`,
          );
        }
      } catch (err) {
        this.logger.error(
          `[Entry ${entryId}] ❌ Article "${art.articleLabel}" exception : ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(
      `[Entry ${entryId}] Catégorisation IA terminée`,
    );
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
      include: {
        lines: {
          include: { allocations: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!entry) {
      throw new NotFoundException(
        'Écriture à valider introuvable ou déjà validée.',
      );
    }
    const occurredAt = corrections.occurredAt ?? entry.occurredAt;
    await this.period.assertDateIsOpen(clubId, occurredAt);

    const newAmount = corrections.amountCents ?? entry.amountCents;
    const needsAccountChange =
      corrections.accountCode && entry.lines.length > 0
        ? corrections.accountCode !== entry.lines[0].accountCode
        : false;

    // Récupère le nouveau compte + le compte banque (pour contrepartie)
    let newAccount: {
      code: string;
      label: string;
      kind: AccountingAccountKind;
    } | null = null;
    if (needsAccountChange && corrections.accountCode) {
      newAccount = await this.lookupAccount(clubId, corrections.accountCode);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Update entry header
      const e = await tx.accountingEntry.update({
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

      // 2. Update les lignes (montant + éventuellement compte)
      for (const line of entry.lines) {
        const isExpenseSide = line.debitCents > 0 && line.creditCents === 0;
        const isIncomeSide = line.creditCents > 0 && line.debitCents === 0;
        const dataLine: Record<string, unknown> = {};
        if (corrections.amountCents !== undefined) {
          if (isExpenseSide) dataLine.debitCents = newAmount;
          if (isIncomeSide) dataLine.creditCents = newAmount;
        }
        // Change le compte uniquement sur la ligne "principale" (la non-banque)
        const isBankLine =
          line.accountCode === '512000' || line.accountCode === '530000';
        if (newAccount && !isBankLine) {
          dataLine.accountCode = newAccount.code;
          dataLine.accountLabel = newAccount.label;
        }
        if (Object.keys(dataLine).length > 0) {
          await tx.accountingEntryLine.update({
            where: { id: line.id },
            data: dataLine,
          });
        }
      }

      // 3. Update allocations (cohorte + discipline + projet + montant)
      //    On met à jour uniquement la première allocation de la ligne "hors
      //    banque" (là où l'analytique est portée).
      const mainLine = entry.lines.find(
        (l) => l.accountCode !== '512000' && l.accountCode !== '530000',
      );
      if (mainLine && mainLine.allocations.length > 0) {
        const firstAlloc = mainLine.allocations[0];
        const allocData: Record<string, unknown> = {};
        if (corrections.amountCents !== undefined) {
          allocData.amountCents = newAmount;
        }
        if (corrections.cohortCode !== undefined) {
          allocData.cohortCode = corrections.cohortCode ?? null;
        }
        if (corrections.disciplineCode !== undefined) {
          allocData.disciplineCode = corrections.disciplineCode ?? null;
        }
        if (corrections.projectId !== undefined) {
          allocData.projectId = corrections.projectId ?? null;
        }
        if (Object.keys(allocData).length > 0) {
          await tx.accountingAllocation.update({
            where: { id: firstAlloc.id },
            data: allocData,
          });
        }
      }

      return e;
    });

    await this.audit.log({
      clubId,
      userId,
      entryId,
      action: AccountingAuditAction.UPDATE,
      metadata: { source: 'OCR_CONFIRM', corrections: { ...corrections } },
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
  // Validation granulaire par ligne
  // ========================================================================

  /**
   * Valide UNE ligne comptable (le user accepte le compte proposé par
   * l'IA, éventuellement après correction). Si toutes les lignes
   * "article" de l'entry sont validées, l'entry bascule automatiquement
   * en POSTED (comptabilisée).
   *
   * Contrepartie banque (512/530) est auto-validée à la création — pas
   * besoin de l'attendre.
   */
  async validateEntryLine(
    clubId: string,
    userId: string,
    lineId: string,
    newAccountCode?: string,
  ): Promise<{
    lineId: string;
    entryPostedAutomatically: boolean;
  }> {
    const line = await this.prisma.accountingEntryLine.findFirst({
      where: { id: lineId, clubId },
      include: { entry: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new BadRequestException(
        `Impossible de valider une ligne d'une écriture en statut ${line.entry.status}.`,
      );
    }
    await this.period.assertDateIsOpen(clubId, line.entry.occurredAt);

    // Si nouveau compte fourni → on change le compte + on recalcule side
    let updatedLine = line;
    if (newAccountCode && newAccountCode !== line.accountCode) {
      const newAccount = await this.lookupAccount(clubId, newAccountCode);
      const newSide = this.deriveSide(
        newAccount.kind,
        line.entry.kind,
        newAccount.code,
      );
      const amt = line.debitCents + line.creditCents;
      updatedLine = (await this.prisma.accountingEntryLine.update({
        where: { id: lineId },
        data: {
          accountCode: newAccount.code,
          accountLabel: newAccount.label,
          side: newSide,
          debitCents: newSide === AccountingLineSide.DEBIT ? amt : 0,
          creditCents: newSide === AccountingLineSide.CREDIT ? amt : 0,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
        include: { entry: true },
      })) as typeof line;
    } else {
      updatedLine = (await this.prisma.accountingEntryLine.update({
        where: { id: lineId },
        data: { validatedAt: new Date(), validatedByUserId: userId },
        include: { entry: true },
      })) as typeof line;
    }

    await this.audit.log({
      clubId,
      userId,
      entryId: line.entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'LINE_VALIDATION',
        lineId,
        accountCode: updatedLine.accountCode,
        changed: newAccountCode ? { old: line.accountCode, new: updatedLine.accountCode } : null,
      },
    });

    // Vérifie si toutes les lignes de l'entry sont validées → auto POSTED
    const unvalidated = await this.prisma.accountingEntryLine.count({
      where: {
        entryId: line.entry.id,
        validatedAt: null,
      },
    });

    let entryPostedAutomatically = false;
    if (unvalidated === 0) {
      await this.prisma.accountingEntry.update({
        where: { id: line.entry.id },
        data: { status: AccountingEntryStatus.POSTED },
      });
      entryPostedAutomatically = true;
      await this.audit.log({
        clubId,
        userId,
        entryId: line.entry.id,
        action: AccountingAuditAction.UPDATE,
        metadata: { source: 'AUTO_POSTED_AFTER_ALL_LINES_VALIDATED' },
      });
      this.logger.log(
        `[Entry ${line.entry.id}] Toutes les lignes validées → status POSTED`,
      );
    }

    return { lineId, entryPostedAutomatically };
  }

  /**
   * Relance l'IA sur une ligne non validée. Utile quand :
   *  - La première catégorisation a échoué (timeout, JSON invalide) et
   *    la ligne est restée sur un compte fallback
   *  - L'user vient de changer le libellé de l'article manuellement
   *    et veut une nouvelle suggestion
   *
   * N'est possible que si la ligne n'est pas encore validée et l'entry
   * est en NEEDS_REVIEW.
   */
  async rerunAiForLine(
    clubId: string,
    userId: string,
    lineId: string,
  ): Promise<{
    lineId: string;
    accountCode: string | null;
    confidencePct: number | null;
    reasoning: string | null;
    errorMessage: string | null;
  }> {
    const line = await this.prisma.accountingEntryLine.findFirst({
      where: { id: lineId, clubId },
      include: { entry: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new BadRequestException(
        'Relance impossible : écriture déjà comptabilisée.',
      );
    }
    if (line.validatedAt) {
      throw new BadRequestException(
        'Relance impossible : ligne déjà validée. Dé-valider d\u2019abord.',
      );
    }

    // Top-up du plan comptable : idempotent, garantit que les comptes
    // ajoutés dans des versions ultérieures (ex : immobilisations
    // classe 2) existent bien en DB avant que l'IA ne les propose. Sans
    // ça, `lookupAccount(215400)` throw NotFoundException et la relance
    // échoue en silence.
    await this.seed.seedIfEmpty(clubId);

    const articleLabel = (line.label ?? '')
      // Nettoie les anciens formats legacy [Compte provisoire...] ou [IA x% : ...]
      .replace(/\s*—\s*\[Compte provisoire[^\]]*\]\s*$/i, '')
      .replace(/\s*—\s*\[IA \d+%[^\]]*\]\s*$/i, '')
      .trim();

    const amountCents = line.debitCents || line.creditCents;
    const kindArg =
      line.entry.kind === AccountingEntryKind.INCOME
        ? 'INCOME'
        : line.entry.kind === AccountingEntryKind.IN_KIND
          ? 'IN_KIND'
          : 'EXPENSE';

    this.logger.log(
      `[Entry ${line.entry.id}] 🔄 Relance IA manuelle pour ligne "${articleLabel}" (${amountCents / 100}€)`,
    );

    const suggestion = await this.suggestion.suggest(clubId, {
      label: articleLabel,
      amountCents,
      kind: kindArg,
    });

    if (!suggestion.accountCode) {
      return {
        lineId,
        accountCode: null,
        confidencePct: null,
        reasoning: null,
        errorMessage:
          suggestion.errorMessage ?? "IA n'a pas proposé de compte",
      };
    }

    const newAccount = await this.lookupAccount(clubId, suggestion.accountCode);
    const newSide = this.deriveSide(
      newAccount.kind,
      line.entry.kind,
      newAccount.code,
    );
    const confPct = Math.round(
      (suggestion.confidencePerField.accountCode ?? 0) * 100,
    );

    await this.prisma.accountingEntryLine.update({
      where: { id: lineId },
      data: {
        accountCode: newAccount.code,
        accountLabel: newAccount.label,
        label: articleLabel,
        side: newSide,
        debitCents: newSide === AccountingLineSide.DEBIT ? amountCents : 0,
        creditCents: newSide === AccountingLineSide.CREDIT ? amountCents : 0,
        iaSuggestedAccountCode: newAccount.code,
        iaReasoning: suggestion.reasoning?.slice(0, 500) ?? null,
        iaConfidencePct: confPct,
      },
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: line.entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'RERUN_AI',
        lineId,
        accountCode: newAccount.code,
        confidencePct: confPct,
      },
    });

    this.logger.log(
      `[Entry ${line.entry.id}] ✅ Relance IA ligne "${articleLabel}" → ${newAccount.code} (${confPct}%)`,
    );

    return {
      lineId,
      accountCode: newAccount.code,
      confidencePct: confPct,
      reasoning: suggestion.reasoning,
      errorMessage: null,
    };
  }

  /**
   * Met à jour la ventilation analytique d'une ligne existante (projet,
   * cohorte, discipline). Utile pour corriger l'analytique d'un article
   * après création — cas typique : facture mixte où tu t'aperçois
   * après coup qu'un article devait être sur un autre projet.
   *
   * Interdit si l'entry est LOCKED (clôture mensuelle). Autorisé en
   * NEEDS_REVIEW et POSTED (modifier l'analytique n'altère pas la
   * balance ni le compte, juste la ventilation analytique).
   */
  async updateLineAllocation(
    clubId: string,
    userId: string,
    lineId: string,
    patch: {
      projectId?: string | null;
      cohortCode?: string | null;
      disciplineCode?: string | null;
    },
  ): Promise<void> {
    const line = await this.prisma.accountingEntryLine.findFirst({
      where: { id: lineId, clubId },
      include: {
        entry: true,
        allocations: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.entry.status === AccountingEntryStatus.LOCKED) {
      throw new ForbiddenException(
        'Impossible de modifier l\u2019analytique d\u2019une écriture verrouillée.',
      );
    }

    // Cas attendu : une allocation par ligne (créée par createQuickEntry).
    // Si aucune, on en crée une avec le montant total ligne.
    const first = line.allocations[0];
    if (!first) {
      await this.prisma.accountingAllocation.create({
        data: {
          lineId,
          clubId,
          amountCents: line.debitCents || line.creditCents,
          projectId: patch.projectId ?? null,
          cohortCode: patch.cohortCode ?? null,
          disciplineCode: patch.disciplineCode ?? null,
          dynamicGroupIdsSnapshot: [],
          dynamicGroupLabelsSnapshot: [],
          freeformTags: [],
        },
      });
    } else {
      const data: Prisma.AccountingAllocationUpdateInput = {};
      if ('projectId' in patch) {
        data.project = patch.projectId
          ? { connect: { id: patch.projectId } }
          : { disconnect: true };
      }
      if ('cohortCode' in patch) {
        // `cohortCode` est une relation composite sur (clubId, code).
        // On passe par le champ scalaire plutôt que la relation.
        (data as Record<string, unknown>).cohortCode = patch.cohortCode;
      }
      if ('disciplineCode' in patch) {
        data.disciplineCode = patch.disciplineCode;
      }
      await this.prisma.accountingAllocation.update({
        where: { id: first.id },
        data,
      });
    }

    await this.audit.log({
      clubId,
      userId,
      entryId: line.entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'UPDATE_ALLOCATION',
        lineId,
        patch,
      },
    });
    this.logger.log(
      `[Entry ${line.entry.id}] Analytique ligne ${lineId} mise à jour par user ${userId}`,
    );
  }

  /**
   * Rejette une ligne : remet validatedAt=null. Utilisé si l'user a
   * validé par erreur et veut corriger avant que l'entry passe POSTED.
   * N'est possible QUE tant que l'entry est NEEDS_REVIEW.
   */
  async unvalidateEntryLine(
    clubId: string,
    userId: string,
    lineId: string,
  ): Promise<void> {
    const line = await this.prisma.accountingEntryLine.findFirst({
      where: { id: lineId, clubId },
      include: { entry: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new BadRequestException(
        'Impossible de dé-valider une ligne déjà comptabilisée.',
      );
    }
    await this.prisma.accountingEntryLine.update({
      where: { id: lineId },
      data: { validatedAt: null, validatedByUserId: null },
    });
    await this.audit.log({
      clubId,
      userId,
      entryId: line.entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: { source: 'LINE_UNVALIDATION', lineId },
    });
  }

  // ========================================================================
  // Suppression (dur) — UNIQUEMENT si écriture non comptabilisée
  // ========================================================================

  /**
   * Supprime définitivement une écriture et ses lignes/allocations.
   *
   * ⚠️ IMPORTANT : juridiquement, ce n'est autorisé QUE si l'écriture
   * n'a pas encore été comptabilisée (statuts DRAFT, NEEDS_REVIEW,
   * CANCELLED). Pour une écriture POSTED ou LOCKED, il faut une
   * contre-passation (`createContraEntry`) qui laisse une trace.
   *
   * Référence : art. L123-22 Code de commerce, PCG obligation de piste
   * d'audit fiable (art. A.47 A-1 LPF).
   */
  async deleteEntryPermanent(
    clubId: string,
    userId: string,
    entryId: string,
  ): Promise<boolean> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    if (
      entry.status === AccountingEntryStatus.POSTED ||
      entry.status === AccountingEntryStatus.LOCKED
    ) {
      throw new ForbiddenException(
        `Suppression interdite pour une écriture ${entry.status}. ` +
          `Juridiquement, une écriture comptabilisée doit être conservée : ` +
          `utilise une contre-passation pour l'annuler.`,
      );
    }

    // Soft-block : les entries avec un paymentId (auto depuis encaissement)
    // ne peuvent pas être supprimées non plus, même en NEEDS_REVIEW — elles
    // correspondent à un flux financier réel.
    if (entry.paymentId) {
      throw new ForbiddenException(
        'Cette écriture est liée à un paiement réel, suppression interdite. ' +
          'Utilise une contre-passation.',
      );
    }

    // Snapshot avant suppression (pour audit immuable). Les Date sont
    // converties en ISO pour stockage JSON propre.
    const snapshot = {
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      source: entry.source,
      label: entry.label,
      amountCents: entry.amountCents,
      occurredAt: entry.occurredAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    };

    await this.prisma.accountingEntry.delete({ where: { id: entryId } });

    // IMPORTANT : `entryId` doit être `null` car l'entry vient d'être
    // supprimée en cascade (les audit logs précédents rattachés à elle
    // ont été supprimés aussi). Tenter de créer un nouveau log avec
    // l'entryId référençant une ligne qui n'existe plus viole la
    // contrainte FK AccountingAuditLog_entryId_fkey. L'id supprimé est
    // sauvegardé dans `metadata` pour traçabilité.
    await this.audit.log({
      clubId,
      userId,
      entryId: null,
      action: AccountingAuditAction.CANCEL,
      metadata: {
        source: 'PERMANENT_DELETE',
        deletedEntryId: entryId,
        priorStatus: entry.status,
        snapshot,
      },
    });
    this.logger.log(
      `Entry ${entryId} supprimée définitivement par user ${userId} (statut ${entry.status}).`,
    );
    return true;
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
    if (filter.financialAccountId)
      where.financialAccountId = filter.financialAccountId;
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
        financialAccount: { include: { accountingAccount: true } },
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
        financialAccount: { include: { accountingAccount: true } },
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
