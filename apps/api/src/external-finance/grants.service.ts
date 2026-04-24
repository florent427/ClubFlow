import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  GrantApplicationStatus,
  GrantDocumentKind,
} from '@prisma/client';
import { AccountingAuditService } from '../accounting/accounting-audit.service';
import { AccountingMappingService } from '../accounting/accounting-mapping.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de gestion du workflow complet des subventions.
 *
 * État machine : DRAFT → REQUESTED → GRANTED → PARTIALLY_PAID → PAID →
 *                REPORTED → SETTLED. Branches terminales : REJECTED, ARCHIVED.
 *
 * Hooks compta : quand une tranche est marquée reçue, on crée
 * automatiquement une `AccountingEntry` `AUTO_SUBSIDY` (compte 740/742
 * selon le type de bailleur, paramétrable via AccountingAccountMapping).
 */
@Injectable()
export class GrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapping: AccountingMappingService,
    private readonly audit: AccountingAuditService,
  ) {}

  // =========================================================================
  // CRUD de base
  // =========================================================================

  async list(clubId: string, status?: GrantApplicationStatus | null) {
    return this.prisma.grantApplication.findMany({
      where: {
        clubId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        installments: { orderBy: { expectedAt: 'asc' } },
        documents: { include: { mediaAsset: true } },
      },
    });
  }

  async getOne(clubId: string, id: string) {
    const row = await this.prisma.grantApplication.findFirst({
      where: { id, clubId },
      include: {
        installments: { orderBy: { expectedAt: 'asc' } },
        documents: { include: { mediaAsset: true } },
        project: { select: { id: true, title: true } },
      },
    });
    if (!row) throw new NotFoundException('Dossier de subvention introuvable');
    return row;
  }

  async create(
    clubId: string,
    userId: string,
    input: {
      title: string;
      fundingBody?: string | null;
      requestedAmountCents?: number | null;
      projectId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      reportDueAt?: Date | null;
      notes?: string | null;
    },
  ) {
    return this.prisma.grantApplication.create({
      data: {
        clubId,
        title: input.title.trim(),
        fundingBody: input.fundingBody?.trim() || null,
        requestedAmountCents: input.requestedAmountCents ?? null,
        amountCents: input.requestedAmountCents ?? null,
        projectId: input.projectId ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        reportDueAt: input.reportDueAt ?? null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      },
    });
  }

  async update(
    clubId: string,
    id: string,
    patch: {
      title?: string;
      fundingBody?: string | null;
      requestedAmountCents?: number | null;
      grantedAmountCents?: number | null;
      projectId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      reportDueAt?: Date | null;
      notes?: string | null;
    },
  ) {
    await this.getOne(clubId, id); // guard existence
    return this.prisma.grantApplication.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: patch.title.trim() }),
        ...(patch.fundingBody !== undefined && {
          fundingBody: patch.fundingBody?.trim() || null,
        }),
        ...(patch.requestedAmountCents !== undefined && {
          requestedAmountCents: patch.requestedAmountCents,
        }),
        ...(patch.grantedAmountCents !== undefined && {
          grantedAmountCents: patch.grantedAmountCents,
          amountCents: patch.grantedAmountCents,
        }),
        ...(patch.projectId !== undefined && { projectId: patch.projectId }),
        ...(patch.startsAt !== undefined && { startsAt: patch.startsAt }),
        ...(patch.endsAt !== undefined && { endsAt: patch.endsAt }),
        ...(patch.reportDueAt !== undefined && {
          reportDueAt: patch.reportDueAt,
        }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
      },
    });
  }

  // =========================================================================
  // Transitions d'état
  // =========================================================================

  async submit(clubId: string, id: string) {
    const existing = await this.getOne(clubId, id);
    if (existing.status !== GrantApplicationStatus.DRAFT) {
      throw new BadRequestException(
        `Impossible de soumettre depuis le statut ${existing.status}.`,
      );
    }
    return this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.REQUESTED },
    });
  }

  async markGranted(clubId: string, id: string, grantedAmountCents: number) {
    const existing = await this.getOne(clubId, id);
    if (
      existing.status !== GrantApplicationStatus.REQUESTED &&
      existing.status !== GrantApplicationStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Impossible d'accorder depuis le statut ${existing.status}.`,
      );
    }
    if (grantedAmountCents <= 0) {
      throw new BadRequestException('Montant accordé invalide.');
    }
    return this.prisma.grantApplication.update({
      where: { id },
      data: {
        status: GrantApplicationStatus.GRANTED,
        grantedAmountCents,
        amountCents: grantedAmountCents,
      },
    });
  }

  async reject(clubId: string, id: string) {
    await this.getOne(clubId, id);
    return this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.REJECTED },
    });
  }

  async markReported(clubId: string, id: string, reportSubmittedAt?: Date) {
    const existing = await this.getOne(clubId, id);
    if (
      existing.status !== GrantApplicationStatus.PAID &&
      existing.status !== GrantApplicationStatus.PARTIALLY_PAID
    ) {
      throw new BadRequestException(
        `Rapport ne peut être soumis que depuis les statuts PAID/PARTIALLY_PAID.`,
      );
    }
    return this.prisma.grantApplication.update({
      where: { id },
      data: {
        status: GrantApplicationStatus.REPORTED,
        reportSubmittedAt: reportSubmittedAt ?? new Date(),
      },
    });
  }

  async settle(clubId: string, id: string) {
    const existing = await this.getOne(clubId, id);
    if (existing.status !== GrantApplicationStatus.REPORTED) {
      throw new BadRequestException(
        'Solder : le rapport doit d\u2019abord être soumis.',
      );
    }
    return this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.SETTLED },
    });
  }

  async archive(clubId: string, id: string) {
    await this.getOne(clubId, id);
    return this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.ARCHIVED },
    });
  }

  async delete(clubId: string, id: string) {
    await this.getOne(clubId, id);
    await this.prisma.grantApplication.delete({ where: { id } });
    return true;
  }

  // =========================================================================
  // Installments (tranches)
  // =========================================================================

  async addInstallment(
    clubId: string,
    grantId: string,
    input: {
      expectedAmountCents: number;
      expectedAt?: Date | null;
      notes?: string | null;
    },
  ) {
    const grant = await this.getOne(clubId, grantId);
    return this.prisma.grantInstallment.create({
      data: {
        grantId: grant.id,
        clubId,
        expectedAmountCents: input.expectedAmountCents,
        expectedAt: input.expectedAt ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async removeInstallment(clubId: string, installmentId: string) {
    const row = await this.prisma.grantInstallment.findFirst({
      where: { id: installmentId, clubId },
    });
    if (!row) throw new NotFoundException('Tranche introuvable');
    if (row.receivedAt) {
      throw new BadRequestException(
        'Impossible de supprimer une tranche reçue. Crée une contre-passation.',
      );
    }
    await this.prisma.grantInstallment.delete({ where: { id: installmentId } });
    return true;
  }

  /**
   * Marque une tranche comme reçue → crée automatiquement l'entry compta
   * `AUTO_SUBSIDY` et met à jour le statut global du dossier (PARTIALLY_PAID
   * puis PAID quand toutes les tranches sont encaissées).
   */
  async markInstallmentReceived(
    clubId: string,
    userId: string,
    installmentId: string,
    input: {
      receivedAmountCents: number;
      receivedAt?: Date | null;
      paymentId?: string | null;
    },
  ) {
    const installment = await this.prisma.grantInstallment.findFirst({
      where: { id: installmentId, clubId },
      include: { grant: true },
    });
    if (!installment) throw new NotFoundException('Tranche introuvable');
    if (installment.receivedAt) {
      throw new BadRequestException('Tranche déjà marquée reçue.');
    }
    if (input.receivedAmountCents <= 0) {
      throw new BadRequestException('Montant reçu invalide.');
    }
    const receivedAt = input.receivedAt ?? new Date();

    // Résolution du compte comptable (740 par défaut, personnalisable via mapping)
    const accountCode = await this.mapping.resolveAccountCode(
      clubId,
      'SUBSIDY',
      installment.grantId,
    );
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: accountCode } },
    });
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bank = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: bankCode } },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update installment
      const updated = await tx.grantInstallment.update({
        where: { id: installmentId },
        data: {
          receivedAmountCents: input.receivedAmountCents,
          receivedAt,
          paymentId: input.paymentId ?? null,
        },
      });

      // 2. Crée l'écriture compta si module accounting actif pour ce club
      const moduleRow = await tx.clubModule.findUnique({
        where: {
          clubId_moduleCode: { clubId, moduleCode: 'ACCOUNTING' },
        },
      });
      let entryId: string | null = null;
      if (moduleRow?.enabled === true && account && bank) {
        const entry = await tx.accountingEntry.create({
          data: {
            clubId,
            kind: AccountingEntryKind.INCOME,
            status: AccountingEntryStatus.POSTED,
            source: AccountingEntrySource.AUTO_SUBSIDY,
            label: `Subvention reçue — ${installment.grant.title}`,
            amountCents: input.receivedAmountCents,
            subsidyId: installment.grantId,
            projectId: installment.grant.projectId,
            occurredAt: receivedAt,
            createdByUserId: userId,
          },
        });
        entryId = entry.id;
        // Line 1 : débit banque
        await tx.accountingEntryLine.create({
          data: {
            entryId: entry.id,
            clubId,
            accountCode: bank.code,
            accountLabel: bank.label,
            side: AccountingLineSide.DEBIT,
            debitCents: input.receivedAmountCents,
            creditCents: 0,
            sortOrder: 0,
          },
        });
        // Line 2 : crédit produit subvention
        const revenueLine = await tx.accountingEntryLine.create({
          data: {
            entryId: entry.id,
            clubId,
            accountCode: account.code,
            accountLabel: account.label,
            side: AccountingLineSide.CREDIT,
            debitCents: 0,
            creditCents: input.receivedAmountCents,
            sortOrder: 1,
          },
        });
        // Allocation analytique (projet si rattaché)
        await tx.accountingAllocation.create({
          data: {
            lineId: revenueLine.id,
            clubId,
            amountCents: input.receivedAmountCents,
            projectId: installment.grant.projectId ?? null,
          },
        });
        // Lie l'entry à la tranche
        await tx.grantInstallment.update({
          where: { id: installmentId },
          data: { accountingEntryId: entry.id },
        });
      }

      // 3. Mise à jour du statut global du dossier
      const allInstallments = await tx.grantInstallment.findMany({
        where: { grantId: installment.grantId },
      });
      const totalReceived = allInstallments.reduce(
        (sum, i) => sum + (i.receivedAmountCents ?? 0),
        0,
      );
      const totalExpected = allInstallments.reduce(
        (sum, i) => sum + i.expectedAmountCents,
        0,
      );
      let newStatus: GrantApplicationStatus | null = null;
      if (totalReceived >= totalExpected && totalExpected > 0) {
        newStatus = GrantApplicationStatus.PAID;
      } else if (totalReceived > 0) {
        newStatus = GrantApplicationStatus.PARTIALLY_PAID;
      }
      if (newStatus && installment.grant.status !== newStatus) {
        await tx.grantApplication.update({
          where: { id: installment.grantId },
          data: { status: newStatus },
        });
      }

      return { updated, entryId };
    });

    if (result.entryId) {
      await this.audit.log({
        clubId,
        userId,
        entryId: result.entryId,
        action: 'CREATE',
        metadata: {
          source: 'AUTO_SUBSIDY',
          grantId: installment.grantId,
          installmentId,
        },
      });
    }

    return result.updated;
  }

  // =========================================================================
  // Documents
  // =========================================================================

  async attachDocument(
    clubId: string,
    grantId: string,
    mediaAssetId: string,
    kind: GrantDocumentKind = GrantDocumentKind.OTHER,
  ) {
    await this.getOne(clubId, grantId);
    return this.prisma.grantDocument.upsert({
      where: { grantId_mediaAssetId: { grantId, mediaAssetId } },
      create: { clubId, grantId, mediaAssetId, kind },
      update: { kind },
    });
  }

  async detachDocument(clubId: string, documentId: string) {
    const doc = await this.prisma.grantDocument.findFirst({
      where: { id: documentId, clubId },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.grantDocument.delete({ where: { id: documentId } });
    return true;
  }
}
