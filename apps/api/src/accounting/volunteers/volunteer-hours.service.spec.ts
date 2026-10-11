import type { AccountingAuditService } from '../accounting-audit.service';
import type { AccountingPeriodService } from '../accounting-period.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { VolunteerHoursService, volunteerValueCents } from './volunteer-hours.service';

/**
 * Bénévolat valorisé : la saisie fige la valeur au taux du moment, la
 * comptabilisation d'une période produit une écriture en nature équilibrée
 * 864000 / 870000 sans trésorerie, et une heure comptabilisée ne bouge plus.
 */

const CLUB = 'club-1';
const OTHER_CLUB = 'club-2';

type Hours = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  workedOn: Date;
  minutes: number;
  activity: string;
  hourlyRateCents: number;
  valueCents: number;
  notes: string | null;
  postingId: string | null;
  createdAt: Date;
};
type Line = {
  entryId: string;
  accountCode: string;
  label?: string;
  debitCents: number;
  creditCents: number;
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Double en mémoire écrit en face des requêtes du service : chaque clause
 * de `where` utilisée (clubId, postingId, intervalle de workedOn, id in) est
 * appliquée, pour qu'un oubli dans le service se voie.
 */
function matches(h: Hours, where: Record<string, unknown>): boolean {
  if (where.id !== undefined) {
    const id = where.id as string | { in: string[] };
    if (typeof id === 'string' ? h.id !== id : !id.in.includes(h.id)) return false;
  }
  if (where.clubId !== undefined && h.clubId !== where.clubId) return false;
  if ('postingId' in where && h.postingId !== where.postingId) return false;
  const w = where.workedOn as { gte?: Date; lte?: Date } | undefined;
  if (w?.gte && h.workedOn < w.gte) return false;
  if (w?.lte && h.workedOn > w.lte) return false;
  return true;
}

function makeSvc(opts: { rate?: number | null; entryStatus?: string } = {}) {
  const hours: Hours[] = [];
  const lines: Line[] = [];
  const entries: Array<Record<string, unknown> & { id: string }> = [];
  const postings: Array<Record<string, unknown> & { id: string }> = [];
  let seq = 0;
  const people = {
    member: [{ id: 'm-1', clubId: CLUB, firstName: 'Léa', lastName: 'Payet' }],
    contact: [{ id: 'c-1', clubId: CLUB, firstName: 'Paul', lastName: 'Hoarau' }],
  };
  const person = (kind: 'member' | 'contact') => ({
    findFirst: jest.fn(
      async ({ where }: { where: { id: string; clubId: string } }) =>
        people[kind].find((p) => p.id === where.id && p.clubId === where.clubId) ?? null,
    ),
  });
  const withPeople = (h: Hours) => ({
    ...h,
    member: people.member.find((p) => p.id === h.memberId) ?? null,
    contact: people.contact.find((p) => p.id === h.contactId) ?? null,
    posting: null,
  });
  const postingView = (p: Record<string, unknown> & { id: string }) => ({
    ...p,
    entry: { status: entries.find((e) => e.id === p.entryId)?.status },
    _count: { hours: hours.filter((h) => h.postingId === p.id).length },
  });

  const db = {
    club: {
      findUnique: jest.fn(async () => ({ volunteerHourlyRateCents: opts.rate ?? null })),
      update: jest.fn(async ({ data }: { data: { volunteerHourlyRateCents: number | null } }) => data),
    },
    member: person('member'),
    contact: person('contact'),
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) => ({
        code: where.clubId_code.code,
        label: `Compte ${where.clubId_code.code}`,
      })),
    },
    volunteerHours: {
      create: jest.fn(async ({ data }: { data: Omit<Hours, 'id' | 'createdAt' | 'postingId'> }) => {
        const h = { id: `h-${++seq}`, postingId: null, createdAt: new Date(), ...data } as Hours;
        hours.push(h);
        return withPeople(h);
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        hours.filter((h) => matches(h, where)),
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          hours.find((h) => matches(h, where)) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        withPeople(hours.find((h) => h.id === where.id)!),
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<Hours> }) => {
          const hit = hours.filter((h) => matches(h, where));
          hit.forEach((h) => Object.assign(h, data));
          return { count: hit.length };
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const keep = hours.filter((h) => !matches(h, where));
        const count = hours.length - keep.length;
        hours.splice(0, hours.length, ...keep);
        return { count };
      }),
    },
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { id: `e-${++seq}`, ...data };
        entries.push(e);
        return e;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const e = entries.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Line }) => {
        lines.push(data);
        return data;
      }),
    },
    volunteerHoursPosting: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: `p-${++seq}`, createdAt: new Date(), ...data };
        postings.push(p);
        return p;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        postingView(postings.find((p) => p.id === where.id)!),
      ),
      findFirst: jest.fn(async ({ where }: { where: { id: string; clubId: string } }) => {
        const p = postings.find((x) => x.id === where.id && x.clubId === where.clubId);
        if (!p) return null;
        const e = entries.find((x) => x.id === p.entryId);
        return {
          ...p,
          entry: e
            ? { id: e.id, status: opts.entryStatus ?? e.status, occurredAt: e.occurredAt }
            : null,
        };
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const i = postings.findIndex((p) => p.id === where.id);
        return postings.splice(i, 1)[0];
      }),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const period = { assertDateIsOpen: jest.fn(async () => undefined) };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new VolunteerHoursService(
    prisma as unknown as PrismaService,
    audit as unknown as AccountingAuditService,
    period as unknown as AccountingPeriodService,
  );
  return { svc, hours, lines, entries, postings, period };
}

