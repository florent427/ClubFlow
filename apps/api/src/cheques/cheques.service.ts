import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingEntryKind,
  ChequeStatus,
  ClubFinancialAccountKind,
  Prisma,
} from '@prisma/client';
import { AccountingSeedService } from '../accounting/accounting-seed.service';
import { AccountingService } from '../accounting/accounting.service';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { GrantsService } from '../external-finance/grants.service';
import { SponsoringService } from '../external-finance/sponsoring.service';
import { PrismaService } from '../prisma/prisma.service';

/** Ce que le résolveur affiche pour un chèque, en une requête. */
export const chequeInclude = {
  payment: {
    select: {
      id: true,
      invoiceId: true,
      invoice: { select: { label: true } },
    },
  },
  deposit: { select: { id: true, number: true } },
  image: { select: { id: true, publicUrl: true } },
} satisfies Prisma.ChequeInclude;

export type ChequeRow = Prisma.ChequeGetPayload<{ include: typeof chequeInclude }>;

export interface CreateStandaloneChequeParams {
  number?: string | null;
  drawerName: string;
  bankName?: string | null;
  amountCents: number;
  receivedOn: Date;
  imageAssetId?: string | null;
  notes?: string | null;
  accountCode: string;
  label?: string | null;
  projectId?: string | null;
  grantInstallmentId?: string | null;
  sponsorshipInstallmentId?: string | null;
}

/**
 * Chèques reçus (ADR-0015).
 *
 * Un chèque de FACTURE naît dans `PaymentsService.recordManualPayment`, dans
 * la transaction du paiement. Ici : les chèques HORS facture, les
 * corrections, la photo, l'annulation d'une saisie.
 */
