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
  MemberStatus,
  MileageClaimStatus,
  MileageSettlement,
  MileageVehicleKind,
  Prisma,
  UserNotificationKind,
  VolunteerReimbursementStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { AccountingPeriodService } from '../accounting-period.service';
import { AccountingSeedService } from '../accounting-seed.service';
import { VOLUNTEER_ACCOUNT_CODE } from '../volunteers/volunteer-advances.service';
import {
  priceTrips,
  recurringDates,
  tripMeters,
  vehicleYearKey,
  weekdayCounts,
  type PricedTrip,
  type VehicleForPricing,
} from './mileage-compute';

/** Charge : frais de déplacement des bénévoles. */
export const MILEAGE_EXPENSE_ACCOUNT = '625100';
/** Produit : le bénévole renonce au remboursement (abandon de frais). */
export const MILEAGE_DONATION_ACCOUNT = '756100';

/** Plus long intervalle qu'on remplit d'un coup depuis les trajets récurrents. */
const MAX_RECURRING_RANGE_DAYS = 93;
/** Trajets d'un même trajet récurrent sur un jour : au-delà, c'est une faute de saisie. */
const MAX_TRIPS_PER_DAY = 4;
/** Un aller de plus de 2 000 km est une faute de frappe. */
const MAX_DISTANCE_METERS = 2_000_000;

export interface VehicleInput {
  label: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
}

export interface RecurringTripInput {
  vehicleId: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
  weekdays: number[];
  startsOn: Date;
  endsOn: Date | null;
}

export interface ClaimInput {
  title: string;
  settlement: MileageSettlement;
  memberNote: string | null;
}

export interface TripInput {
  vehicleId: string;
  tripDate: Date;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
}

/**
 * Qui agit : le bénévole sur son portail (ne voit que ses notes) ou le
 * trésorier (toutes les notes du club, et il peut saisir pour quelqu'un).
 */
export type MileageActor =
  | { kind: 'member'; memberId: string; userId: string }
  | { kind: 'admin'; userId: string };

const claimInclude = {
  member: { select: { id: true, firstName: true, lastName: true, userId: true } },
  trips: {
    orderBy: [{ tripDate: 'asc' }, { createdAt: 'asc' }],
    include: { vehicle: true },
  },
  entry: { select: { id: true, status: true, occurredAt: true } },
  taxReceipt: { select: { id: true, number: true, status: true } },
} satisfies Prisma.MileageClaimInclude;

export type ClaimWithTrips = Prisma.MileageClaimGetPayload<{ include: typeof claimInclude }>;

export interface ClaimView extends ClaimWithTrips {
  totalMeters: number;
  /** Montant figé si validée, sinon estimation au barème. */
  displayCents: number;
  /** Montant de chaque déplacement (figé ou estimé), par id. */
  tripCents: Map<string, number>;
  tripScaleLabels: Map<string, string>;
  /** Le barème de l'année n'est pas encore publié : montant provisoire. */
  provisional: boolean;
  /** Payée (remboursement en vigueur) : n'a de sens que pour un remboursement validé. */
  reimbursed: boolean;
}

/**
 * Frais kilométriques des bénévoles.
 *
 * Le bénévole déclare ses déplacements (ponctuels, ou générés depuis ses
 * trajets récurrents) dans une note qu'il soumet ; le trésorier la valide,
 * la renvoie pour correction ou la refuse. La validation fige le montant au
 * barème fiscal et passe l'écriture :
 * - remboursement : DÉBIT 625100 / CRÉDIT 467100, au nom du bénévole — la
 *   note rejoint alors ce que le club lui doit et se paie par le circuit des
 *   frais avancés (ADR-0016) ;
 * - abandon (don) : DÉBIT 625100 / CRÉDIT 756100, qui ouvrira un reçu fiscal.
 */