const input = (over: Record<string, unknown> = {}) => ({
  memberId: 'm-1',
  workedOn: d('2026-10-04'),
  minutes: 90,
  activity: 'Encadrement des cours enfants',
  ...over,
});

describe('volunteerValueCents', () => {
  it('minutes × taux / 60, arrondi au centime', () => {
    expect(volunteerValueCents(90, 1_500)).toBe(2_250);
    expect(volunteerValueCents(20, 1_201)).toBe(400); // 400,33 → 400
    expect(volunteerValueCents(50, 1_201)).toBe(1_001); // 1 000,83 → 1 001
  });
});

describe('VolunteerHoursService — saisie', () => {
  it('prend le taux du club et fige la valeur', async () => {
    const { svc, hours } = makeSvc({ rate: 1_500 });
    await svc.create(CLUB, 'u-1', input());
    expect(hours[0]).toMatchObject({ hourlyRateCents: 1_500, valueCents: 2_250, minutes: 90 });
  });

  it('un taux propre à la saisie l’emporte sur celui du club', async () => {
    const { svc, hours } = makeSvc({ rate: 1_500 });
    await svc.create(CLUB, 'u-1', input({ hourlyRateCents: 3_000 }));
    expect(hours[0]).toMatchObject({ hourlyRateCents: 3_000, valueCents: 4_500 });
  });

  it('sans aucun taux, refuse', async () => {
    const { svc, hours } = makeSvc({ rate: null });
    await expect(svc.create(CLUB, 'u-1', input())).rejects.toThrow(/taux horaire/);
    expect(hours).toHaveLength(0);
  });

  it('exige exactement un bénévole, du club', async () => {
    const { svc } = makeSvc({ rate: 1_500 });
    await expect(svc.create(CLUB, 'u-1', input({ memberId: null }))).rejects.toThrow(/bénévole/);
    await expect(
      svc.create(CLUB, 'u-1', input({ contactId: 'c-1' })),
    ).rejects.toThrow(/bénévole/);
    await expect(svc.create(OTHER_CLUB, 'u-1', input())).rejects.toThrow(/introuvable/);
    await expect(
      svc.create(CLUB, 'u-1', input({ memberId: null, contactId: 'c-1' })),
    ).resolves.toMatchObject({ contactId: 'c-1' });
  });
});

