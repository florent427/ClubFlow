import { MileageVehicleKind } from '@prisma/client';
import type { AccountingAuditService } from '../accounting-audit.service';
import type { AccountingPeriodService } from '../accounting-period.service';
import type { AccountingSeedService } from '../accounting-seed.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { MileageService } from './mileage.service';

/**
 * Validation d'une note de frais kilométriques : le montant part des km
 * déjà VALIDÉS de l'année pour le même véhicule, l'écriture est équilibrée
 * et sa contrepartie dépend du choix du bénévole (467100 à rembourser, à
 * son nom ; 756100 pour un don), et une note payée ne se dévalide plus.
 */

const CLUB = 'club-1';
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Trip = {
  id: string;
  clubId: string;
  claimId: string;
  vehicleId: string;
  tripDate: Date;
  distanceMeters: number;
  roundTrip: boolean;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  recurringTripId: string | null;
  amountCents: number | null;
  scaleLabel: string | null;
  createdAt: Date;
};
type Claim = {
  id: string;
  clubId: string;
  memberId: string;
  title: string;
  settlement: 'REIMBURSEMENT' | 'DONATION';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  amountCents: number | null;
  scaleProvisional: boolean;
  entryId: string | null;
  taxReceiptId: string | null;
  reviewComment: string | null;
  createdAt: Date;
};

const vehicles = {
  v1: { id: 'v1', label: 'Clio', kind: MileageVehicleKind.CAR, fiscalHorsepower: 5, isElectric: false, archivedAt: null },
  v2: { id: 'v2', label: 'Zoé', kind: MileageVehicleKind.CAR, fiscalHorsepower: 5, isElectric: false, archivedAt: null },
};

