import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { AccountingPeriodService } from '../accounting-period.service';
import { computeInKindCounterparts } from '../in-kind-counterparts';

/** Emploi des heures de bénévolat (classe 8, règlement ANC 2018-06). */
export const VOLUNTEER_HOURS_USE_ACCOUNT = '864000';

/** Plafond d'une saisie : une journée. Au-delà, c'est une erreur de frappe. */
const MAX_MINUTES = 24 * 60;
/** Plafond du taux horaire : 1 000 €/h. */
const MAX_RATE_CENTS = 100_000;
const MAX_ACTIVITY_LENGTH = 120;

/** Valeur d'une saisie : minutes × taux horaire, arrondie au centime. */
export function volunteerValueCents(minutes: number, hourlyRateCents: number): number {
  return Math.round((minutes * hourlyRateCents) / 60);
}

export interface VolunteerHoursInput {
  memberId?: string | null;
  contactId?: string | null;
  workedOn: Date;
  minutes: number;
  activity: string;
  /** Absent = taux par défaut du club. */
  hourlyRateCents?: number | null;
  notes?: string | null;
}

const HOURS_INCLUDE = {
  member: { select: { firstName: true, lastName: true } },
  contact: { select: { firstName: true, lastName: true } },
  posting: { select: { id: true, entryId: true, periodStart: true, periodEnd: true } },
} satisfies Prisma.VolunteerHoursInclude;

export type VolunteerHoursRow = Prisma.VolunteerHoursGetPayload<{
  include: typeof HOURS_INCLUDE;
}>;

export type VolunteerHoursPostingRow = Prisma.VolunteerHoursPostingGetPayload<{
  include: { entry: { select: { status: true } }; _count: { select: { hours: true } } };
}>;

/**
 * Bénévolat valorisé : heures saisies par personne et par activité,
 * valorisées au taux horaire du club, puis comptabilisées par période en
 * une écriture en nature 864000 / 870000. Neutre sur le résultat : elle
 * n'apparaît qu'en pied du compte de résultat.
 *
 * Une heure comptabilisée ne se modifie plus ; pour la corriger, on annule
 * la comptabilisation de sa période (tant qu'elle n'est pas clôturée).
 */
@Injectable()
export class VolunteerHoursService {
  private readonly logger = new Logger(VolunteerHoursService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
    private readonly period: AccountingPeriodService,
  ) {}

