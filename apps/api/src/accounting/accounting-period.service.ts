import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingFiscalYearService,
  formatIsoDate,
  todayInClubTimezone,
} from './accounting-fiscal-year.service';

const MONTH_CODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Service de gestion du verrouillage comptable.
 *
 * - Verrou mensuel : quand le trésorier clôture un mois, toutes les
 *   écritures datées de ce mois deviennent immutables. Seule une
 *   contre-passation datée d'un mois ouvert peut corriger.
 * - Clôture annuelle : verrouille les 12 mois de l'EXERCICE du club — pas
 *   de l'année civile, cf. `AccountingFiscalYearService` — et fige un
 *   snapshot des totaux pour audit (FEC, bilan).
 */
@Injectable()
export class AccountingPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: AccountingFiscalYearService,
  ) {}

  /**
   * Convertit une date en code "YYYY-MM" pour lookup du verrou mensuel.
   */
  static toMonthCode(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Vrai si la date tombe dans un mois verrouillé OU dans un exercice clos.
   */
  async isDateLocked(clubId: string, date: Date): Promise<boolean> {
    const month = AccountingPeriodService.toMonthCode(date);
    // L'exercice qui contient la date dépend du réglage du club : au
    // 1er septembre, le 2027-03-15 appartient à l'exercice « 2026 ».
    const settings = await this.fiscal.getSettings(clubId);
    const year = AccountingFiscalYearService.yearFor(settings, date);

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
    if (!MONTH_CODE.test(month)) {
      throw new BadRequestException(
        `Mois invalide : ${month} (attendu YYYY-MM).`,
      );
    }
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

  /**
   * Clôture l'exercice dont `year` est l'année de DÉBUT. Refusé tant que
   * l'exercice n'est pas terminé : on ne verrouille pas des mois à venir.
   * `now` est injectable pour les tests ; par défaut, le jour du club.
   */
  async closeFiscalYear(
    clubId: string,
    year: number,
    userId: string,
    now: Date = todayInClubTimezone(),
  ): Promise<void> {
    const settings = await this.fiscal.getSettings(clubId);
    const bounds = AccountingFiscalYearService.boundsFor(settings, year);
    if (bounds.endsOn.getTime() >= now.getTime()) {
      const end = bounds.endsOn;
      const endFr = `${String(end.getUTCDate()).padStart(2, '0')}/${String(
        end.getUTCMonth() + 1,
      ).padStart(2, '0')}/${end.getUTCFullYear()}`;
      throw new BadRequestException(
        `L'exercice ${bounds.label} n'est pas terminé (il se clôt le ${endFr}).`,
      );
    }

    // Snapshot des totaux pour audit (via aggregate sur les entries POSTED
    // de l'exercice).
    const totals = await this.prisma.accountingEntry.groupBy({
      by: ['kind'],
      where: {
        clubId,
        status: 'POSTED',
        occurredAt: { gte: bounds.startsOn, lt: bounds.endsBefore },
      },
      _sum: { amountCents: true },
    });

    // Les bornes sont FIGÉES ici : si le club change ensuite son début
    // d'exercice, une clôture passée garde les siennes (cf. `listClosures`).
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
      label: bounds.label,
      startsOn: formatIsoDate(bounds.startsOn),
      endsOn: formatIsoDate(bounds.endsOn),
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

    // Verrouille les 12 mois de l'exercice
    for (const month of AccountingFiscalYearService.monthsOf(bounds)) {
      await this.lockMonth(clubId, month, userId);
    }
  }

  async listLocks(clubId: string) {
    return this.prisma.accountingPeriodLock.findMany({
      where: { clubId },
      orderBy: { month: 'desc' },
    });
  }

  /**
   * Clôtures avec libellé et bornes : celles figées au snapshot quand elles
   * y sont, sinon recalculées avec le réglage courant (clôtures antérieures
   * à l'ADR-0014, toutes sur l'année civile).
   */
  async listClosures(clubId: string) {
    const [rows, settings] = await Promise.all([
      this.prisma.accountingFiscalYearClose.findMany({
        where: { clubId },
        orderBy: { year: 'desc' },
      }),
      this.fiscal.getSettings(clubId),
    ]);
    return rows.map((r) => {
      const snap = (r.snapshotJson ?? {}) as {
        label?: unknown;
        startsOn?: unknown;
        endsOn?: unknown;
      };
      const bounds = AccountingFiscalYearService.boundsFor(settings, r.year);
      return {
        ...r,
        label: typeof snap.label === 'string' ? snap.label : bounds.label,
        startsOn:
          typeof snap.startsOn === 'string'
            ? snap.startsOn
            : formatIsoDate(bounds.startsOn),
        endsOn:
          typeof snap.endsOn === 'string'
            ? snap.endsOn
            : formatIsoDate(bounds.endsOn),
      };
    });
  }

  async listCohorts(clubId: string) {
    return this.prisma.accountingCohort.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
