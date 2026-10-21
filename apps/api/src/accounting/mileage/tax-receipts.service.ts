import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountingEntryStatus,
  MileageClaimStatus,
  MileageSettlement,
  Prisma,
  TaxReceiptOrganismType,
  TaxReceiptStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TaxReceiptPdfService,
  type TaxReceiptSnapshot,
} from '../../pdf/tax-receipt-pdf.service';
import { tripMeters } from './mileage-compute';

export interface TaxReceiptSettings {
  taxReceiptEnabled: boolean;
  taxReceiptOrganismType: TaxReceiptOrganismType | null;
  taxReceiptPurpose: string | null;
  rnaNumber: string | null;
  taxReceiptSignatoryName: string | null;
  taxReceiptSignatoryTitle: string | null;
}

export interface PendingDonor {
  memberId: string;
  firstName: string;
  lastName: string;
  claimCount: number;
  totalCents: number;
  /** Adresse incomplète : le reçu ne peut pas être émis. */
  missingAddress: boolean;
}

const settingsSelect = {
  taxReceiptEnabled: true,
  taxReceiptOrganismType: true,
  taxReceiptPurpose: true,
  rnaNumber: true,
  taxReceiptSignatoryName: true,
  taxReceiptSignatoryTitle: true,
} satisfies Prisma.ClubSelect;

const receiptInclude = {
  member: { select: { id: true, firstName: true, lastName: true, userId: true } },
} satisfies Prisma.TaxReceiptInclude;

/**
 * Reçus fiscaux des abandons de frais kilométriques (Cerfa 11580).
 *
 * Un reçu par bénévole et par année civile, pour toutes ses notes validées
 * en don que nul reçu ne couvre encore. Le numéro suit sans trou dans
 * l'année (« 2026-0001 »). Le reçu fige l'identité du club et du donateur :
 * il ne se modifie pas, il s'annule — ses notes redeviennent alors
 * disponibles pour un nouveau reçu.
 */
@Injectable()
export class TaxReceiptsService {
  private readonly logger = new Logger(TaxReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: TaxReceiptPdfService,
  ) {}