@Injectable()
export class ChequesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly seed: AccountingSeedService,
    private readonly grants: GrantsService,
    private readonly sponsoring: SponsoringService,
  ) {}

  async list(clubId: string, status?: ChequeStatus | null): Promise<ChequeRow[]> {
    return this.prisma.cheque.findMany({
      where: { clubId, ...(status ? { status } : {}) },
      orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
      include: chequeInclude,
    });
  }

  async getById(clubId: string, id: string): Promise<ChequeRow> {
    const row = await this.prisma.cheque.findFirst({
      where: { id, clubId },
      include: chequeInclude,
    });
    if (!row) throw new NotFoundException('Chèque introuvable');
    return row;
  }

  /**
   * Compte « Chèques à encaisser » du club, seedé au besoin. Sans lui, un
   * chèque tomberait en banque le jour de la saisie : c'est exactement ce
   * que l'ADR-0015 interdit.
   */
  async transitAccount(clubId: string) {
    await this.seed.seedIfEmpty(clubId);
    const fin = await this.financialAccounts.getDefault(
      clubId,
      ClubFinancialAccountKind.CHEQUE_TRANSIT,
    );
    if (!fin) {
      throw new BadRequestException(
        'Aucun compte « Chèques à encaisser » (511200) : crée-le dans Paramètres → Comptabilité.',
      );
    }
    return fin;
  }

  /**
   * Chèque hors facture. L'écriture de recette (DÉBIT 511200 / CRÉDIT 7xx)
   * et le chèque sont créés dans la MÊME transaction : un chèque sans
   * recette ou une recette sans chèque seraient invisibles à la remise.
   */
  async createStandalone(
    clubId: string,
    userId: string,
    input: CreateStandaloneChequeParams,
  ): Promise<ChequeRow> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('Montant invalide.');
    }
    if (input.grantInstallmentId && input.sponsorshipInstallmentId) {
      throw new BadRequestException(
        'Un chèque règle une seule tranche : subvention OU sponsoring.',
      );
    }
    const drawerName = input.drawerName.trim();
    if (!drawerName) throw new BadRequestException('Émetteur requis.');
    if (input.imageAssetId) await this.assertImage(clubId, input.imageAssetId);

    const transit = await this.transitAccount(clubId);
    const account = await this.prisma.accountingAccount.findFirst({
      where: { clubId, code: input.accountCode, isActive: true },
      select: { code: true, kind: true },
    });
    if (!account) throw new NotFoundException('Compte comptable introuvable');
    if (account.kind !== 'INCOME') {
      throw new BadRequestException(
        'Un chèque reçu crédite un compte de produit (classe 7).',
      );
    }

    const label = input.label?.trim() || `Chèque ${drawerName}`;
    const number = input.number?.trim() || null;

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await this.accounting.createManualEntry(
        clubId,
        userId,
        {
          kind: AccountingEntryKind.INCOME,
          label,
          accountCode: account.code,
          amountCents: input.amountCents,
          occurredAt: input.receivedOn,
          financialAccountId: transit.id,
          paymentMethod: 'CHECK',
          paymentReference: number,
          projectId: input.projectId ?? null,
        },
        tx,
      );
      return tx.cheque.create({
        data: {
          clubId,
          number,
          drawerName,
          bankName: input.bankName?.trim() || null,
          amountCents: input.amountCents,
          receivedOn: input.receivedOn,
          status: ChequeStatus.PENDING,
          entryId: entry.id,
          imageAssetId: input.imageAssetId ?? null,
          notes: input.notes?.trim() || null,
          createdByUserId: userId,
        },
        include: chequeInclude,
      });
    });

    // Rattachement à la tranche : la recette existe déjà, la tranche est
    // marquée reçue SANS créer une seconde écriture (sinon double compte).
    if (input.grantInstallmentId) {
      await this.grants.markInstallmentReceived(
        clubId,
        userId,
        input.grantInstallmentId,
        {
          receivedAmountCents: input.amountCents,
          receivedAt: input.receivedOn,
          accountingEntryId: created.entryId,
        },
      );
    } else if (input.sponsorshipInstallmentId) {
      await this.sponsoring.markInstallmentReceived(
        clubId,
        userId,
        input.sponsorshipInstallmentId,
        {
          receivedAmountCents: input.amountCents,
          receivedAt: input.receivedOn,
          accountingEntryId: created.entryId,
        },
      );
    }
    return created;
  }

  /**
   * Corrections d'un chèque en portefeuille. Le montant ne se corrige pas :
   * il est porté par une écriture comptabilisée. La date de réception est
   * informative ; la date comptable reste celle de la recette.
   */
  async update(
    clubId: string,
    patch: {
      id: string;
      number?: string | null;
      drawerName?: string | null;
      bankName?: string | null;
      receivedOn?: Date | null;
      notes?: string | null;
    },
  ): Promise<ChequeRow> {
    const cheque = await this.getById(clubId, patch.id);
    if (cheque.status !== ChequeStatus.PENDING) {
      throw new BadRequestException(
        'Un chèque remis ou annulé ne se modifie plus.',
      );
    }
    const data: Prisma.ChequeUpdateInput = {};
    if (patch.number !== undefined) data.number = patch.number?.trim() || null;
    if (patch.drawerName !== undefined) {
      const v = patch.drawerName?.trim();
      if (!v) throw new BadRequestException('Émetteur requis.');
      data.drawerName = v;
    }
    if (patch.bankName !== undefined) data.bankName = patch.bankName?.trim() || null;
    if (patch.receivedOn !== undefined && patch.receivedOn !== null) {
      data.receivedOn = patch.receivedOn;
    }
    if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
    return this.prisma.cheque.update({
      where: { id: cheque.id },
      data,
      include: chequeInclude,
    });
  }

  async attachImage(
    clubId: string,
    chequeId: string,
    mediaAssetId: string,
  ): Promise<ChequeRow> {
    const cheque = await this.getById(clubId, chequeId);
    await this.assertImage(clubId, mediaAssetId);
    return this.prisma.cheque.update({
      where: { id: cheque.id },
      data: { imageAssetId: mediaAssetId },
      include: chequeInclude,
    });
  }

  /**
   * Annule la SAISIE d'un chèque hors facture encore en portefeuille : sa
   * recette est contre-passée. Un chèque de facture passe par un
   * remboursement ou un avoir, jamais par ici.
   */
  async cancelStandalone(
    clubId: string,
    userId: string,
    chequeId: string,
    reason: string,
  ): Promise<ChequeRow> {
    const cheque = await this.getById(clubId, chequeId);
    if (cheque.paymentId) {
      throw new BadRequestException(
        'Ce chèque règle une facture : passe par un remboursement ou un avoir.',
      );
    }
    if (cheque.status !== ChequeStatus.PENDING) {
      throw new BadRequestException('Seul un chèque en portefeuille s’annule.');
    }
    const motif = reason.trim();
    if (!motif) throw new BadRequestException('Motif requis.');

    if (cheque.entryId) {
      await this.accounting.createContraEntry(clubId, userId, cheque.entryId, motif);
    }
    return this.prisma.cheque.update({
      where: { id: cheque.id },
      data: {
        status: ChequeStatus.CANCELLED,
        notes: cheque.notes ? `${cheque.notes}\nAnnulé : ${motif}` : `Annulé : ${motif}`,
      },
      include: chequeInclude,
    });
  }

  private async assertImage(clubId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, clubId },
      select: { kind: true },
    });
    if (!asset) throw new NotFoundException('Photo introuvable');
    if (asset.kind !== 'IMAGE') {
      throw new BadRequestException('La photo d’un chèque doit être une image.');
    }
  }
}