describe('VolunteerHoursService — comptabilisation', () => {
  async function seed() {
    const ctx = makeSvc({ rate: 1_500 });
    const { svc } = ctx;
    await svc.create(CLUB, 'u-1', input({ minutes: 120 })); // 30 €
    await svc.create(CLUB, 'u-1', input({ minutes: 60, activity: 'Buvette tournoi' })); // 15 €
    await svc.create(CLUB, 'u-1', input({ minutes: 60, workedOn: d('2026-10-20') })); // 15 €
    // Hors période : ne doit pas être emportée.
    await svc.create(CLUB, 'u-1', input({ minutes: 600, workedOn: d('2026-11-02') }));
    return ctx;
  }

  it('une écriture en nature 864/870 équilibrée, une ligne par activité, sans banque', async () => {
    const { svc, lines, entries, hours, period } = await seed();

    const posting = await svc.post(CLUB, 'u-1', {
      periodStart: d('2026-10-01'),
      periodEnd: d('2026-10-31'),
    });

    expect(period.assertDateIsOpen).toHaveBeenCalledWith(CLUB, d('2026-10-31'));
    expect(entries[0]).toMatchObject({
      kind: 'IN_KIND',
      status: 'POSTED',
      source: 'VOLUNTEER_HOURS',
      amountCents: 6_000,
      occurredAt: d('2026-10-31'),
      financialAccountId: null,
    });
    expect(lines.map((l) => [l.accountCode, l.label ?? null, l.debitCents, l.creditCents])).toEqual([
      ['864000', 'Buvette tournoi', 1_500, 0],
      ['864000', 'Encadrement des cours enfants', 4_500, 0],
      ['870000', null, 0, 6_000],
    ]);
    expect(lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0)).toBe(0);
    expect(posting).toMatchObject({ totalCents: 6_000, totalMinutes: 240 });
    expect(hours.filter((h) => h.postingId === posting.id)).toHaveLength(3);
    expect(hours.find((h) => h.workedOn.getTime() === d('2026-11-02').getTime())!.postingId).toBeNull();
  });

  it('une heure comptabilisée ne se modifie ni ne se supprime', async () => {
    const { svc, hours } = await seed();
    await svc.post(CLUB, 'u-1', { periodStart: d('2026-10-01'), periodEnd: d('2026-10-31') });
    const posted = hours.find((h) => h.postingId)!;

    await expect(svc.update(CLUB, posted.id, input({ minutes: 30 }))).rejects.toThrow(/comptabilisées/);
    await expect(svc.remove(CLUB, posted.id)).rejects.toThrow(/comptabilisées/);
    expect(posted.minutes).not.toBe(30);
  });

  it('une période déjà comptabilisée n’a plus rien à comptabiliser', async () => {
    const { svc } = await seed();
    await svc.post(CLUB, 'u-1', { periodStart: d('2026-10-01'), periodEnd: d('2026-10-31') });
    await expect(
      svc.post(CLUB, 'u-1', { periodStart: d('2026-10-01'), periodEnd: d('2026-10-31') }),
    ).rejects.toThrow(/Aucune heure/);
  });

  it('annuler : écriture CANCELLED, heures libérées et de nouveau modifiables', async () => {
    const { svc, entries, hours, postings } = await seed();
    const posting = await svc.post(CLUB, 'u-1', {
      periodStart: d('2026-10-01'),
      periodEnd: d('2026-10-31'),
    });

    await svc.cancelPosting(CLUB, 'u-1', posting.id);

    expect(entries[0].status).toBe('CANCELLED');
    expect(postings).toHaveLength(0);
    expect(hours.every((h) => h.postingId === null)).toBe(true);
    await expect(svc.remove(CLUB, hours[0].id)).resolves.toBeUndefined();
  });

  it('période clôturée : l’annulation est refusée et rien ne bouge', async () => {
    const ctx = makeSvc({ rate: 1_500, entryStatus: 'LOCKED' });
    await ctx.svc.create(CLUB, 'u-1', input());
    const posting = await ctx.svc.post(CLUB, 'u-1', {
      periodStart: d('2026-10-01'),
      periodEnd: d('2026-10-31'),
    });

    await expect(ctx.svc.cancelPosting(CLUB, 'u-1', posting.id)).rejects.toThrow(/clôturée/);
    expect(ctx.postings).toHaveLength(1);
    expect(ctx.hours[0].postingId).toBe(posting.id);
  });
});