  async getHourlyRate(clubId: string): Promise<number | null> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { volunteerHourlyRateCents: true },
    });
    return club?.volunteerHourlyRateCents ?? null;
  }

  /** Taux par défaut des prochaines saisies ; les heures déjà saisies gardent le leur. */
  async setHourlyRate(clubId: string, cents: number | null): Promise<number | null> {
    if (cents !== null) this.assertRate(cents);
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: { volunteerHourlyRateCents: cents },
      select: { volunteerHourlyRateCents: true },
    });
    return club.volunteerHourlyRateCents;
  }

  async list(
    clubId: string,
    filter: { from?: Date | null; to?: Date | null },
  ): Promise<VolunteerHoursRow[]> {
    return this.prisma.volunteerHours.findMany({
      where: {
        clubId,
        ...(filter.from || filter.to
          ? {
              workedOn: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      include: HOURS_INCLUDE,
      orderBy: [{ workedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    clubId: string,
    userId: string,
    input: VolunteerHoursInput,
  ): Promise<VolunteerHoursRow> {
    const data = await this.prepare(clubId, input);
    return this.prisma.volunteerHours.create({
      data: { clubId, createdByUserId: userId, ...data },
      include: HOURS_INCLUDE,
    });
  }

  async update(
    clubId: string,
    id: string,
    input: VolunteerHoursInput,
  ): Promise<VolunteerHoursRow> {
    await this.findUnposted(clubId, id);
    const data = await this.prepare(clubId, input);
    // `postingId: null` dans le where : une comptabilisation concurrente
    // entre la lecture et l'écriture fait échouer la mise à jour.
    const res = await this.prisma.volunteerHours.updateMany({
      where: { id, clubId, postingId: null },
      data,
    });
    if (res.count === 0) throw this.alreadyPosted();
    return this.prisma.volunteerHours.findUniqueOrThrow({
      where: { id },
      include: HOURS_INCLUDE,
    });
  }

  async remove(clubId: string, id: string): Promise<void> {
    await this.findUnposted(clubId, id);
    const res = await this.prisma.volunteerHours.deleteMany({
      where: { id, clubId, postingId: null },
    });
    if (res.count === 0) throw this.alreadyPosted();
  }

  async listPostings(clubId: string): Promise<VolunteerHoursPostingRow[]> {
    return this.prisma.volunteerHoursPosting.findMany({
      where: { clubId },
      include: { entry: { select: { status: true } }, _count: { select: { hours: true } } },
      orderBy: { periodEnd: 'desc' },
    });
  }

  /**
   * Comptabilise toutes les heures non comptabilisées de la période : une
   * écriture en nature datée du dernier jour, une ligne 864000 par activité
   * et la contrepartie 870000.
   */
  async post(
    clubId: string,
    userId: string,
    input: { periodStart: Date; periodEnd: Date },
  ): Promise<VolunteerHoursPostingRow> {
    if (input.periodEnd < input.periodStart) {
      throw new BadRequestException('La fin de période précède son début.');
    }
    await this.period.assertDateIsOpen(clubId, input.periodEnd);

    const hours = await this.prisma.volunteerHours.findMany({
      where: {
        clubId,
        postingId: null,
        workedOn: { gte: input.periodStart, lte: input.periodEnd },
      },
      select: { id: true, activity: true, minutes: true, valueCents: true },
    });
    if (hours.length === 0) {
      throw new BadRequestException('Aucune heure à comptabiliser sur cette période.');
    }
    const totalCents = hours.reduce((s, h) => s + h.valueCents, 0);
    const totalMinutes = hours.reduce((s, h) => s + h.minutes, 0);
    if (totalCents <= 0) {
      throw new BadRequestException('Valeur nulle : vérifie le taux horaire des heures saisies.');
    }

    // Une ligne d'emploi par activité : lisible au grand livre, et l'annexe
    // peut détailler le bénévolat par nature d'activité.
    const byActivity = new Map<string, number>();
    for (const h of hours) {
      byActivity.set(h.activity, (byActivity.get(h.activity) ?? 0) + h.valueCents);
    }
    const useLines = [...byActivity.entries()]
      .filter(([, cents]) => cents > 0)
      .sort(([a], [b]) => a.localeCompare(b, 'fr'));

    const useAccount = await this.lookupAccount(clubId, VOLUNTEER_HOURS_USE_ACCOUNT);
    const counterparts = computeInKindCounterparts([
      { accountCode: useAccount.code, debitCents: totalCents },
    ]);
    const counterpartAccounts = await Promise.all(
      counterparts.map((c) => this.lookupAccount(clubId, c.accountCode)),
    );
    const label = `Bénévolat valorisé du ${frDate(input.periodStart)} au ${frDate(input.periodEnd)}`;
    const ids = hours.map((h) => h.id);

    const posting = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.IN_KIND,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.VOLUNTEER_HOURS,
          label,
          amountCents: totalCents,
          occurredAt: input.periodEnd,
          createdByUserId: userId,
          financialAccountId: null,
        },
      });
      let sortOrder = 0;
      for (const [activity, cents] of useLines) {
        await tx.accountingEntryLine.create({
          data: {
            entryId: entry.id,
            clubId,
            accountCode: useAccount.code,
            accountLabel: useAccount.label,
            label: activity,
            side: AccountingLineSide.DEBIT,
            debitCents: cents,
            creditCents: 0,
            sortOrder: sortOrder++,
            validatedAt: new Date(),
            validatedByUserId: userId,
          },
        });
      }
      for (let i = 0; i < counterparts.length; i++) {
        await tx.accountingEntryLine.create({
          data: {
            entryId: entry.id,
            clubId,
            accountCode: counterpartAccounts[i].code,
            accountLabel: counterpartAccounts[i].label,
            side: AccountingLineSide.CREDIT,
            debitCents: 0,
            creditCents: counterparts[i].creditCents,
            sortOrder: sortOrder++,
            validatedAt: new Date(),
            validatedByUserId: userId,
          },
        });
      }
      const created = await tx.volunteerHoursPosting.create({
        data: {
          clubId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          totalMinutes,
          totalCents,
          entryId: entry.id,
          createdByUserId: userId,
        },
      });
      // Seules les heures encore libres : si une autre comptabilisation en a
      // pris une entre-temps, le total ne correspond plus, on annule tout.
      const linked = await tx.volunteerHours.updateMany({
        where: { id: { in: ids }, postingId: null },
        data: { postingId: created.id },
      });
      if (linked.count !== ids.length) {
        throw new BadRequestException(
          'Des heures de la période viennent d’être comptabilisées ou modifiées : relance.',
        );
      }
      return created;
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: posting.entryId,
      action: AccountingAuditAction.CREATE,
      metadata: {
        source: 'VOLUNTEER_HOURS',
        postingId: posting.id,
        hoursCount: ids.length,
        totalMinutes,
        totalCents,
      },
    });
    this.logger.log(
      `[club ${clubId}] bénévolat comptabilisé ${label} : ${ids.length} saisie(s), ${totalCents} c`,
    );
    return this.prisma.volunteerHoursPosting.findUniqueOrThrow({
      where: { id: posting.id },
      include: { entry: { select: { status: true } }, _count: { select: { hours: true } } },
    });
  }

  /**
   * Annule une comptabilisation : l'écriture passe en CANCELLED et ses
   * heures redeviennent modifiables. Impossible une fois la période
   * clôturée (écriture verrouillée).
   */
  async cancelPosting(clubId: string, userId: string, postingId: string): Promise<void> {
    const posting = await this.prisma.volunteerHoursPosting.findFirst({
      where: { id: postingId, clubId },
      include: { entry: { select: { id: true, status: true, occurredAt: true } } },
    });
    if (!posting) throw new NotFoundException('Comptabilisation introuvable');
    if (posting.entry?.status === AccountingEntryStatus.LOCKED) {
      throw new ForbiddenException(
        'Période clôturée : l’écriture est verrouillée, la comptabilisation ne s’annule plus.',
      );
    }
    if (posting.entry) {
      await this.period.assertDateIsOpen(clubId, posting.entry.occurredAt);
    }

    await this.prisma.$transaction(async (tx) => {
      if (posting.entry && posting.entry.status !== AccountingEntryStatus.CANCELLED) {
        await tx.accountingEntry.update({
          where: { id: posting.entry.id },
          data: {
            status: AccountingEntryStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: userId,
          },
        });
      }
      await tx.volunteerHours.updateMany({
        where: { clubId, postingId },
        data: { postingId: null },
      });
      await tx.volunteerHoursPosting.delete({ where: { id: postingId } });
    });

    if (posting.entry) {
      await this.audit.log({
        clubId,
        userId,
        entryId: posting.entry.id,
        action: AccountingAuditAction.CANCEL,
        metadata: { source: 'VOLUNTEER_HOURS', postingId },
      });
    }
  }

  // ---------------------------------------------------------------------

  private async prepare(clubId: string, input: VolunteerHoursInput) {
    const memberId = input.memberId || null;
    const contactId = input.contactId || null;
    if ((memberId ? 1 : 0) + (contactId ? 1 : 0) !== 1) {
      throw new BadRequestException('Choisis un bénévole : un adhérent ou un contact.');
    }
    if (memberId) {
      const m = await this.prisma.member.findFirst({
        where: { id: memberId, clubId },
        select: { id: true },
      });
      if (!m) throw new NotFoundException('Adhérent introuvable dans ce club');
    } else {
      const c = await this.prisma.contact.findFirst({
        where: { id: contactId!, clubId },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Contact introuvable dans ce club');
    }
    if (!Number.isInteger(input.minutes) || input.minutes <= 0 || input.minutes > MAX_MINUTES) {
      throw new BadRequestException('Durée invalide : entre 1 minute et 24 heures.');
    }
    const activity = input.activity.trim();
    if (!activity || activity.length > MAX_ACTIVITY_LENGTH) {
      throw new BadRequestException(
        `Activité requise (${MAX_ACTIVITY_LENGTH} caractères au plus).`,
      );
    }
    const rate = input.hourlyRateCents ?? (await this.getHourlyRate(clubId));
    if (rate === null || rate === undefined) {
      throw new BadRequestException(
        'Aucun taux horaire : renseigne celui du club ou celui de cette saisie.',
      );
    }
    this.assertRate(rate);
    return {
      memberId,
      contactId,
      workedOn: input.workedOn,
      minutes: input.minutes,
      activity,
      hourlyRateCents: rate,
      valueCents: volunteerValueCents(input.minutes, rate),
      notes: input.notes?.trim() || null,
    };
  }

  private assertRate(cents: number): void {
    if (!Number.isInteger(cents) || cents < 0 || cents > MAX_RATE_CENTS) {
      throw new BadRequestException('Taux horaire invalide (entre 0 et 1 000 €).');
    }
  }

  private async findUnposted(clubId: string, id: string) {
    const row = await this.prisma.volunteerHours.findFirst({
      where: { id, clubId },
      select: { id: true, postingId: true },
    });
    if (!row) throw new NotFoundException('Saisie introuvable');
    if (row.postingId) throw this.alreadyPosted();
    return row;
  }

  private alreadyPosted() {
    return new BadRequestException(
      'Heures déjà comptabilisées : annule la comptabilisation de leur période pour les modifier.',
    );
  }

  private async lookupAccount(clubId: string, code: string) {
    const row = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
      select: { code: true, label: true },
    });
    if (!row) {
      throw new NotFoundException(
        `Compte ${code} introuvable : le plan comptable du club n'est pas initialisé.`,
      );
    }
    return row;
  }
}

function frDate(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
}
