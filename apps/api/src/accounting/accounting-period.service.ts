import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de gestion du verrouillage comptable.
 *
 * - Verrou mensuel : quand le trésorier clôture un mois, toutes les
 *   écritures datées de ce mois deviennent immutables. Seule une
 *   contre-passation datée d'un mois ouvert peut corriger.
 * - Clôture annuelle : verrouille tous les mois de l'année + snapshot
 *   des totaux pour audit (FEC, bilan).
 */
@Injectable()
export class AccountingPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convertit une date en code "YYYY-MM" pour lookup du verrou mensuel.
   */
  static toMonthCode(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Vrai si la date tombe dans un mois verrouillé OU dans une année close.
   */
  async isDateLocked(clubId: string, date: Date): Promise<boolean> {
    const month = AccountingPeriodService.toMonthCode(date);
    const year = date.getUTCFullYear();

    const [lock, close] = await Promise.all([
      this.prisma.accountingPeriodLock.findUnique({
        where: { clubId_month: { clubId, month } },
      }),
      this.prisma.accountingFiscalYearClose.findUnique({
        where: { clubId_year: { clubId, year } },
      }),
    ]);

    return Boolean(lock) || Boolean(close);
  }

  /**
   * Lève une ForbiddenException si la date est dans une période verrouillée.
   */
  async assertDateIsOpen(clubId: string, date: Date): Promise<void> {
    if (await this.isDateLocked(clubId, date)) {
      const month = AccountingPeriodService.toMonthCode(date);
      throw new ForbiddenException(
        `La période ${month} est verrouillée. Utilise une contre-passation datée d'un mois ouvert pour corriger.`,
      );
    }
  }

  async lockMonth(
    clubId: string,
    month: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.accountingPeriodLock.upsert({
      where: { clubId_month: { clubId, month } },
      create: { clubId, month, lockedByUserId: userId },
      update: {},
    });
  }

  async unlockMonth(clubId: string, month: string): Promise<void> {
    await this.prisma.accountingPeriodLock.deleteMany({
      where: { clubId, month },
    });
  }

  async closeFiscalYear(
    clubId: string,
    year: number,
    userId: string,
  ): Promise<void> {
    // Snapshot des totaux pour audit (via aggregate sur les entries POSTED
    // de l'année).
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

    const totals = await this.prisma.accountingEntry.groupBy({
      by: ['kind'],
      where: {
        clubId,
        status: 'POSTED',
        occurredAt: { gte: startOfYear, lt: startOfNextYear },
      },
      _sum: { amountCents: true },
    });

    const snapshot = {
      revenuesCents: totals
        .filter((t) => t.kind === 'INCOME')
        .reduce((a, t) => a + (t._sum.amountCents ?? 0), 0),
      expensesCents: totals
        .filter((t) => t.kind === 'EXPENSE')
        .reduce((a, t) => a + (t._sum.amountCents ?? 0), 0),
      inKindCents: totals
        .filter((t) => t.kind === 'IN_KIND')
        .reduce((a, t) => a + (t._sum.amountCents ?? 0), 0),
      closedAtIso: new Date().toISOString(),
    };

    await this.prisma.accountingFiscalYearClose.upsert({
      where: { clubId_year: { clubId, year } },
      create: {
        clubId,
        year,
        closedByUserId: userId,
        snapshotJson: snapshot,
      },
      update: {},
    });

    // Verrouille tous les 12 mois de l'année
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      await this.lockMonth(clubId, month, userId);
    }
  }

  async listLocks(clubId: string) {
    return this.prisma.accountingPeriodLock.findMany({
      where: { clubId },
      orderBy: { month: 'desc' },
    });
  }

  async listClosures(clubId: string) {
    return this.prisma.accountingFiscalYearClose.findMany({
      where: { clubId },
      orderBy: { year: 'desc' },
    });
  }

  async listCohorts(clubId: string) {
    return this.prisma.accountingCohort.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