  async getSettings(clubId: string): Promise<TaxReceiptSettings> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: settingsSelect });
    if (!club) throw new NotFoundException('Club introuvable');
    return club;
  }

  async updateSettings(clubId: string, input: TaxReceiptSettings): Promise<TaxReceiptSettings> {
    const clean = (v: string | null) => v?.trim() || null;
    const data = {
      taxReceiptEnabled: input.taxReceiptEnabled,
      taxReceiptOrganismType: input.taxReceiptOrganismType,
      taxReceiptPurpose: clean(input.taxReceiptPurpose),
      rnaNumber: clean(input.rnaNumber),
      taxReceiptSignatoryName: clean(input.taxReceiptSignatoryName),
      taxReceiptSignatoryTitle: clean(input.taxReceiptSignatoryTitle),
    };
    if (data.taxReceiptEnabled) {
      if (!data.taxReceiptOrganismType) {
        throw new BadRequestException('Indique la qualité du club (intérêt général ou utilité publique).');
      }
      if (!data.taxReceiptPurpose) throw new BadRequestException('Indique l’objet du club.');
      if (!data.taxReceiptSignatoryName) throw new BadRequestException('Indique le signataire des reçus.');
    }
    return this.prisma.club.update({ where: { id: clubId }, data, select: settingsSelect });
  }

  /** Les bénévoles qui ont des dons de l'année sans reçu. */
  async pendingDonors(clubId: string, year: number): Promise<PendingDonor[]> {
    const claims = await this.uncoveredClaims(clubId, year, null);
    const byMember = new Map<string, PendingDonor>();
    for (const c of claims) {
      const m = c.member;
      const row = byMember.get(m.id) ?? {
        memberId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        claimCount: 0,
        totalCents: 0,
        missingAddress: !hasAddress(m),
      };
      row.claimCount += 1;
      row.totalCents += c.amountCents ?? 0;
      byMember.set(m.id, row);
    }
    return [...byMember.values()].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'),
    );
  }

  async list(clubId: string, filter: { year?: number | null; memberId?: string | null }) {
    return this.prisma.taxReceipt.findMany({
      where: {
        clubId,
        ...(filter.year ? { year: filter.year } : {}),
        ...(filter.memberId ? { memberId: filter.memberId } : {}),
      },
      orderBy: [{ year: 'desc' }, { sequence: 'desc' }],
      include: receiptInclude,
      take: 500,
    });
  }

  /**
   * Émet un reçu par bénévole demandé, pour l'année. Les numéros se
   * prennent sous un verrou propre au club : deux émissions simultanées
   * auraient sinon le même rang.
   */
  async issue(clubId: string, userId: string, year: number, memberIds: string[]) {
    if (memberIds.length === 0) throw new BadRequestException('Choisis au moins un bénévole.');
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true, address: true, siret: true, ...settingsSelect },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    if (!club.taxReceiptEnabled) {
      throw new BadRequestException('Active d’abord les reçus fiscaux dans les réglages.');
    }
    if (!club.address?.trim()) {
      throw new BadRequestException('L’adresse du club manque : elle figure sur le reçu.');
    }

    const issuedOn = todayUtc();
    const created = await this.prisma.$transaction(async (tx) => {
      // Fonction qui retourne `void` : `$executeRaw`, jamais `$queryRaw`.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-receipt:${clubId}`}))`;
      const last = await tx.taxReceipt.findFirst({
        where: { clubId, year },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      let sequence = last?.sequence ?? 0;
      const ids: string[] = [];
      for (const memberId of [...new Set(memberIds)]) {
        const claims = await this.uncoveredClaims(clubId, year, memberId, tx);
        if (claims.length === 0) {
          throw new BadRequestException('Un des bénévoles n’a plus de don sans reçu cette année.');
        }
        const m = claims[0].member;
        if (!hasAddress(m)) {
          throw new BadRequestException(
            `Adresse incomplète pour ${m.firstName} ${m.lastName} : complète sa fiche avant d’émettre le reçu.`,
          );
        }
        const amountCents = claims.reduce((s, c) => s + (c.amountCents ?? 0), 0);
        const lines = claims.map((c) => {
          const dates = c.trips.map((t) => t.tripDate.toISOString().slice(0, 10)).sort();
          return {
            id: c.id,
            title: c.title,
            meters: c.trips.reduce((s, t) => s + tripMeters(t), 0),
            amountCents: c.amountCents ?? 0,
            firstDate: dates[0],
            lastDate: dates[dates.length - 1],
          };
        });
        const snapshot: TaxReceiptSnapshot = {
          donor: {
            firstName: m.firstName,
            lastName: m.lastName,
            addressLine: m.addressLine,
            postalCode: m.postalCode,
            city: m.city,
          },
          club: {
            name: club.name,
            address: club.address,
            rnaNumber: club.rnaNumber,
            siret: club.siret,
            purpose: club.taxReceiptPurpose,
            organismType: club.taxReceiptOrganismType,
            signatoryName: club.taxReceiptSignatoryName,
            signatoryTitle: club.taxReceiptSignatoryTitle,
          },
          claims: lines,
          firstDate: lines.map((l) => l.firstDate).sort()[0],
          lastDate: lines.map((l) => l.lastDate).sort().reverse()[0],
        };
        sequence += 1;
        const receipt = await tx.taxReceipt.create({
          data: {
            clubId,
            memberId,
            year,
            sequence,
            number: `${year}-${String(sequence).padStart(4, '0')}`,
            amountCents,
            issuedOn,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            createdByUserId: userId,
          },
        });
        // Seules les notes encore libres : une émission concurrente qui en
        // aurait pris une ferait échouer celle-ci plutôt que de compter un
        // don deux fois.
        const linked = await tx.mileageClaim.updateMany({
          where: { id: { in: claims.map((c) => c.id) }, taxReceiptId: null },
          data: { taxReceiptId: receipt.id },
        });
        if (linked.count !== claims.length) {
          throw new BadRequestException('Des notes viennent d’être couvertes par un autre reçu : relance.');
        }
        ids.push(receipt.id);
      }
      return ids;
    });
    this.logger.log(`[club ${clubId}] ${created.length} reçu(s) fiscal(aux) ${year} émis`);
    return this.prisma.taxReceipt.findMany({
      where: { id: { in: created } },
      orderBy: { sequence: 'asc' },
      include: receiptInclude,
    });
  }

  /** Annule un reçu : il reste dans la numérotation, ses notes se libèrent. */
  async cancel(clubId: string, userId: string, id: string, reason: string) {
    const receipt = await this.prisma.taxReceipt.findFirst({ where: { id, clubId } });
    if (!receipt) throw new NotFoundException('Reçu introuvable');
    if (receipt.status === TaxReceiptStatus.CANCELLED) return this.get(clubId, id);
    const why = reason.trim();
    if (!why) throw new BadRequestException('Indique pourquoi le reçu est annulé.');
    await this.prisma.$transaction([
      this.prisma.taxReceipt.update({
        where: { id },
        data: {
          status: TaxReceiptStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledByUserId: userId,
          cancelReason: why,
        },
      }),
      this.prisma.mileageClaim.updateMany({
        where: { clubId, taxReceiptId: id },
        data: { taxReceiptId: null },
      }),
    ]);
    return this.get(clubId, id);
  }

  async get(clubId: string, id: string) {
    const row = await this.prisma.taxReceipt.findFirst({ where: { id, clubId }, include: receiptInclude });
    if (!row) throw new NotFoundException('Reçu introuvable');
    return row;
  }

  /**
   * Le PDF du reçu, en base64. `memberId` restreint au reçu d'un bénévole
   * (portail) ; null pour le trésorier.
   */
  async pdfBase64(clubId: string, id: string, memberId: string | null): Promise<string> {
    const row = await this.prisma.taxReceipt.findFirst({
      where: { id, clubId, ...(memberId ? { memberId } : {}) },
    });
    if (!row) throw new NotFoundException('Reçu introuvable');
    const buffer = await this.pdf.build({
      number: row.number,
      year: row.year,
      amountCents: row.amountCents,
      issuedOn: row.issuedOn,
      cancelled: row.status === TaxReceiptStatus.CANCELLED,
      snapshot: row.snapshot as unknown as TaxReceiptSnapshot,
    });
    return buffer.toString('base64');
  }

  /**
   * Notes validées en don, sans reçu, dont l'écriture tombe dans l'année :
   * c'est l'année de la dépense qui range le don.
   */
  private uncoveredClaims(
    clubId: string,
    year: number,
    memberId: string | null,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.mileageClaim.findMany({
      where: {
        clubId,
        ...(memberId ? { memberId } : {}),
        status: MileageClaimStatus.APPROVED,
        settlement: MileageSettlement.DONATION,
        taxReceiptId: null,
        entry: {
          status: { not: AccountingEntryStatus.CANCELLED },
          occurredAt: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            addressLine: true,
            postalCode: true,
            city: true,
          },
        },
        trips: { select: { tripDate: true, distanceMeters: true, roundTrip: true } },
      },
    });
  }
}

function hasAddress(m: { addressLine: string | null; postalCode: string | null; city: string | null }) {
  return !!(m.addressLine?.trim() && m.postalCode?.trim() && m.city?.trim());
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
