import type { PrismaService } from '../prisma/prisma.service';
import {
  memberBelongsToDynamicGroup,
  resolveDynamicGroupMembers,
  resolveDynamicGroupsMemberIds,
} from './dynamic-group-membership';

/**
 * Ce que ces tests protègent : un membre coché dans un groupe depuis sa
 * fiche doit compter comme un membre qui en remplit les critères, partout
 * (compteurs, tableau de bord, campagnes, réservations). Et une fiche
 * inactive ne doit apparaître nulle part, même affectée à la main.
 */

type MemberRow = {
  id: string;
  clubId: string;
  status: 'ACTIVE' | 'INACTIVE';
  birthDate: Date | null;
  gradeLevelId: string | null;
};

function fakeDb(opts: {
  groups: Array<{ id: string; clubId: string; minAge: number | null; maxAge: number | null; gradeLevelIds: string[] }>;
  members: MemberRow[];
  assignments: Array<{ clubId: string; memberId: string; dynamicGroupId: string }>;
}) {
  return {
    dynamicGroup: {
      findFirst: async ({ where }: { where: { id: string; clubId: string } }) => {
        const g = opts.groups.find((x) => x.id === where.id && x.clubId === where.clubId);
        return g
          ? { ...g, gradeFilters: g.gradeLevelIds.map((gradeLevelId) => ({ gradeLevelId })) }
          : null;
      },
    },
    member: {
      findMany: async ({ where }: { where: { clubId: string; status: string } }) =>
        opts.members.filter((m) => m.clubId === where.clubId && m.status === where.status),
    },
    memberDynamicGroup: {
      findMany: async ({ where }: { where: { clubId: string; dynamicGroupId: string } }) =>
        opts.assignments.filter(
          (a) => a.clubId === where.clubId && a.dynamicGroupId === where.dynamicGroupId,
        ),
    },
  } as unknown as PrismaService;
}

const REF = new Date('2026-09-10T00:00:00Z');

describe('resolveDynamicGroupMembers', () => {
  const db = fakeDb({
    groups: [
      { id: 'g-enfants', clubId: 'c1', minAge: 6, maxAge: 12, gradeLevelIds: [] },
      { id: 'g-libre', clubId: 'c1', minAge: null, maxAge: null, gradeLevelIds: [] },
    ],
    members: [
      { id: 'enfant', clubId: 'c1', status: 'ACTIVE', birthDate: new Date('2018-01-01'), gradeLevelId: null },
      { id: 'adulte', clubId: 'c1', status: 'ACTIVE', birthDate: new Date('1990-01-01'), gradeLevelId: null },
      { id: 'adulte-coche', clubId: 'c1', status: 'ACTIVE', birthDate: new Date('1985-01-01'), gradeLevelId: null },
      { id: 'enfant-coche', clubId: 'c1', status: 'ACTIVE', birthDate: new Date('2017-06-01'), gradeLevelId: null },
      { id: 'inactif-coche', clubId: 'c1', status: 'INACTIVE', birthDate: new Date('2016-01-01'), gradeLevelId: null },
    ],
    assignments: [
      { clubId: 'c1', memberId: 'adulte-coche', dynamicGroupId: 'g-enfants' },
      { clubId: 'c1', memberId: 'enfant-coche', dynamicGroupId: 'g-enfants' },
      { clubId: 'c1', memberId: 'inactif-coche', dynamicGroupId: 'g-enfants' },
    ],
  });

  it('réunit critères et affectations manuelles, en nommant la source', async () => {
    const r = await resolveDynamicGroupMembers(db, 'c1', 'g-enfants', REF);
    expect([...r.entries()].sort()).toEqual([
      ['adulte-coche', 'MANUAL'],
      ['enfant', 'CRITERIA'],
      ['enfant-coche', 'BOTH'],
    ]);
  });

  it('ignore une fiche inactive même affectée à la main', async () => {
    const r = await resolveDynamicGroupMembers(db, 'c1', 'g-enfants', REF);
    expect(r.has('inactif-coche')).toBe(false);
  });

  it('un groupe sans critère contient tous les membres actifs', async () => {
    const r = await resolveDynamicGroupMembers(db, 'c1', 'g-libre', REF);
    expect([...r.keys()].sort()).toEqual(['adulte', 'adulte-coche', 'enfant', 'enfant-coche']);
  });

  it('groupe inconnu ou d’un autre club : vide', async () => {
    expect((await resolveDynamicGroupMembers(db, 'c1', 'g-x', REF)).size).toBe(0);
    expect((await resolveDynamicGroupMembers(db, 'c2', 'g-enfants', REF)).size).toBe(0);
  });

  it('union de plusieurs groupes et test d’appartenance', async () => {
    const ids = await resolveDynamicGroupsMemberIds(db, 'c1', ['g-enfants', 'g-enfants'], REF);
    expect([...ids].sort()).toEqual(['adulte-coche', 'enfant', 'enfant-coche']);
    expect(await memberBelongsToDynamicGroup(db, 'c1', 'adulte-coche', 'g-enfants', REF)).toBe(true);
    expect(await memberBelongsToDynamicGroup(db, 'c1', 'adulte', 'g-enfants', REF)).toBe(false);
  });
});
