import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULING_TIMEZONE } from '../scheduling/scheduling.constants';

/** Réglages d'exercice d'un club (ADR-0014 §1). */
export interface FiscalSettings {
  /** 1 à 12. */
  fiscalYearStartMonth: number;
  /** 1 à 31, cohérent avec le mois (février plafonné à 28). */
  fiscalYearStartDay: number;
  /** Date de reprise de la compta dans ClubFlow ; null = non définie. */
  accountingStartsOn: Date | null;
}

export type FiscalStart = Pick<
  FiscalSettings,
  'fiscalYearStartMonth' | 'fiscalYearStartDay'
>;

export interface FiscalYearBounds {
  /**
   * Année de DÉBUT de l'exercice. C'est elle que porte
   * `AccountingFiscalYearClose.year` : l'exercice « 2026 » d'un club qui
   * ouvre au 1er septembre va du 2026-09-01 au 2027-08-31.
   */
  year: number;
  /** Premier jour, minuit UTC. */
  startsOn: Date;
  /** Dernier jour inclus, minuit UTC. */
  endsOn: Date;
  /** Premier jour de l'exercice suivant : borne exclusive des requêtes. */
  endsBefore: Date;
  /** « 2026 » si l'exercice suit l'année civile, « 2026-2027 » sinon. */
  label: string;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ONE_DAY_MS = 86_400_000;

/**
 * Exercice comptable du club.
 *
 * Jusqu'ici la clôture annuelle supposait l'année civile. Un club sportif
 * vit au rythme de sa saison et ouvre le plus souvent son exercice le
 * 1er septembre. Le défaut reste le 1er janvier : rien ne change pour les
 * clubs existants tant qu'ils ne touchent pas au réglage.
 *
 * Les helpers statiques sont purs et testables sans base ; les méthodes
 * d'instance lisent et écrivent les réglages du club.
 */
@Injectable()
export class AccountingFiscalYearService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers purs ────────────────────────────────────────────────────────