@Injectable()
export class MileageService {
  private readonly logger = new Logger(MileageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
    private readonly period: AccountingPeriodService,
    private readonly seed: AccountingSeedService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Véhicules ─────────────────────────────────────────────────────────

  async listVehicles(clubId: string, memberId: string | null, includeArchived = false) {
    return this.prisma.mileageVehicle.findMany({
      where: {
        clubId,
        ...(memberId ? { memberId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
      include: { member: { select: { firstName: true, lastName: true } } },
    });
  }

  async createVehicle(clubId: string, memberId: string, input: VehicleInput) {
    await this.assertMember(clubId, memberId);
    return this.prisma.mileageVehicle.create({
      data: { clubId, memberId, ...normalizeVehicle(input) },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
  }

  /**
   * Corriger un véhicule ne touche pas les notes déjà validées : leur montant
   * est figé. Les notes en cours seront chiffrées avec la nouvelle puissance.
   */
  async updateVehicle(clubId: string, actor: MileageActor, id: string, input: VehicleInput) {
    await this.findVehicle(clubId, actor, id);
    return this.prisma.mileageVehicle.update({
      where: { id },
      data: normalizeVehicle(input),
      include: { member: { select: { firstName: true, lastName: true } } },
    });
  }

  async setVehicleArchived(clubId: string, actor: MileageActor, id: string, archived: boolean) {
    await this.findVehicle(clubId, actor, id);
    return this.prisma.mileageVehicle.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
  }

  /** Un véhicule utilisé ne se supprime pas : il s'archive. */
  async deleteVehicle(clubId: string, actor: MileageActor, id: string): Promise<void> {
    await this.findVehicle(clubId, actor, id);
    const [trips, recurring] = await Promise.all([
      this.prisma.mileageTrip.count({ where: { vehicleId: id } }),
      this.prisma.mileageRecurringTrip.count({ where: { vehicleId: id } }),
    ]);
    if (trips + recurring > 0) {
      throw new BadRequestException(
        'Ce véhicule porte des déplacements : archive-le plutôt que de le supprimer.',
      );
    }
    await this.prisma.mileageVehicle.delete({ where: { id } });
  }

  // ── Trajets récurrents ────────────────────────────────────────────────

  async listRecurringTrips(clubId: string, memberId: string | null, includeArchived = false) {
    return this.prisma.mileageRecurringTrip.findMany({
      where: {
        clubId,
        ...(memberId ? { memberId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
      include: { vehicle: true },
    });
  }

  async createRecurringTrip(clubId: string, memberId: string, input: RecurringTripInput) {
    await this.assertMember(clubId, memberId);
    const data = await this.prepareRecurring(clubId, memberId, input);
    return this.prisma.mileageRecurringTrip.create({
      data: { clubId, memberId, ...data },
      include: { vehicle: true },
    });
  }

  async updateRecurringTrip(
    clubId: string,
    actor: MileageActor,
    id: string,
    input: RecurringTripInput,
  ) {
    const row = await this.findRecurring(clubId, actor, id);
    const data = await this.prepareRecurring(clubId, row.memberId, input);
    return this.prisma.mileageRecurringTrip.update({
      where: { id },
      data,
      include: { vehicle: true },
    });
  }

  async setRecurringTripArchived(
    clubId: string,
    actor: MileageActor,
    id: string,
    archived: boolean,
  ) {
    await this.findRecurring(clubId, actor, id);
    return this.prisma.mileageRecurringTrip.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include: { vehicle: true },
    });
  }

  /**
   * Supprimer un trajet récurrent laisse ses déplacements déjà générés dans
   * leurs notes : ils perdent seulement le lien.
   */
  async deleteRecurringTrip(clubId: string, actor: MileageActor, id: string): Promise<void> {
    await this.findRecurring(clubId, actor, id);
    await this.prisma.mileageRecurringTrip.delete({ where: { id } });
  }

  // ── Notes ─────────────────────────────────────────────────────────────

  async listClaims(
    clubId: string,
    filter: { memberId?: string | null; status?: MileageClaimStatus | null },
  ): Promise<ClaimView[]> {
    const rows = await this.prisma.mileageClaim.findMany({
      where: {
        clubId,
        ...(filter.memberId ? { memberId: filter.memberId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: claimInclude,
      take: 300,
    });
    return this.decorate(clubId, rows);
  }

  async getClaim(clubId: string, actor: MileageActor, id: string): Promise<ClaimView> {
    const row = await this.findClaim(clubId, actor, id);
    const [view] = await this.decorate(clubId, [row]);
    return view;
  }

  async createClaim(
    clubId: string,
    actor: MileageActor,
    memberId: string,
    input: ClaimInput,
  ): Promise<ClaimView> {
    if (actor.kind === 'member' && actor.memberId !== memberId) {
      throw new ForbiddenException();
    }
    await this.assertMember(clubId, memberId);
    const data = await this.prepareClaim(clubId, input);
    const row = await this.prisma.mileageClaim.create({
      data: { clubId, memberId, ...data, createdByUserId: actor.userId },
    });
    return this.getClaim(clubId, actor, row.id);
  }

  async updateClaim(
    clubId: string,
    actor: MileageActor,
    id: string,
    input: ClaimInput,
  ): Promise<ClaimView> {
    await this.findEditableClaim(clubId, actor, id);
    const data = await this.prepareClaim(clubId, input);
    await this.prisma.mileageClaim.update({ where: { id }, data });
    return this.getClaim(clubId, actor, id);
  }

  async deleteClaim(clubId: string, actor: MileageActor, id: string): Promise<void> {
    await this.findEditableClaim(clubId, actor, id);
    await this.prisma.mileageClaim.delete({ where: { id } });
  }

  async addTrip(
    clubId: string,
    actor: MileageActor,
    claimId: string,
    input: TripInput,
  ): Promise<ClaimView> {
    const claim = await this.findEditableClaim(clubId, actor, claimId);
    const data = await this.prepareTrip(clubId, claim.memberId, input);
    await this.prisma.mileageTrip.create({ data: { clubId, claimId, ...data } });
    return this.getClaim(clubId, actor, claimId);
  }

  async updateTrip(
    clubId: string,
    actor: MileageActor,
    tripId: string,
    input: TripInput,
  ): Promise<ClaimView> {
    const trip = await this.findTrip(clubId, tripId);
    const claim = await this.findEditableClaim(clubId, actor, trip.claimId);
    const data = await this.prepareTrip(clubId, claim.memberId, input);
    await this.prisma.mileageTrip.update({ where: { id: tripId }, data });
    return this.getClaim(clubId, actor, claim.id);
  }

  async deleteTrip(clubId: string, actor: MileageActor, tripId: string): Promise<ClaimView> {
    const trip = await this.findTrip(clubId, tripId);
    const claim = await this.findEditableClaim(clubId, actor, trip.claimId);
    await this.prisma.mileageTrip.delete({ where: { id: tripId } });
    return this.getClaim(clubId, actor, claim.id);
  }

  /**
   * Ajoute à la note les déplacements des trajets récurrents actifs du
   * bénévole entre deux dates. Ce qu'un jour compte déjà de déplacements de
   * ce trajet récurrent, dans cette note ou une autre non refusée, est
   * déduit : relancer le remplissage ne double rien, et ne complète que ce
   * qui manque quand le trajet passe à plusieurs fois par jour.
   */
  async addRecurringTrips(
    clubId: string,
    actor: MileageActor,
    claimId: string,
    range: { from: Date; to: Date },
  ): Promise<{ claim: ClaimView; added: number }> {
    const claim = await this.findEditableClaim(clubId, actor, claimId);
    if (range.to < range.from) {
      throw new BadRequestException('La date de fin précède la date de début.');
    }
    const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
    if (days > MAX_RECURRING_RANGE_DAYS) {
      throw new BadRequestException('Remplis au plus trois mois à la fois.');
    }
    const to = minDate(range.to, todayUtc());
    const recurring = await this.prisma.mileageRecurringTrip.findMany({
      where: { clubId, memberId: claim.memberId, archivedAt: null, vehicle: { archivedAt: null } },
    });
    if (recurring.length === 0) return { claim: await this.getClaim(clubId, actor, claimId), added: 0 };

    const existing = await this.prisma.mileageTrip.findMany({
      where: {
        clubId,
        recurringTripId: { in: recurring.map((r) => r.id) },
        tripDate: { gte: range.from, lte: to },
        claim: { status: { not: MileageClaimStatus.REJECTED } },
      },
      select: { recurringTripId: true, tripDate: true },
    });
    const taken = new Map<string, number>();
    for (const e of existing) {
      const key = `${e.recurringTripId}:${e.tripDate.toISOString().slice(0, 10)}`;
      taken.set(key, (taken.get(key) ?? 0) + 1);
    }

    const rows: Prisma.MileageTripCreateManyInput[] = [];
    for (const r of recurring) {
      for (const date of recurringDates(r, range.from, to)) {
        const key = `${r.id}:${date.toISOString().slice(0, 10)}`;
        const left = taken.get(key) ?? 0;
        if (left > 0) {
          taken.set(key, left - 1);
          continue;
        }
        rows.push({
          clubId,
          claimId,
          vehicleId: r.vehicleId,
          tripDate: date,
          fromLabel: r.fromLabel,
          toLabel: r.toLabel,
          purpose: r.purpose,
          distanceMeters: r.distanceMeters,
          roundTrip: r.roundTrip,
          recurringTripId: r.id,
        });
      }
    }
    if (rows.length > 0) await this.prisma.mileageTrip.createMany({ data: rows });
    return { claim: await this.getClaim(clubId, actor, claimId), added: rows.length };
  }

  async submitClaim(clubId: string, actor: MileageActor, id: string): Promise<ClaimView> {
    const claim = await this.findEditableClaim(clubId, actor, id);
    const trips = await this.prisma.mileageTrip.count({ where: { claimId: id } });
    if (trips === 0) throw new BadRequestException('Ajoute au moins un déplacement.');
    const done = await this.prisma.mileageClaim.updateMany({
      where: { id, status: MileageClaimStatus.DRAFT },
      data: { status: MileageClaimStatus.SUBMITTED, submittedAt: new Date(), reviewComment: null },
    });
    if (done.count !== 1) throw new BadRequestException('Cette note vient de changer : recharge.');
    this.logger.log(`[club ${clubId}] note kilométrique ${claim.id} soumise`);
    return this.getClaim(clubId, actor, id);
  }

  /** Renvoie la note au bénévole pour correction, avec un motif. */
  async returnClaim(clubId: string, userId: string, id: string, comment: string) {
    return this.review(clubId, userId, id, MileageClaimStatus.DRAFT, comment);
  }

  async rejectClaim(clubId: string, userId: string, id: string, comment: string) {
    return this.review(clubId, userId, id, MileageClaimStatus.REJECTED, comment);
  }

  /**
   * Valide une note : fige le montant de chaque déplacement au barème et
   * passe l'écriture. Tout se fait dans une transaction verrouillée sur le
   * bénévole, car le montant dépend des km qu'il a déjà fait indemniser dans
   * l'année : deux validations simultanées compteraient le même cumul.
   */
  async approveClaim(clubId: string, userId: string, id: string): Promise<ClaimView> {
    const admin: MileageActor = { kind: 'admin', userId };
    const claim = await this.findClaim(clubId, admin, id);
    if (claim.status !== MileageClaimStatus.SUBMITTED) {
      throw new BadRequestException('Seule une note soumise se valide.');
    }
    if (claim.trips.length === 0) throw new BadRequestException('Note sans déplacement.');
    const occurredAt = claim.trips.reduce(
      (max, t) => (t.tripDate > max ? t.tripDate : max),
      claim.trips[0].tripDate,
    );
    await this.period.assertDateIsOpen(clubId, occurredAt);
    if (claim.settlement === MileageSettlement.DONATION) {
      await this.assertTaxReceiptsEnabled(clubId);
    }

    // Le plan des clubs déjà équipés n'a pas forcément 756100 : le seed le
    // complète (idempotent).
    await this.seed.seedIfEmpty(clubId);
    const expense = await this.lookupAccount(clubId, MILEAGE_EXPENSE_ACCOUNT);
    const counterpart = await this.lookupAccount(
      clubId,
      claim.settlement === MileageSettlement.DONATION
        ? MILEAGE_DONATION_ACCOUNT
        : VOLUNTEER_ACCOUNT_CODE,
    );
    const name = `${claim.member.firstName} ${claim.member.lastName}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Fonction qui retourne `void` : `$executeRaw`, jamais `$queryRaw`.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mileage:${claim.memberId}`}))`;
      const fresh = await tx.mileageClaim.findFirst({
        where: { id, clubId, status: MileageClaimStatus.SUBMITTED },
        include: { trips: { include: { vehicle: true } } },
      });
      if (!fresh || fresh.trips.length === 0) {
        throw new BadRequestException('Cette note vient de changer : recharge.');
      }
      const prior = await priorMeters(tx, clubId, fresh.trips, id);
      const priced = priceTrips(fresh.trips, vehicleMap(fresh.trips), prior);
      const totalCents = priced.reduce((s, p) => s + p.amountCents, 0);
      if (totalCents <= 0) throw new BadRequestException('Montant nul : rien à valider.');
      const totalKm = formatKm(fresh.trips.reduce((s, t) => s + tripMeters(t), 0));

      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.MILEAGE_CLAIM,
          label: `Frais kilométriques ${name} – ${fresh.title}`,
          amountCents: totalCents,
          occurredAt,
          createdByUserId: userId,
          // Aucune trésorerie ne bouge à la validation. Un remboursement est
          // dû au bénévole : c'est `advancedByMemberId` qui le range dans ses
          // frais à rembourser.
          financialAccountId: null,
          advancedByMemberId:
            fresh.settlement === MileageSettlement.REIMBURSEMENT ? fresh.memberId : null,
        },
      });
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: expense.code,
          accountLabel: expense.label,
          label: `${totalKm} km – ${fresh.title}`,
          side: AccountingLineSide.DEBIT,
          debitCents: totalCents,
          creditCents: 0,
          sortOrder: 0,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: counterpart.code,
          accountLabel: counterpart.label,
          label: name,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: totalCents,
          sortOrder: 1,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });
      for (const p of priced) {
        await tx.mileageTrip.update({
          where: { id: p.id },
          data: { amountCents: p.amountCents, scaleLabel: p.scaleLabel },
        });
      }
      await tx.mileageClaim.update({
        where: { id },
        data: {
          status: MileageClaimStatus.APPROVED,
          amountCents: totalCents,
          scaleProvisional: priced.some((p) => p.provisional),
          entryId: entry.id,
          reviewedAt: new Date(),
          reviewedByUserId: userId,
          reviewComment: null,
        },
      });
      return { entryId: entry.id, totalCents };
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: result.entryId,
      action: AccountingAuditAction.CREATE,
      metadata: {
        source: 'MILEAGE_CLAIM',
        claimId: id,
        memberId: claim.memberId,
        settlement: claim.settlement,
        totalCents: result.totalCents,
      },
    });
    await this.notifyMember(
      clubId,
      claim.memberId,
      'Note de frais kilométriques validée',
      claim.settlement === MileageSettlement.DONATION
        ? `« ${claim.title} » est validée pour ${euros(result.totalCents)}, en don au club. Merci !`
        : `« ${claim.title} » est validée : ${euros(result.totalCents)} à vous rembourser.`,
    );
    return this.getClaim(clubId, admin, id);
  }

  /**
   * Annule une validation : l'écriture passe en CANCELLED et la note
   * redevient soumise, montants libérés. Impossible une fois la note payée,
   * couverte par un reçu fiscal, ou sa période clôturée.
   */
  async cancelApproval(clubId: string, userId: string, id: string): Promise<ClaimView> {
    const admin: MileageActor = { kind: 'admin', userId };
    const claim = await this.findClaim(clubId, admin, id);
    if (claim.status !== MileageClaimStatus.APPROVED) {
      throw new BadRequestException('Cette note n’est pas validée.');
    }
    if (claim.taxReceiptId && claim.taxReceipt?.status === 'ISSUED') {
      throw new BadRequestException(
        `Un reçu fiscal (${claim.taxReceipt.number}) couvre cette note : annule-le d’abord.`,
      );
    }
    if (claim.entry) {
      if (claim.entry.status === AccountingEntryStatus.LOCKED) {
        throw new ForbiddenException('Période clôturée : la validation ne s’annule plus.');
      }
      await this.period.assertDateIsOpen(clubId, claim.entry.occurredAt);
      const paid = await this.prisma.volunteerReimbursementItem.count({
        where: {
          entryId: claim.entry.id,
          reimbursement: { status: VolunteerReimbursementStatus.POSTED },
        },
      });
      if (paid > 0) {
        throw new BadRequestException(
          'Cette note est déjà remboursée : annule d’abord le remboursement.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const done = await tx.mileageClaim.updateMany({
        where: { id, status: MileageClaimStatus.APPROVED },
        data: {
          status: MileageClaimStatus.SUBMITTED,
          amountCents: null,
          scaleProvisional: false,
          entryId: null,
          taxReceiptId: null,
          reviewedAt: null,
          reviewedByUserId: null,
        },
      });
      if (done.count !== 1) throw new BadRequestException('Cette note vient de changer : recharge.');
      await tx.mileageTrip.updateMany({
        where: { claimId: id },
        data: { amountCents: null, scaleLabel: null },
      });
      if (claim.entry && claim.entry.status !== AccountingEntryStatus.CANCELLED) {
        await tx.accountingEntry.update({
          where: { id: claim.entry.id },
          data: {
            status: AccountingEntryStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: userId,
          },
        });
      }
    });
    if (claim.entry) {
      await this.audit.log({
        clubId,
        userId,
        entryId: claim.entry.id,
        action: AccountingAuditAction.CANCEL,
        metadata: { source: 'MILEAGE_CLAIM', claimId: id },
      });
    }
    return this.getClaim(clubId, admin, id);
  }

  // ── Interne ───────────────────────────────────────────────────────────

  private async review(
    clubId: string,
    userId: string,
    id: string,
    next: MileageClaimStatus,
    comment: string,
  ): Promise<ClaimView> {
    const admin: MileageActor = { kind: 'admin', userId };
    const claim = await this.findClaim(clubId, admin, id);
    const reason = comment.trim();
    if (!reason) throw new BadRequestException('Indique un motif au bénévole.');
    const done = await this.prisma.mileageClaim.updateMany({
      where: { id, clubId, status: MileageClaimStatus.SUBMITTED },
      data: {
        status: next,
        reviewComment: reason,
        reviewedAt: new Date(),
        reviewedByUserId: userId,
      },
    });
    if (done.count !== 1) throw new BadRequestException('Seule une note soumise se renvoie ou se refuse.');
    await this.notifyMember(
      clubId,
      claim.memberId,
      next === MileageClaimStatus.DRAFT
        ? 'Note de frais kilométriques à corriger'
        : 'Note de frais kilométriques refusée',
      `« ${claim.title} » : ${reason}`,
    );
    return this.getClaim(clubId, admin, id);
  }

  /**
   * Chiffre les notes pour l'affichage : montant figé si validée, sinon
   * estimation au barème en partant des km déjà validés de l'année. Une
   * seule requête pour le cumul de toutes les notes de la liste.
   */
  private async decorate(clubId: string, rows: ClaimWithTrips[]): Promise<ClaimView[]> {
    const pending = rows.filter((r) => r.status !== MileageClaimStatus.APPROVED);
    const allPendingTrips = pending.flatMap((r) => r.trips);
    const priorAll =
      allPendingTrips.length > 0
        ? await approvedTrips(this.prisma, clubId, allPendingTrips)
        : [];

    const reimbursedEntries = new Set<string>();
    const entryIds = rows
      .filter((r) => r.status === MileageClaimStatus.APPROVED && r.entryId)
      .map((r) => r.entryId!);
    if (entryIds.length > 0) {
      const items = await this.prisma.volunteerReimbursementItem.findMany({
        where: {
          entryId: { in: entryIds },
          reimbursement: { status: VolunteerReimbursementStatus.POSTED },
        },
        select: { entryId: true },
      });
      for (const i of items) reimbursedEntries.add(i.entryId);
    }

    return rows.map((r) => {
      const totalMeters = r.trips.reduce((s, t) => s + tripMeters(t), 0);
      const tripCents = new Map<string, number>();
      const tripScaleLabels = new Map<string, string>();
      let provisional = r.scaleProvisional;
      let displayCents = r.amountCents ?? 0;
      if (r.status === MileageClaimStatus.APPROVED) {
        for (const t of r.trips) {
          tripCents.set(t.id, t.amountCents ?? 0);
          if (t.scaleLabel) tripScaleLabels.set(t.id, t.scaleLabel);
        }
      } else if (r.trips.length > 0) {
        const prior = sumPrior(
          priorAll.filter((p) => p.claimId !== r.id),
          r.trips,
        );
        let priced: PricedTrip[];
        try {
          priced = priceTrips(r.trips, vehicleMap(r.trips), prior);
        } catch {
          priced = [];
        }
        displayCents = priced.reduce((s, p) => s + p.amountCents, 0);
        provisional = priced.some((p) => p.provisional);
        for (const p of priced) {
          tripCents.set(p.id, p.amountCents);
          tripScaleLabels.set(p.id, p.scaleLabel);
        }
      }
      return {
        ...r,
        totalMeters,
        displayCents,
        tripCents,
        tripScaleLabels,
        provisional,
        reimbursed: !!r.entryId && reimbursedEntries.has(r.entryId),
      };
    });
  }

  private async findClaim(clubId: string, actor: MileageActor, id: string) {
    const row = await this.prisma.mileageClaim.findFirst({
      where: { id, clubId, ...(actor.kind === 'member' ? { memberId: actor.memberId } : {}) },
      include: claimInclude,
    });
    if (!row) throw new NotFoundException('Note introuvable');
    return row;
  }

  /** Une note ne se modifie qu'en brouillon (ou renvoyée pour correction). */
  private async findEditableClaim(clubId: string, actor: MileageActor, id: string) {
    const row = await this.findClaim(clubId, actor, id);
    if (row.status !== MileageClaimStatus.DRAFT) {
      throw new BadRequestException(
        row.status === MileageClaimStatus.SUBMITTED
          ? 'Note soumise : elle attend la décision du trésorier.'
          : 'Cette note ne se modifie plus.',
      );
    }
    return row;
  }

  private async findTrip(clubId: string, id: string) {
    const trip = await this.prisma.mileageTrip.findFirst({ where: { id, clubId } });
    if (!trip) throw new NotFoundException('Déplacement introuvable');
    return trip;
  }

  private async findVehicle(clubId: string, actor: MileageActor, id: string) {
    const row = await this.prisma.mileageVehicle.findFirst({
      where: { id, clubId, ...(actor.kind === 'member' ? { memberId: actor.memberId } : {}) },
    });
    if (!row) throw new NotFoundException('Véhicule introuvable');
    return row;
  }

  private async findRecurring(clubId: string, actor: MileageActor, id: string) {
    const row = await this.prisma.mileageRecurringTrip.findFirst({
      where: { id, clubId, ...(actor.kind === 'member' ? { memberId: actor.memberId } : {}) },
    });
    if (!row) throw new NotFoundException('Trajet récurrent introuvable');
    return row;
  }

  private async assertMember(clubId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
      select: { id: true },
    });
    if (!member) throw new BadRequestException('Bénévole introuvable dans ce club.');
  }

  /** Le véhicule doit être celui du bénévole, et encore en service. */
  private async assertVehicleOf(clubId: string, memberId: string, vehicleId: string) {
    const v = await this.prisma.mileageVehicle.findFirst({
      where: { id: vehicleId, clubId, memberId },
      select: { id: true, archivedAt: true },
    });
    if (!v) throw new BadRequestException('Véhicule introuvable pour ce bénévole.');
    if (v.archivedAt) throw new BadRequestException('Ce véhicule est archivé.');
  }

  private async assertTaxReceiptsEnabled(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { taxReceiptEnabled: true },
    });
    if (!club?.taxReceiptEnabled) {
      throw new BadRequestException(
        'Le club ne délivre pas de reçus fiscaux : l’abandon de frais n’est pas proposé.',
      );
    }
  }

  private async prepareClaim(clubId: string, input: ClaimInput) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Donne un titre à la note (ex. « Octobre 2026 »).');
    if (input.settlement === MileageSettlement.DONATION) {
      await this.assertTaxReceiptsEnabled(clubId);
    }
    return {
      title,
      settlement: input.settlement,
      memberNote: input.memberNote?.trim() || null,
    };
  }

  private async prepareTrip(clubId: string, memberId: string, input: TripInput) {
    await this.assertVehicleOf(clubId, memberId, input.vehicleId);
    if (input.tripDate > todayUtc()) {
      throw new BadRequestException('Un déplacement à venir ne se déclare pas encore.');
    }
    assertDistance(input.distanceMeters);
    return {
      vehicleId: input.vehicleId,
      tripDate: input.tripDate,
      fromLabel: required(input.fromLabel, 'le départ'),
      toLabel: required(input.toLabel, 'l’arrivée'),
      purpose: required(input.purpose, 'le motif'),
      distanceMeters: input.distanceMeters,
      roundTrip: input.roundTrip,
    };
  }

  private async prepareRecurring(clubId: string, memberId: string, input: RecurringTripInput) {
    await this.assertVehicleOf(clubId, memberId, input.vehicleId);
    assertDistance(input.distanceMeters);
    const weekdays = [...input.weekdays].sort((a, b) => a - b);
    if (weekdays.length === 0 || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      throw new BadRequestException('Choisis au moins un jour de la semaine.');
    }
    if ([...weekdayCounts(weekdays).values()].some((n) => n > MAX_TRIPS_PER_DAY)) {
      throw new BadRequestException(
        `Au plus ${MAX_TRIPS_PER_DAY} trajets par jour : au-delà, crée un autre trajet récurrent.`,
      );
    }
    if (input.endsOn && input.endsOn < input.startsOn) {
      throw new BadRequestException('La fin précède le début.');
    }
    return {
      vehicleId: input.vehicleId,
      fromLabel: required(input.fromLabel, 'le départ'),
      toLabel: required(input.toLabel, 'l’arrivée'),
      purpose: required(input.purpose, 'le motif'),
      distanceMeters: input.distanceMeters,
      roundTrip: input.roundTrip,
      weekdays,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    };
  }

  /**
   * Prévenir le bénévole est accessoire : la décision est déjà enregistrée,
   * un push en échec ne doit pas la faire paraître ratée.
   */
  private async notifyMember(clubId: string, memberId: string, title: string, body: string) {
    try {
      await this.notifications.notifyMembers([memberId], {
        clubId,
        kind: UserNotificationKind.SYSTEM,
        title,
        body,
      });
    } catch (err) {
      this.logger.warn(
        `[club ${clubId}] notification frais kilométriques non envoyée : ${(err as Error).message}`,
      );
    }
  }

  private async lookupAccount(clubId: string, code: string) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
      select: { code: true, label: true, isActive: true },
    });
    if (!account || !account.isActive) {
      throw new BadRequestException(
        `Compte ${code} absent ou désactivé dans le plan comptable du club.`,
      );
    }
    return account;
  }
}

// ── Fonctions libres ───────────────────────────────────────────────────

type TripWithVehicle = {
  id: string;
  vehicleId: string;
  tripDate: Date;
  distanceMeters: number;
  roundTrip: boolean;
  vehicle: VehicleForPricing;
};

function vehicleMap(trips: TripWithVehicle[]): Map<string, VehicleForPricing> {
  return new Map(trips.map((t) => [t.vehicleId, t.vehicle]));
}

/** Les déplacements des notes validées sur les mêmes véhicules et années. */
async function approvedTrips(
  db: Pick<PrismaService, 'mileageTrip'> | Prisma.TransactionClient,
  clubId: string,
  trips: Array<{ vehicleId: string; tripDate: Date }>,
) {
  const vehicleIds = [...new Set(trips.map((t) => t.vehicleId))];
  const years = trips.map((t) => t.tripDate.getUTCFullYear());
  const from = new Date(Date.UTC(Math.min(...years), 0, 1));
  const to = new Date(Date.UTC(Math.max(...years), 11, 31));
  return db.mileageTrip.findMany({
    where: {
      clubId,
      vehicleId: { in: vehicleIds },
      tripDate: { gte: from, lte: to },
      claim: { status: MileageClaimStatus.APPROVED },
    },
    select: { claimId: true, vehicleId: true, tripDate: true, distanceMeters: true, roundTrip: true },
  });
}

function sumPrior(
  approved: Array<{ vehicleId: string; tripDate: Date; distanceMeters: number; roundTrip: boolean }>,
  trips: Array<{ vehicleId: string; tripDate: Date }>,
): Map<string, number> {
  const wanted = new Set(trips.map((t) => vehicleYearKey(t.vehicleId, t.tripDate.getUTCFullYear())));
  const out = new Map<string, number>();
  for (const a of approved) {
    const key = vehicleYearKey(a.vehicleId, a.tripDate.getUTCFullYear());
    if (!wanted.has(key)) continue;
    out.set(key, (out.get(key) ?? 0) + tripMeters(a));
  }
  return out;
}

async function priorMeters(
  tx: Prisma.TransactionClient,
  clubId: string,
  trips: Array<{ vehicleId: string; tripDate: Date }>,
  excludeClaimId: string,
): Promise<Map<string, number>> {
  const approved = await approvedTrips(tx, clubId, trips);
  return sumPrior(
    approved.filter((a) => a.claimId !== excludeClaimId),
    trips,
  );
}

function normalizeVehicle(input: VehicleInput) {
  const label = input.label.trim();
  if (!label) throw new BadRequestException('Nomme le véhicule (ex. « Clio grise »).');
  if (input.kind === MileageVehicleKind.MOPED) {
    return { label, kind: input.kind, fiscalHorsepower: null, isElectric: input.isElectric };
  }
  const cv = input.fiscalHorsepower;
  if (cv === null || !Number.isInteger(cv) || cv < 1 || cv > 50) {
    throw new BadRequestException('Indique la puissance fiscale (CV) de la carte grise.');
  }
  return { label, kind: input.kind, fiscalHorsepower: cv, isElectric: input.isElectric };
}

function assertDistance(meters: number) {
  if (!Number.isInteger(meters) || meters <= 0 || meters > MAX_DISTANCE_METERS) {
    throw new BadRequestException('Distance invalide (entre 0,1 et 2 000 km pour un aller).');
  }
}

function required(value: string, what: string): string {
  const v = value.trim();
  if (!v) throw new BadRequestException(`Indique ${what}.`);
  return v;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

export function formatKm(meters: number): string {
  return (meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function euros(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