function makeSvc(opts: { taxReceiptEnabled?: boolean; reimbursed?: boolean } = {}) {
  const claims: Claim[] = [];
  const trips: Trip[] = [];
  const recurring: Array<{
    id: string;
    clubId: string;
    memberId: string;
    vehicleId: string;
    fromLabel: string;
    toLabel: string;
    purpose: string;
    distanceMeters: number;
    roundTrip: boolean;
    weekdays: number[];
    startsOn: Date;
    endsOn: Date | null;
    archivedAt: Date | null;
  }> = [];
  const entries: Array<Record<string, unknown> & { id: string }> = [];
  const lines: Array<Record<string, unknown>> = [];
  let seq = 0;

  const claimRow = (c: Claim) => ({
    ...c,
    member: { id: c.memberId, firstName: 'Léa', lastName: 'Payet', userId: 'u-lea' },
    trips: trips
      .filter((t) => t.claimId === c.id)
      .map((t) => ({ ...t, vehicle: vehicles[t.vehicleId as 'v1' | 'v2'] })),
    entry: entries.find((e) => e.id === c.entryId) ?? null,
    taxReceipt: null,
  });

  /** Écrit en face de `approvedTrips` : chaque clause du `where` est appliquée. */
  const tripFindMany = jest.fn(async ({ where }: { where: Record<string, any> }) =>
    trips.filter((t) => {
      if (where.clubId && t.clubId !== where.clubId) return false;
      if (where.vehicleId?.in && !where.vehicleId.in.includes(t.vehicleId)) return false;
      if (where.recurringTripId?.in && !where.recurringTripId.in.includes(t.recurringTripId)) {
        return false;
      }
      if (where.tripDate?.gte && t.tripDate < where.tripDate.gte) return false;
      if (where.tripDate?.lte && t.tripDate > where.tripDate.lte) return false;
      const claim = claims.find((c) => c.id === t.claimId)!;
      const status = where.claim?.status;
      if (typeof status === 'string' && claim.status !== status) return false;
      if (status?.not && claim.status === status.not) return false;
      return true;
    }),
  );

  const claimFindFirst = jest.fn(async ({ where }: { where: Record<string, any> }) => {
    const c = claims.find(
      (x) =>
        x.id === where.id &&
        x.clubId === where.clubId &&
        (!where.memberId || x.memberId === where.memberId) &&
        (!where.status || x.status === where.status),
    );
    return c ? claimRow(c) : null;
  });

  const db = {
    $executeRaw: jest.fn(async () => 1),
    mileageClaim: {
      findFirst: claimFindFirst,
      update: jest.fn(async ({ where, data }: any) => {
        const c = claims.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = claims.filter((x) => x.id === where.id && (!where.status || x.status === where.status));
        hit.forEach((c) => Object.assign(c, data));
        return { count: hit.length };
      }),
    },
    mileageRecurringTrip: {
      findMany: jest.fn(async ({ where }: any) =>
        recurring.filter(
          (r) =>
            r.clubId === where.clubId &&
            r.memberId === where.memberId &&
            (where.archivedAt !== null || r.archivedAt === null) &&
            (where.vehicle?.archivedAt !== null ||
              vehicles[r.vehicleId as 'v1' | 'v2'].archivedAt === null),
        ),
      ),
      findFirst: jest.fn(async ({ where }: any) =>
        recurring.find(
            (r) =>
              r.id === where.id &&
              r.clubId === where.clubId &&
              (!where.memberId || r.memberId === where.memberId),
          ) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const r = recurring.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return { ...r, vehicle: vehicles[r.vehicleId as 'v1' | 'v2'] };
      }),
    },
    mileageVehicle: {
      findFirst: jest.fn(async ({ where }: any) => vehicles[where.id as 'v1' | 'v2'] ?? null),
    },
    mileageTrip: {
      findMany: tripFindMany,
      createMany: jest.fn(async ({ data }: any) => {
        for (const row of data) {
          trips.push({ id: `t-${++seq}`, amountCents: null, scaleLabel: null, createdAt: new Date(), ...row });
        }
        return { count: data.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const t = trips.find((x) => x.id === where.id)!;
        Object.assign(t, data);
        return t;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        trips.filter((t) => t.claimId === where.claimId).forEach((t) => Object.assign(t, data));
        return { count: 1 };
      }),
    },
    accountingEntry: {
      create: jest.fn(async ({ data }: any) => {
        const e = { id: `e-${++seq}`, ...data };
        entries.push(e);
        return e;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const e = entries.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: any) => {
        lines.push(data);
        return data;
      }),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: any) => ({
        code: where.clubId_code.code,
        label: `Compte ${where.clubId_code.code}`,
        isActive: true,
      })),
    },
    club: {
      findUnique: jest.fn(async () => ({ taxReceiptEnabled: opts.taxReceiptEnabled ?? true })),
    },
    volunteerReimbursementItem: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => (opts.reimbursed ? 1 : 0)),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(async (cb: (tx: typeof db) => Promise<unknown>) => cb(db)),
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AccountingAuditService;
  const period = { assertDateIsOpen: jest.fn() } as unknown as AccountingPeriodService;
  const seed = { seedIfEmpty: jest.fn() } as unknown as AccountingSeedService;
  const notifications = { notifyMembers: jest.fn() } as unknown as NotificationsService;
  const svc = new MileageService(prisma, audit, period, seed, notifications);

  const addClaim = (id: string, status: Claim['status'], settlement: Claim['settlement'] = 'REIMBURSEMENT') => {
    claims.push({
      id,
      clubId: CLUB,
      memberId: 'm-lea',
      title: `Note ${id}`,
      settlement,
      status,
      amountCents: null,
      scaleProvisional: false,
      entryId: null,
      taxReceiptId: null,
      reviewComment: null,
      createdAt: new Date(),
    });
  };
  const addTrip = (claimId: string, id: string, vehicleId: string, iso: string, meters: number, roundTrip = false) => {
    trips.push({
      id,
      clubId: CLUB,
      claimId,
      vehicleId,
      tripDate: d(iso),
      distanceMeters: meters,
      roundTrip,
      fromLabel: 'Domicile',
      toLabel: 'Gymnase',
      purpose: 'Entraînement',
      recurringTripId: null,
      amountCents: null,
      scaleLabel: null,
      createdAt: new Date(),
    });
  };
  const addRecurring = (id: string, weekdays: number[]) => {
    recurring.push({
      id,
      clubId: CLUB,
      memberId: 'm-lea',
      vehicleId: 'v1',
      fromLabel: 'Domicile',
      toLabel: 'Dojo',
      purpose: 'Cours',
      distanceMeters: 12_500,
      roundTrip: true,
      weekdays,
      startsOn: d('2026-01-01'),
      endsOn: null,
      archivedAt: null,
    });
  };
  return { svc, claims, trips, recurring, entries, lines, addClaim, addTrip, addRecurring, period, notifications };
}