  /**
   * Lève si (mois, jour) n'est pas une date de début valable TOUTES les
   * années. Février est plafonné à 28 : un exercice commence à date fixe, et
   * le 29 n'existe pas chaque année.
   */
  static assertValidStart(month: number, day: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        'Mois de début d’exercice invalide (1 à 12).',
      );
    }
    const max = DAYS_IN_MONTH[month - 1];
    if (!Number.isInteger(day) || day < 1 || day > max) {
      throw new BadRequestException(
        `Jour de début d’exercice invalide pour ce mois (1 à ${max}).`,
      );
    }
  }

  static labelFor(start: FiscalStart, year: number): string {
    return start.fiscalYearStartMonth === 1 && start.fiscalYearStartDay === 1
      ? String(year)
      : `${year}-${year + 1}`;
  }

  static boundsFor(start: FiscalStart, year: number): FiscalYearBounds {
    const m = start.fiscalYearStartMonth - 1;
    const d = start.fiscalYearStartDay;
    const startsOn = new Date(Date.UTC(year, m, d));
    const endsBefore = new Date(Date.UTC(year + 1, m, d));
    const endsOn = new Date(endsBefore.getTime() - ONE_DAY_MS);
    return {
      year,
      startsOn,
      endsOn,
      endsBefore,
      label: AccountingFiscalYearService.labelFor(start, year),
    };
  }

  /** Année de début de l'exercice qui contient `date` (comparée en UTC). */
  static yearFor(start: FiscalStart, date: Date): number {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const onOrAfterStart =
      m > start.fiscalYearStartMonth ||
      (m === start.fiscalYearStartMonth && d >= start.fiscalYearStartDay);
    return onOrAfterStart ? y : y - 1;
  }

  /**
   * Les 12 codes « YYYY-MM » que verrouille la clôture, à partir du mois de
   * début. Le verrou est mensuel : si l'exercice commence en cours de mois,
   * la queue du dernier mois n'est pas couverte par un verrou de mois, mais
   * `isDateLocked` la couvre par la clôture elle-même.
   */
  static monthsOf(bounds: FiscalYearBounds): string[] {
    const out: string[] = [];
    let y = bounds.startsOn.getUTCFullYear();
    let m = bounds.startsOn.getUTCMonth();
    for (let i = 0; i < 12; i++) {
      out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m += 1;
      if (m === 12) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }

  // ── Réglages du club ────────────────────────────────────────────────────

  async getSettings(clubId: string): Promise<FiscalSettings> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        fiscalYearStartMonth: true,
        fiscalYearStartDay: true,
        accountingStartsOn: true,
      },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    return club;
  }

  /** Bornes de l'exercice en cours, à la date du club. */
  async currentBounds(
    clubId: string,
    now: Date = todayInClubTimezone(),
  ): Promise<FiscalYearBounds> {
    const settings = await this.getSettings(clubId);
    return AccountingFiscalYearService.boundsFor(
      settings,
      AccountingFiscalYearService.yearFor(settings, now),
    );
  }

  /**
   * `accountingStartsOn` : `undefined` = inchangé, `null` = effacé.
   * La reprise ne peut pas être dans le futur : on ne rapproche que du
   * passé.
   */
  async updateSettings(
    clubId: string,
    patch: {
      fiscalYearStartMonth?: number;
      fiscalYearStartDay?: number;
      accountingStartsOn?: Date | null;
    },
    now: Date = todayInClubTimezone(),
  ): Promise<FiscalSettings> {
    const current = await this.getSettings(clubId);
    const month = patch.fiscalYearStartMonth ?? current.fiscalYearStartMonth;
    const day = patch.fiscalYearStartDay ?? current.fiscalYearStartDay;
    // Validé sur le couple FINAL : changer le mois seul peut rendre le jour
    // conservé invalide (31 gardé, mois passé à avril).
    AccountingFiscalYearService.assertValidStart(month, day);

    const data: Prisma.ClubUpdateInput = {
      fiscalYearStartMonth: month,
      fiscalYearStartDay: day,
    };
    if (patch.accountingStartsOn !== undefined) {
      if (
        patch.accountingStartsOn &&
        patch.accountingStartsOn.getTime() > now.getTime()
      ) {
        throw new BadRequestException(
          'La date de reprise ne peut pas être dans le futur.',
        );
      }
      data.accountingStartsOn = patch.accountingStartsOn;
    }
    await this.prisma.club.update({ where: { id: clubId }, data });
    return this.getSettings(clubId);
  }

  /**
   * Solde d'ouverture d'un compte financier à la date de reprise. Négatif
   * possible : un découvert est un solde comme un autre.
   */
  async setOpeningBalance(
    clubId: string,
    financialAccountId: string,
    balanceCents: number,
    on: Date,
  ) {
    if (!Number.isInteger(balanceCents)) {
      throw new BadRequestException('Solde attendu en centimes entiers.');
    }
    const account = await this.prisma.clubFinancialAccount.findFirst({
      where: { id: financialAccountId, clubId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Compte financier introuvable');
    return this.prisma.clubFinancialAccount.update({
      where: { id: financialAccountId },
      data: { openingBalanceCents: balanceCents, openingBalanceOn: on },
      include: { accountingAccount: true },
    });
  }
}

// ── Dates calendaires (`@db.Date`) ────────────────────────────────────────
//
// Une date `@db.Date` revient de Prisma à minuit UTC. On la manipule à cette
// granularité, jamais via l'heure locale du serveur.

/**
 * Le jour courant DU CLUB, à minuit UTC. Le serveur tourne en UTC et les
 * clubs sont à La Réunion (UTC+4) : à 2 h du matin là-bas, UTC est encore
 * la veille, et « aujourd'hui » y serait refusé comme date future.
 */
export function todayInClubTimezone(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parseIsoDate(ymd);
}

/** « YYYY-MM-DD » → minuit UTC ; lève sur un format ou une date impossible. */
export function parseIsoDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    throw new BadRequestException(
      `Date invalide : ${value} (attendu YYYY-MM-DD)`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new BadRequestException(`Date invalide : ${value}`);
  }
  return date;
}

/** Minuit UTC → « YYYY-MM-DD ». */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
