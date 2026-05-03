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
  SponsorshipDealStatus,
  SponsorshipDocumentKind,
  SponsorshipKind,
} from '@prisma/client';
import { AccountingAuditService } from '../accounting/accounting-audit.service';
import { AccountingMappingService } from '../accounting/accounting-mapping.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de gestion du workflow complet des sponsorings.
 *
 * Types :
 * - CASH : cash flow normal via installments → entry `AUTO_SPONSORSHIP` au
 *   compte 754 (mécénat/sponsoring)
 * - IN_KIND : matériel/prestations en nature → écriture équilibrée
 *   compte 860 (débit emploi) / compte 871 (crédit ressource) au moment
 *   du passage en ACTIVE.
 */
@Injectable()
export class SponsoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapping: AccountingMappingService,
    private readonly audit: AccountingAuditService,
  ) {}

  // =========================================================================
  // CRUD de base
  // =========================================================================

  async list(clubId: string, status?: SponsorshipDealStatus | null) {
    return this.prisma.sponsorshipDeal.findMany({
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
    const row = await this.prisma.sponsorshipDeal.findFirst({
      where: { id, clubId },
      include: {
        installments: { orderBy: { expectedAt: 'asc' } },
        documents: { include: { mediaAsset: true } },
        project: { select: { id: true, title: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!row) throw new NotFoundException('Contrat de sponsoring introuvable');
    return row;
  }

  async create(
    clubId: string,
    userId: string,
    input: {
      sponsorName: string;
      kind: SponsorshipKind;
      valueCents?: number | null;
      inKindDescription?: string | null;
      projectId?: string | null;
      contactId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      notes?: string | null;
    },
  ) {
    if (input.kind === SponsorshipKind.IN_KIND && !input.inKindDescription) {
      throw new BadRequestException(
        'Description requise pour un sponsoring en nature.',
      );
    }
    return this.prisma.sponsorshipDeal.create({
      data: {
        clubId,
        sponsorName: input.sponsorName.trim(),
        kind: input.kind,
        valueCents: input.valueCents ?? null,
        amountCents: input.valueCents ?? null,
        inKindDescription: input.inKindDescription?.trim() || null,
        projectId: input.projectId ?? null,
        contactId: input.contactId ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      },
    });
  }

  async update(
    clubId: string,
    id: string,
    patch: {
      sponsorName?: string;
      valueCents?: number | null;
      inKindDescription?: string | null;
      projectId?: string | null;
      contactId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      notes?: string | null;
    },
  ) {
    await this.getOne(clubId, id);
    return this.prisma.sponsorshipDeal.update({
      where: { id },
      data: {
        ...(patch.sponsorName !== undefined && {
          sponsorName: patch.sponsorName.trim(),
        }),
        ...(patch.valueCents !== undefined && {
          valueCents: patch.valueCents,
          amountCents: patch.valueCents,
        }),
        ...(patch.inKindDescription !== undefined && {
          inKindDescription: patch.inKindDescription?.trim() || null,
        }),
        ...(patch.projectId !== undefined && { projectId: patch.projectId }),
        ...(patch.contactId !== undefined && { contactId: patch.contactId }),
        ...(patch.startsAt !== undefined && { startsAt: patch.startsAt }),
        ...(patch.endsAt !== undefined && { endsAt: patch.endsAt }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
      },
    });
  }

  /**
   * Active un deal. Pour IN_KIND, génère immédiatement l'écriture
   * neutre (860 débit / 871 crédit) sur la valeur estimée.
   */
  async activate(clubId: string, userId: string, id: string) {
    const deal = await this.getOne(clubId, id);
    if (deal.status === SponsorshipDealStatus.ACTIVE) return deal;
    if (
      deal.status === SponsorshipDealStatus.CLOSED ||
      deal.status === SponsorshipDealStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Contrat fermé/annulé : créer un nouveau contrat.',
      );
    }
    const updated = await this.prisma.sponsorshipDeal.update({
      where: { id },
      data: { status: SponsorshipDealStatus.ACTIVE },
    });
    if (
      deal.kind === SponsorshipKind.IN_KIND &&
      deal.valueCents &&
      deal.valueCents > 0
    ) {
      await this.createInKindEntry(clubId, userId, deal.id);
    }
    return updated;
  }

  async close(clubId: string, id: string) {
    await this.getOne(clubId, id);
    return this.prisma.sponsorshipDeal.update({
      where: { id },
      data: { status: SponsorshipDealStatus.CLOSED },
    });
  }

  async cancel(clubId: string, id: string) {
    await this.getOne(clubId, id);
    return this.prisma.sponsorshipDeal.update({
      where: { id },
      data: { status: SponsorshipDealStatus.CANCELLED },
    });
  }

  async delete(clubId: string, id: string) {
    await this.getOne(clubId, id);
    await this.prisma.sponsorshipDeal.delete({ where: { id } });
    return true;
  }

  // =========================================================================
  // Installments (versements cash)
  // =========================================================================

  async addInstallment(
    clubId: string,
    dealId: string,
    input: {
      expectedAmountCents: number;
      expectedAt?: Date | null;
    },
  ) {
    const deal = await this.getOne(clubId, dealId);
    if (deal.kind !== SponsorshipKind.CASH) {
      throw new BadRequestException(
        'Les tranches ne concernent que le sponsoring cash.',
      );
    }
    return this.prisma.sponsorshipInstallment.create({
      data: {
        dealId: deal.id,
        clubId,
        expectedAmountCents: input.expectedAmountCents,
        expectedAt: input.expectedAt ?? null,
      },
    });
  }

  async removeInstallment(clubId: string, installmentId: string) {
    const row = await this.prisma.sponsorshipInstallment.findFirst({
      where: { id: installmentId, clubId },
    });
    if (!row) throw new NotFoundException('Tranche introuvable');
    if (row.receivedAt) {
      throw new BadRequestException(
        'Impossible de supprimer une tranche reçue.',
      );
    }
    await this.prisma.sponsorshipInstallment.delete({
      where: { id: installmentId },
    });
    return true;
  }

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
    const installment = await this.prisma.sponsorshipInstallment.findFirst({
      where: { id: installmentId, clubId },
      include: { deal: true },
    });
    if (!installment) throw new NotFoundException('Tranche introuvable');
    if (installment.receivedAt) {
      throw new BadRequestException('Tranche déjà reçue.');
    }
    if (installment.deal.kind !== SponsorshipKind.CASH) {
      throw new BadRequestException(
        'Tranche non applicable pour un sponsoring en nature.',
      );
    }
    if (input.receivedAmountCents <= 0) {
      throw new BadRequestException('Montant reçu invalide.');
    }
    const receivedAt = input.receivedAt ?? new Date();

    const accountCode = await this.mapping.resolveAccountCode(
      clubId,
      'SPONSORSHIP_CASH',
      installment.dealId,
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
      const updated = await tx.sponsorshipInstallment.update({
        where: { id: installmentId },
        data: {
          receivedAmountCents: input.receivedAmountCents,
          receivedAt,
          paymentId: input.paymentId ?? null,
        },
      });

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
            source: AccountingEntrySource.AUTO_SPONSORSHIP,
            label: `Sponsoring reçu — ${installment.deal.sponsorName}`,
            amountCents: input.receivedAmountCents,
            sponsorshipDealId: installment.dealId,
            projectId: installment.deal.projectId,
            occurredAt: receivedAt,
            createdByUserId: userId,
          },
        });
        entryId = entry.id;
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
        await tx.accountingAllocation.create({
          data: {
            lineId: revenueLine.id,
            clubId,
            amountCents: input.receivedAmountCents,
            projectId: installment.deal.projectId ?? null,
          },
        });
        await tx.sponsorshipInstallment.update({
          where: { id: installmentId },
          data: { accountingEntryId: entry.id },
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
          source: 'AUTO_SPONSORSHIP',
          dealId: installment.dealId,
          installmentId,
        },
      });
    }

    return result.updated;
  }

  // =========================================================================
  // Écriture en nature (860/871)
  // =========================================================================

  private async createInKindEntry(
    clubId: string,
    userId: string,
    dealId: string,
  ): Promise<void> {
    const deal = await this.getOne(clubId, dealId);
    if (!deal.valueCents || deal.valueCents <= 0) return;

    // Idempotence : si une entry existe déjà pour ce deal en source
    // AUTO_SPONSORSHIP + kind IN_KIND, on ne crée pas une 2e.
    const existing = await this.prisma.accountingEntry.findFirst({
      where: {
        clubId,
        sponsorshipDealId: dealId,
        kind: AccountingEntryKind.IN_KIND,
      },
    });
    if (existing) return;

    const chargeCode = '860000'; // Secours en nature, prestations
    const revenueCode = await this.mapping.resolveAccountCode(
      clubId,
      'SPONSORSHIP_IN_KIND',
      dealId,
    );
    const chargeAccount = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: chargeCode } },
    });
    const revenueAccount = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: revenueCode } },
    });
    if (!chargeAccount || !revenueAccount) {
      return; // Plan comptable incomplet — silencieux pour ne pas bloquer
    }

    const moduleRow = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: 'ACCOUNTING' },
      },
    });
    if (moduleRow?.enabled !== true) return;

    const amount = deal.valueCents;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.IN_KIND,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.AUTO_SPONSORSHIP,
          label: `Sponsoring nature — ${deal.sponsorName}`,
          amountCents: amount,
          sponsorshipDealId: deal.id,
          projectId: deal.projectId,
          occurredAt: now,
          createdByUserId: userId,
        },
      });
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: chargeAccount.code,
          accountLabel: chargeAccount.label,
          side: AccountingLineSide.DEBIT,
          debitCents: amount,
          creditCents: 0,
          sortOrder: 0,
        },
      });
      const rev = await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: revenueAccount.code,
          accountLabel: revenueAccount.label,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: amount,
          sortOrder: 1,
        },
      });
      await tx.accountingAllocation.create({
        data: {
          lineId: rev.id,
          clubId,
          amountCents: amount,
          projectId: deal.projectId ?? null,
        },
      });
    });
  }

  // =========================================================================
  // Documents
  // =========================================================================

  async attachDocument(
    clubId: string,
    dealId: string,
    mediaAssetId: string,
    kind: SponsorshipDocumentKind = SponsorshipDocumentKind.OTHER,
  ) {
    await this.getOne(clubId, dealId);
    return this.prisma.sponsorshipDocument.upsert({
      where: { dealId_mediaAssetId: { dealId, mediaAssetId } },
      create: { clubId, dealId, mediaAssetId, kind },
      update: { kind },
    });
  }

  async detachDocument(clubId: string, documentId: string) {
    const doc = await this.prisma.sponsorshipDocument.findFirst({
      where: { id: documentId, clubId },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.sponsorshipDocument.delete({ where: { id: documentId } });
    return true;
  }
}