describe('MileageService — validation', () => {
  it('passe 625100 / 467100 au nom du bénévole pour un remboursement', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'SUBMITTED');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 25_000, true);
    t.addTrip('c1', 't2', 'v1', '2026-10-08', 25_000, true);

    const view = await t.svc.approveClaim(CLUB, 'admin', 'c1');

    // 100 km × 0,636 €
    expect(view.status).toBe('APPROVED');
    expect(view.displayCents).toBe(6_360);
    expect(t.entries[0]).toMatchObject({
      source: 'MILEAGE_CLAIM',
      status: 'POSTED',
      kind: 'EXPENSE',
      amountCents: 6_360,
      advancedByMemberId: 'm-lea',
      financialAccountId: null,
      occurredAt: d('2026-10-08'),
    });
    expect(t.lines).toEqual([
      expect.objectContaining({ accountCode: '625100', debitCents: 6_360, creditCents: 0 }),
      expect.objectContaining({ accountCode: '467100', debitCents: 0, creditCents: 6_360 }),
    ]);
    // Montant figé sur chaque déplacement, et leur somme vaut l'écriture.
    expect(t.trips.map((x) => x.amountCents)).toEqual([3_180, 3_180]);
    expect(t.period.assertDateIsOpen).toHaveBeenCalledWith(CLUB, d('2026-10-08'));
    expect(t.notifications.notifyMembers).toHaveBeenCalledWith(['m-lea'], expect.anything());
  });

  it('passe 625100 / 756100 sans dette pour un abandon de frais', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'SUBMITTED', 'DONATION');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 10_000);

    await t.svc.approveClaim(CLUB, 'admin', 'c1');

    expect(t.entries[0]).toMatchObject({ advancedByMemberId: null, amountCents: 636 });
    expect(t.lines[1]).toMatchObject({ accountCode: '756100', creditCents: 636 });
  });

  it('refuse un abandon quand le club ne délivre pas de reçus', async () => {
    const t = makeSvc({ taxReceiptEnabled: false });
    t.addClaim('c1', 'SUBMITTED', 'DONATION');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 10_000);
    await expect(t.svc.approveClaim(CLUB, 'admin', 'c1')).rejects.toThrow(/reçus fiscaux/);
    expect(t.entries).toHaveLength(0);
  });

  it('ne compte au cumul que les km validés, du même véhicule et de la même année', async () => {
    const t = makeSvc();
    // Validée, même véhicule, même année : 6 000 km → la suite est en tranche 2.
    t.addClaim('old', 'APPROVED');
    t.addTrip('old', 'o1', 'v1', '2026-02-01', 6_000_000);
    // Ces trois-là ne doivent PAS compter.
    t.addClaim('pending', 'SUBMITTED');
    t.addTrip('pending', 'p1', 'v1', '2026-03-01', 6_000_000);
    t.addClaim('other-car', 'APPROVED');
    t.addTrip('other-car', 'x1', 'v2', '2026-03-01', 6_000_000);
    t.addClaim('last-year', 'APPROVED');
    t.addTrip('last-year', 'y1', 'v1', '2025-03-01', 6_000_000);

    t.addClaim('c1', 'SUBMITTED');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 100_000);
    await t.svc.approveClaim(CLUB, 'admin', 'c1');

    // 100 km au taux de la tranche 5 001-20 000 km : 0,357 €.
    expect(t.claims.find((c) => c.id === 'c1')!.amountCents).toBe(3_570);
  });

  it('ne valide qu’une note soumise', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'DRAFT');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 10_000);
    await expect(t.svc.approveClaim(CLUB, 'admin', 'c1')).rejects.toThrow(/soumise/);
    expect(t.entries).toHaveLength(0);
  });
});

describe('MileageService — annulation de la validation', () => {
  it('annule l’écriture et libère les montants', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'SUBMITTED');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 10_000);
    await t.svc.approveClaim(CLUB, 'admin', 'c1');

    const view = await t.svc.cancelApproval(CLUB, 'admin', 'c1');

    expect(view.status).toBe('SUBMITTED');
    expect(t.entries[0]).toMatchObject({ status: 'CANCELLED', cancelledByUserId: 'admin' });
    expect(t.claims[0]).toMatchObject({ amountCents: null, entryId: null });
    expect(t.trips[0].amountCents).toBeNull();
  });

  it('refuse une note déjà remboursée', async () => {
    const t = makeSvc({ reimbursed: true });
    t.addClaim('c1', 'SUBMITTED');
    t.addTrip('c1', 't1', 'v1', '2026-10-06', 10_000);
    await t.svc.approveClaim(CLUB, 'admin', 'c1');

    await expect(t.svc.cancelApproval(CLUB, 'admin', 'c1')).rejects.toThrow(/déjà remboursée/);
    expect(t.entries[0].status).toBe('POSTED');
  });
});

describe('MileageService — revue', () => {
  it('renvoie pour correction avec un motif obligatoire', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'SUBMITTED');
    await expect(t.svc.returnClaim(CLUB, 'admin', 'c1', '  ')).rejects.toThrow(/motif/);
    const view = await t.svc.returnClaim(CLUB, 'admin', 'c1', 'Il manque le 12/10');
    expect(view.status).toBe('DRAFT');
    expect(view.reviewComment).toBe('Il manque le 12/10');
  });
});

describe('MileageService — trajets récurrents', () => {
  const lea = { kind: 'member' as const, memberId: 'm-lea', userId: 'u-lea' };
  // Semaine du lundi 2026-10-05 au dimanche 2026-10-11.
  const week = { from: d('2026-10-05'), to: d('2026-10-11') };
  const datesOf = (trips: Trip[]) => trips.map((t) => t.tripDate.toISOString().slice(0, 10)).sort();

  it('ajoute autant de déplacements qu’un jour compte de trajets', async () => {
    const t = makeSvc();
    t.addClaim('c1', 'DRAFT');
    t.addRecurring('r1', [2, 2, 4]);

    const { added } = await t.svc.addRecurringTrips(CLUB, lea, 'c1', week);

    expect(added).toBe(3);
    expect(datesOf(t.trips)).toEqual(['2026-10-06', '2026-10-06', '2026-10-08']);
  });

  it('ne complète que les trajets manquants, même d’une autre note', async () => {
    const t = makeSvc();
    t.addClaim('c0', 'SUBMITTED');
    t.addClaim('c1', 'DRAFT');
    // Le mardi a déjà un trajet déclaré, quand le récurrent n'en comptait qu'un.
    t.addTrip('c0', 'old', 'v1', '2026-10-06', 12_500, true);
    t.trips[0].recurringTripId = 'r1';
    t.addRecurring('r1', [2, 2, 4]);

    const { added } = await t.svc.addRecurringTrips(CLUB, lea, 'c1', week);

    expect(added).toBe(2);
    expect(datesOf(t.trips.filter((x) => x.claimId === 'c1'))).toEqual(['2026-10-06', '2026-10-08']);
    // Relancer n'ajoute plus rien.
    expect((await t.svc.addRecurringTrips(CLUB, lea, 'c1', week)).added).toBe(0);
  });

  it('ne compte pas les déplacements d’une note refusée', async () => {
    const t = makeSvc();
    t.addClaim('c0', 'REJECTED');
    t.addClaim('c1', 'DRAFT');
    t.addTrip('c0', 'old', 'v1', '2026-10-06', 12_500, true);
    t.trips[0].recurringTripId = 'r1';
    t.addRecurring('r1', [2]);

    expect((await t.svc.addRecurringTrips(CLUB, lea, 'c1', week)).added).toBe(1);
  });

  it('garde les jours répétés et refuse plus de 4 trajets par jour', async () => {
    const t = makeSvc();
    t.addRecurring('r1', [1]);
    const input = {
      vehicleId: 'v1',
      fromLabel: 'Domicile',
      toLabel: 'Dojo',
      purpose: 'Cours',
      distanceMeters: 12_500,
      roundTrip: true,
      startsOn: d('2026-01-01'),
      endsOn: null,
    };

    await t.svc.updateRecurringTrip(CLUB, lea, 'r1', { ...input, weekdays: [4, 2, 2] });
    expect(t.recurring[0].weekdays).toEqual([2, 2, 4]);

    await expect(
      t.svc.updateRecurringTrip(CLUB, lea, 'r1', { ...input, weekdays: [3, 3, 3, 3, 3] }),
    ).rejects.toThrow('Au plus 4 trajets par jour');
  });
});
