import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma, SystemRole } from '@prisma/client';
import { ClubTeamService } from './club-team.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * FAUX PRISMA QUI MORD.
 *
 * Un mock jest ordinaire (`deleteMany: jest.fn()`) rendrait toute cette suite
 * VACUEUSE : il accepterait n'importe quel `where`, donc les deux garde-fous
 * passeraient au vert même retirés du prédicat, et il ne rejouerait ni le
 * verrou ni le rollback, donc le test de course certifierait une garantie
 * inexistante. C'est exactement le piège « un test qui vérifie la forme au
 * lieu du comportement ».
 *
 * Ce faux rejoue les QUATRE propriétés de PostgreSQL dont dépendent les
 * garanties du service :
 *   1. l'évaluation réelle du `where` — y compris `OR`, `{ not: … }` et le
 *      `EXISTS` corrélé qu'engendre `club.memberships.some` ;
 *   2. l'index UNIQUE `ClubMembership_userId_clubId_key` ;
 *   3. le rollback d'une transaction dont le callback lève ;
 *   4. `pg_advisory_xact_lock` — une exclusion mutuelle par clé, tenue
 *      jusqu'à la fin de la transaction.
 *
 * Et il rejoue surtout l'ENTRELACEMENT de READ COMMITTED : `deleteMany` /
 * `updateMany` évaluent leur prédicat, PUIS cèdent la main (`barriere`), PUIS
 * appliquent. Sans cette fenêtre, aucune course ne serait observable et le
 * test de concurrence serait décoratif.
 *
 * Le bloc « le faux mord » plus bas prouve que ces mécanismes sont actifs.
 */

type MembershipRow = {
  id: string;
  clubId: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  systemRole: SystemRole | null;
};

/**
 * La VRAIE classe d'erreur Prisma, pas un sosie : le service teste
 * `instanceof PrismaClientKnownRequestError`. Un faux avec seulement
 * `code = 'P2002'` traverserait le catch et laisserait remonter une 500 —
 * le doublon ne serait jamais nommé, et le test le prouve.
 */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`userId`,`clubId`) [ClubMembership_userId_clubId_key]',
    { code: 'P2002', clientVersion: 'faux' },
  );
}

/**
 * Évalue un `where` Prisma sur une ligne. Volontairement partiel — mais il
 * couvre EXACTEMENT les formes que le service émet, sinon il ne prouverait
 * rien : `OR`, `{ not: x }`, et la relation `club.memberships.some`.
 */
function matches(
  row: MembershipRow,
  where: Record<string, unknown>,
  toutes: MembershipRow[],
): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      const branches = v as Record<string, unknown>[];
      if (!branches.some((b) => matches(row, b, toutes))) return false;
      continue;
    }
    if (k === 'club') {
      // `club: { memberships: { some: {…} } }` — le EXISTS corrélé. La
      // corrélation est le clubId de la LIGNE, pas un paramètre : c'est ce
      // qui fait du prédicat un test « il reste un autre admin ICI ».
      const some = (
        (v as { memberships?: { some?: Record<string, unknown> } }).memberships
          ?.some ?? {}
      ) as Record<string, unknown>;
      const ok = toutes.some(
        (r) => r.clubId === row.clubId && matches(r, some, toutes),
      );
      if (!ok) return false;
      continue;
    }
    const rv = (row as unknown as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object' && 'not' in (v as object)) {
      if (rv === (v as { not: unknown }).not) return false;
    } else if (rv !== v) {
      return false;
    }
  }
  return true;
}

class FakeDb {
  memberships: MembershipRow[];
  users: UserRow[];
  /** Verrous d'avis, par clé. Rendus publics pour l'inspection des tests. */
  private locks = new Map<string, Promise<void>>();
  /** Point d'entrelacement : appelé APRÈS l'évaluation du prédicat. */
  barriere: (() => Promise<void>) | null = null;
  /** Aveuglement de la lecture diagnostique (test d'arbitrage). */
  findFirstAveugle = false;

  constructor(memberships: MembershipRow[], users: UserRow[]) {
    this.memberships = memberships.map((r) => ({ ...r }));
    this.users = users.map((u) => ({ ...u }));
  }

  private assertUnique() {
    const vus = new Set<string>();
    for (const r of this.memberships) {
      const cle = `${r.userId}::${r.clubId}`;
      if (vus.has(cle)) throw uniqueViolation();
      vus.add(cle);
    }
  }

  /** Exclusion mutuelle par clé, libérée par la fonction retournée. */
  private async acquerir(cle: string): Promise<() => void> {
    const precedent = this.locks.get(cle) ?? Promise.resolve();
    let liberer!: () => void;
    const attente = new Promise<void>((r) => {
      liberer = r;
    });
    this.locks.set(
      cle,
      precedent.then(() => attente),
    );
    await precedent;
    return liberer;
  }

  private client(ctx: { relachers: (() => void)[] }) {
    const self = this;
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('pg_advisory_xact_lock')) {
          const cle = `club-team::${String(values[0])}`;
          ctx.relachers.push(await self.acquerir(cle));
          return [{}];
        }
        throw new Error(`SQL brut non modélisé par le faux : ${sql}`);
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          self.users.find((u) => u.id === where.id) ?? null,
        findFirst: async ({
          where,
        }: {
          where: { email: { equals: string; mode: string } };
        }) => {
          const cible = where.email.equals.toLowerCase();
          return (
            self.users.find((u) => u.email.toLowerCase() === cible) ?? null
          );
        },
      },
      clubMembership: {
        findUnique: async ({
          where,
        }: {
          where: { userId_clubId: { userId: string; clubId: string } };
        }) =>
          self.memberships.find(
            (r) =>
              r.userId === where.userId_clubId.userId &&
              r.clubId === where.userId_clubId.clubId,
          ) ?? null,
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          if (self.findFirstAveugle) return null;
          const r =
            self.memberships.find((m) => matches(m, where, self.memberships)) ??
            null;
          return r ? { ...r, user: self.userOf(r.userId) } : null;
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          self.memberships
            .filter((m) => matches(m, where, self.memberships))
            .sort(
              (a, b) =>
                a.role.localeCompare(b.role) ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .map((r) => ({ ...r, user: self.userOf(r.userId) })),
        create: async ({
          data,
        }: {
          data: Omit<MembershipRow, 'id' | 'createdAt'>;
        }) => {
          const row: MembershipRow = {
            id: `ms-${self.memberships.length + 1}`,
            createdAt: new Date('2026-07-20T10:00:00Z'),
            ...data,
          };
          const avant = self.memberships;
          self.memberships = [...avant, row];
          try {
            self.assertUnique();
          } catch (e) {
            self.memberships = avant;
            throw e;
          }
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const cibles = self.memberships.filter((m) =>
            matches(m, where, self.memberships),
          );
          if (self.barriere) await self.barriere();
          const avant = self.memberships.map((r) => ({ ...r }));
          for (const r of cibles) Object.assign(r, data);
          try {
            self.assertUnique();
          } catch (e) {
            self.memberships = avant;
            throw e;
          }
          return { count: cibles.length };
        },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const cibles = self.memberships.filter((m) =>
            matches(m, where, self.memberships),
          );
          if (self.barriere) await self.barriere();
          self.memberships = self.memberships.filter(
            (m) => !cibles.includes(m),
          );
          return { count: cibles.length };
        },
      },
    };
  }

  private userOf(userId: string) {
    const u = this.users.find((x) => x.id === userId);
    return u ? { email: u.email, displayName: u.displayName } : null;
  }

  asPrisma(): PrismaService {
    const hors = this.client({ relachers: [] });
    return {
      ...hors,
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        const ctx = { relachers: [] as (() => void)[] };
        const snapshot = this.memberships.map((r) => ({ ...r }));
        try {
          return await cb(this.client(ctx));
        } catch (e) {
          this.memberships = snapshot; // ROLLBACK
          throw e;
        } finally {
          // Le verrou est `xact` : il tombe à la fin de la transaction, pas
          // avant. Le relâcher plus tôt rouvrirait la course.
          for (const r of ctx.relachers) r();
        }
      },
    } as unknown as PrismaService;
  }

  admins(clubId: string) {
    return this.memberships.filter(
      (m) => m.clubId === clubId && m.role === MembershipRole.CLUB_ADMIN,
    );
  }

  get(id: string) {
    return this.memberships.find((m) => m.id === id) ?? null;
  }
}

// ---------------------------------------------------------------------
// Jeu de données
// ---------------------------------------------------------------------

const CLUB = 'club-1';
const AUTRE_CLUB = 'club-2';
const T0 = new Date('2026-01-01T00:00:00Z');

const U_FLORENT = 'u-florent'; // CLUB_ADMIN de CLUB — l'acteur par défaut
const U_JEANNE = 'u-jeanne'; // CLUB_ADMIN de CLUB
const U_PAUL = 'u-paul'; // TREASURER de CLUB
const U_ROOT = 'u-root'; // admin SYSTÈME, aucun ClubMembership
const U_SANS = 'u-sans'; // compte existant, aucun accès
const U_TIERS = 'u-tiers'; // CLUB_ADMIN de l'AUTRE club

function utilisateurs(): UserRow[] {
  return [
    {
      id: U_FLORENT,
      email: 'florent@example.com',
      displayName: 'Florent Morel',
      systemRole: null,
    },
    {
      id: U_JEANNE,
      email: 'Jeanne@Example.com',
      displayName: 'Jeanne Dupont',
      systemRole: null,
    },
    {
      id: U_PAUL,
      email: 'paul@example.com',
      displayName: 'Paul Trésor',
      systemRole: null,
    },
    {
      id: U_ROOT,
      email: 'admin@clubflow.local',
      displayName: 'Root',
      systemRole: SystemRole.SUPER_ADMIN,
    },
    {
      id: U_SANS,
      email: 'sans-acces@example.com',
      displayName: 'Sans Accès',
      systemRole: null,
    },
    {
      id: U_TIERS,
      email: 'tiers@example.com',
      displayName: 'Tiers Ailleurs',
      systemRole: null,
    },
  ];
}

/** Deux administrateurs dans CLUB — donc chacun est retirable. */
function deuxAdmins(): FakeDb {
  return new FakeDb(
    [
      {
        id: 'ms-florent',
        clubId: CLUB,
        userId: U_FLORENT,
        role: MembershipRole.CLUB_ADMIN,
        createdAt: T0,
      },
      {
        id: 'ms-jeanne',
        clubId: CLUB,
        userId: U_JEANNE,
        role: MembershipRole.CLUB_ADMIN,
        createdAt: T0,
      },
      {
        id: 'ms-paul',
        clubId: CLUB,
        userId: U_PAUL,
        role: MembershipRole.TREASURER,
        createdAt: T0,
      },
      {
        id: 'ms-tiers',
        clubId: AUTRE_CLUB,
        userId: U_TIERS,
        role: MembershipRole.CLUB_ADMIN,
        createdAt: T0,
      },
      // Accès NON administrateur de l'autre club. Il existe pour une seule
      // raison : c'est la seule ligne que le retrait pourrait effacer si le
      // `clubId` sortait de l'écriture — `ms-tiers`, étant le dernier
      // administrateur de SON club, serait protégé par l'autre garde-fou et
      // ferait passer le test pour une mauvaise raison.
      {
        id: 'ms-tiers-staff',
        clubId: AUTRE_CLUB,
        userId: U_SANS,
        role: MembershipRole.STAFF,
        createdAt: T0,
      },
    ],
    utilisateurs(),
  );
}

/** L'état de la PRODUCTION : un seul administrateur, son créateur. */
function unSeulAdmin(): FakeDb {
  const db = deuxAdmins();
  db.memberships = db.memberships.filter((m) => m.id !== 'ms-jeanne');
  return db;
}

function svc(db: FakeDb) {
  const s = new ClubTeamService(db.asPrisma());
  jest
    .spyOn((s as unknown as { log: { log: jest.Mock } }).log, 'log')
    .mockImplementation(() => undefined);
  return s;
}

// ---------------------------------------------------------------------
// Le faux mord
// ---------------------------------------------------------------------

describe('FakeDb — le faux mord', () => {
  it('évalue vraiment le OR + le EXISTS corrélé (club.memberships.some)', () => {
    const db = unSeulAdmin();
    const predicat = {
      id: 'ms-florent',
      clubId: CLUB,
      OR: [
        { role: { not: MembershipRole.CLUB_ADMIN } },
        {
          club: {
            memberships: {
              some: {
                role: MembershipRole.CLUB_ADMIN,
                id: { not: 'ms-florent' },
              },
            },
          },
        },
      ],
    };
    // Seul admin : le prédicat ne doit PAS matcher.
    expect(matches(db.get('ms-florent')!, predicat, db.memberships)).toBe(
      false,
    );
    // Ajoutons un second admin : il doit matcher.
    const db2 = deuxAdmins();
    expect(matches(db2.get('ms-florent')!, predicat, db2.memberships)).toBe(
      true,
    );
  });

  it('le EXISTS est corrélé au CLUB de la ligne, pas global', () => {
    // L'autre club a un CLUB_ADMIN ; il ne doit jamais sauver celui-ci.
    const db = unSeulAdmin();
    expect(db.admins(AUTRE_CLUB)).toHaveLength(1);
    expect(
      matches(
        db.get('ms-florent')!,
        {
          club: {
            memberships: {
              some: {
                role: MembershipRole.CLUB_ADMIN,
                id: { not: 'ms-florent' },
              },
            },
          },
        },
        db.memberships,
      ),
    ).toBe(false);
  });

  it('rejette deux accès du même compte au même club (index unique)', async () => {
    const db = deuxAdmins();
    await expect(
      db.asPrisma().clubMembership.create({
        data: {
          clubId: CLUB,
          userId: U_FLORENT,
          role: MembershipRole.STAFF,
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
    expect(db.memberships.filter((m) => m.userId === U_FLORENT)).toHaveLength(
      1,
    );
  });

  it('une transaction qui lève est annulée', async () => {
    const db = deuxAdmins();
    const prisma = db.asPrisma() as unknown as {
      $transaction: (cb: (tx: never) => Promise<unknown>) => Promise<unknown>;
    };
    await expect(
      prisma.$transaction(async (tx: never) => {
        await (
          tx as unknown as {
            clubMembership: {
              deleteMany: (a: unknown) => Promise<{ count: number }>;
            };
          }
        ).clubMembership.deleteMany({ where: { id: 'ms-jeanne' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.get('ms-jeanne')).not.toBeNull();
  });

  it('pg_advisory_xact_lock exclut réellement, jusqu’à la FIN de la transaction', async () => {
    const db = deuxAdmins();
    const prisma = db.asPrisma() as unknown as {
      $transaction: (
        cb: (tx: {
          $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
        }) => Promise<unknown>,
      ) => Promise<unknown>;
    };
    const journal: string[] = [];
    const lock = async (nom: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('clubflow:club-team'), hashtext(${CLUB}))`;
        journal.push(`${nom}:entre`);
        for (let i = 0; i < 20; i++) await Promise.resolve();
        journal.push(`${nom}:sort`);
      });
    await Promise.all([lock('A'), lock('B')]);
    // Aucun entrelacement : A entre et sort avant que B entre.
    expect(journal).toEqual(['A:entre', 'A:sort', 'B:entre', 'B:sort']);
  });

  it('la barrière ouvre bien une fenêtre d’entrelacement', async () => {
    // Sans le verrou, deux deleteMany concurrents évaluent leur prédicat
    // AVANT que l'un ait appliqué : c'est ce que ce faux doit reproduire,
    // sinon le test de course ne prouverait rien.
    const db = deuxAdmins();
    db.barriere = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    const cm = db.asPrisma().clubMembership;
    const p = { role: MembershipRole.CLUB_ADMIN, clubId: CLUB };
    const [a, b] = await Promise.all([
      cm.deleteMany({ where: { ...p, id: 'ms-florent' } }),
      cm.deleteMany({ where: { ...p, id: 'ms-jeanne' } }),
    ]);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });
});

// ---------------------------------------------------------------------
// GARANTIE 1 — le dernier administrateur est protégé
// ---------------------------------------------------------------------

describe('ClubTeamService — dernier administrateur', () => {
  it('REFUSE de retirer le dernier administrateur, et le dit', async () => {
    const db = unSeulAdmin();
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-florent'),
    ).rejects.toThrow(ConflictException);
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-florent'),
    ).rejects.toThrow(/dernier administrateur/);
    expect(db.admins(CLUB)).toHaveLength(1);
  });

  it('REFUSE de rétrograder le dernier administrateur', async () => {
    const db = unSeulAdmin();
    await expect(
      svc(db).setRole(CLUB, U_ROOT, {
        membershipId: 'ms-florent',
        role: MembershipRole.TREASURER,
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.get('ms-florent')!.role).toBe(MembershipRole.CLUB_ADMIN);
  });

  it('autorise le retrait quand il reste un AUTRE administrateur', async () => {
    const db = deuxAdmins();
    await svc(db).remove(CLUB, U_ROOT, 'ms-florent');
    expect(db.get('ms-florent')).toBeNull();
    expect(db.admins(CLUB)).toHaveLength(1);
  });

  it('autorise la rétrogradation quand il reste un AUTRE administrateur', async () => {
    const db = deuxAdmins();
    await svc(db).setRole(CLUB, U_ROOT, {
      membershipId: 'ms-jeanne',
      role: MembershipRole.STAFF,
    });
    expect(db.get('ms-jeanne')!.role).toBe(MembershipRole.STAFF);
  });

  it('un non-administrateur se retire sans condition (le prédicat ne mord que les admins)', async () => {
    const db = unSeulAdmin();
    await svc(db).remove(CLUB, U_ROOT, 'ms-paul');
    expect(db.get('ms-paul')).toBeNull();
  });

  it('un administrateur d’un AUTRE club ne sauve pas le dernier admin d’ici', async () => {
    const db = unSeulAdmin();
    expect(db.admins(AUTRE_CLUB)).toHaveLength(1); // il existe, ailleurs
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-florent'),
    ).rejects.toThrow(ConflictException);
    expect(db.admins(CLUB)).toHaveLength(1);
  });

  it('promouvoir administrateur n’est jamais bloqué par la règle du dernier admin', async () => {
    const db = unSeulAdmin();
    await svc(db).setRole(CLUB, U_ROOT, {
      membershipId: 'ms-paul',
      role: MembershipRole.CLUB_ADMIN,
    });
    expect(db.admins(CLUB)).toHaveLength(2);
  });

  it('l’arbitrage est le COUNT de l’écriture, pas la lecture diagnostique', async () => {
    // On aveugle la lecture qui sert à NOMMER la cause. Le refus doit tomber
    // quand même — sinon la garantie reposerait sur un findFirst, ce que
    // l'ADR-0003 interdit précisément.
    const db = unSeulAdmin();
    db.findFirstAveugle = true;
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-florent'),
    ).rejects.toThrow(NotFoundException);
    expect(db.admins(CLUB)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// GARANTIE 2 — personne ne se retire ni ne se rétrograde soi-même
// ---------------------------------------------------------------------

describe('ClubTeamService — soi-même', () => {
  it('REFUSE de se retirer soi-même, même s’il reste d’autres administrateurs', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).remove(CLUB, U_FLORENT, 'ms-florent'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc(db).remove(CLUB, U_FLORENT, 'ms-florent'),
    ).rejects.toThrow(/votre propre accès/);
    expect(db.get('ms-florent')).not.toBeNull();
  });

  it('REFUSE de se rétrograder soi-même', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).setRole(CLUB, U_FLORENT, {
        membershipId: 'ms-florent',
        role: MembershipRole.STAFF,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.get('ms-florent')!.role).toBe(MembershipRole.CLUB_ADMIN);
  });

  it('REFUSE de se re-promouvoir soi-même (aucune écriture sur son propre accès)', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).setRole(CLUB, U_FLORENT, {
        membershipId: 'ms-florent',
        role: MembershipRole.CLUB_ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('mais un AUTRE administrateur peut le retirer', async () => {
    const db = deuxAdmins();
    await svc(db).remove(CLUB, U_JEANNE, 'ms-florent');
    expect(db.get('ms-florent')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// GARANTIE 3 — la course concurrente est fermée
// ---------------------------------------------------------------------

describe('ClubTeamService — deux retraits concurrents', () => {
  /**
   * LE test. Deux administrateurs, deux retraits lancés ensemble.
   *
   * Le faux ouvre une fenêtre entre l'évaluation du prédicat et son
   * application : sans le verrou, chacun verrait « il reste l'autre » et le
   * club finirait à ZÉRO administrateur — irrécupérable sans accès à la base.
   *
   * Le verrou sérialise ; le second retrait réévalue alors son `EXISTS` sur
   * l'état laissé par le premier, ne trouve plus d'autre administrateur, et
   * son `count` vaut 0. L'arbitre reste le count.
   */
  it('ne laisse JAMAIS le club à zéro administrateur', async () => {
    const db = deuxAdmins();
    db.barriere = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    const s = svc(db);

    const issues = await Promise.allSettled([
      s.remove(CLUB, U_ROOT, 'ms-florent'),
      s.remove(CLUB, U_ROOT, 'ms-jeanne'),
    ]);

    expect(db.admins(CLUB).length).toBeGreaterThanOrEqual(1);
    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    const refus = issues.find((i) => i.status === 'rejected');
    expect((refus as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
  });

  it('même course sur la RÉTROGRADATION : il reste un administrateur', async () => {
    const db = deuxAdmins();
    db.barriere = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    const s = svc(db);

    const issues = await Promise.allSettled([
      s.setRole(CLUB, U_ROOT, {
        membershipId: 'ms-florent',
        role: MembershipRole.STAFF,
      }),
      s.setRole(CLUB, U_ROOT, {
        membershipId: 'ms-jeanne',
        role: MembershipRole.STAFF,
      }),
    ]);

    expect(db.admins(CLUB).length).toBeGreaterThanOrEqual(1);
    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
  });

  it('retrait + rétrogradation concurrents : il reste un administrateur', async () => {
    const db = deuxAdmins();
    db.barriere = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    const s = svc(db);

    await Promise.allSettled([
      s.remove(CLUB, U_ROOT, 'ms-florent'),
      s.setRole(CLUB, U_ROOT, {
        membershipId: 'ms-jeanne',
        role: MembershipRole.COACH,
      }),
    ]);

    expect(db.admins(CLUB).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------
// GARANTIE 4 — le clubId est DANS l'écriture
// ---------------------------------------------------------------------

describe('ClubTeamService — frontière multi-tenant', () => {
  it('ne retire pas un accès d’un autre club', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-tiers'),
    ).rejects.toThrow(NotFoundException);
    expect(db.get('ms-tiers')).not.toBeNull();
  });

  it('ne retire pas un accès NON-admin d’un autre club (rien d’autre ne le protège)', async () => {
    // `ms-tiers-staff` n'est protégé ni par « pas soi-même » ni par « dernier
    // admin » : SEUL le clubId de l'écriture l'empêche d'être effacé.
    const db = deuxAdmins();
    await expect(
      svc(db).remove(CLUB, U_ROOT, 'ms-tiers-staff'),
    ).rejects.toThrow(NotFoundException);
    expect(db.get('ms-tiers-staff')).not.toBeNull();
  });

  it('ne change pas le rôle d’un accès d’un autre club', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).setRole(CLUB, U_ROOT, {
        membershipId: 'ms-tiers',
        role: MembershipRole.STAFF,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(db.get('ms-tiers')!.role).toBe(MembershipRole.CLUB_ADMIN);
  });

  it('ne change pas le rôle d’un accès NON-admin d’un autre club', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).setRole(CLUB, U_ROOT, {
        membershipId: 'ms-tiers-staff',
        role: MembershipRole.CLUB_ADMIN,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(db.get('ms-tiers-staff')!.role).toBe(MembershipRole.STAFF);
  });

  it('l’invitation crée l’accès dans le club COURANT', async () => {
    const db = deuxAdmins();
    const cree = await svc(db).invite(CLUB, U_FLORENT, {
      email: 'sans-acces@example.com',
      role: MembershipRole.BOARD,
    });
    expect(db.get(cree.membershipId)!.clubId).toBe(CLUB);
    expect(db.get(cree.membershipId)!.userId).toBe(U_SANS);
  });
});

// ---------------------------------------------------------------------
// Invitation
// ---------------------------------------------------------------------

describe('ClubTeamService.invite', () => {
  it('accorde l’accès à un compte existant', async () => {
    const db = deuxAdmins();
    const r = await svc(db).invite(CLUB, U_FLORENT, {
      email: 'sans-acces@example.com',
      role: MembershipRole.COACH,
    });
    expect(r.role).toBe(MembershipRole.COACH);
    expect(r.email).toBe('sans-acces@example.com');
    expect(db.get(r.membershipId)).not.toBeNull();
  });

  it('SIGNALE un e-mail inconnu au lieu d’échouer en silence', async () => {
    const db = deuxAdmins();
    const p = svc(db).invite(CLUB, U_FLORENT, {
      email: 'inconnu@example.com',
      role: MembershipRole.STAFF,
    });
    await expect(p).rejects.toThrow(NotFoundException);
    await expect(p.catch((e: Error) => e.message)).resolves.toMatch(
      /Aucun compte ClubFlow.*inconnu@example\.com/s,
    );
    // et RIEN n'a été créé
    expect(db.memberships).toHaveLength(5);
  });

  it('normalise casse et espaces (l’e-mail saisi à la main)', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).invite(CLUB, U_FLORENT, {
        email: '  SANS-Acces@Example.COM ',
        role: MembershipRole.STAFF,
      }),
    ).resolves.toMatchObject({ userId: U_SANS });
  });

  it('refuse un doublon — et c’est l’index unique qui tranche', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).invite(CLUB, U_FLORENT, {
        email: 'paul@example.com',
        role: MembershipRole.STAFF,
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.get('ms-paul')!.role).toBe(MembershipRole.TREASURER);
  });

  it('le même compte peut avoir un accès dans DEUX clubs différents', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).invite(CLUB, U_FLORENT, {
        email: 'tiers@example.com',
        role: MembershipRole.STAFF,
      }),
    ).resolves.toMatchObject({ userId: U_TIERS });
  });
});

// ---------------------------------------------------------------------
// Autorisation : les écritures sont réservées à l'administrateur
// ---------------------------------------------------------------------

describe('ClubTeamService — qui peut écrire', () => {
  it('un TRÉSORIER ne peut pas inviter', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).invite(CLUB, U_PAUL, {
        email: 'sans-acces@example.com',
        role: MembershipRole.CLUB_ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.memberships).toHaveLength(5);
  });

  it('un TRÉSORIER ne peut pas se promouvoir administrateur', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).setRole(CLUB, U_PAUL, {
        membershipId: 'ms-paul',
        role: MembershipRole.CLUB_ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.get('ms-paul')!.role).toBe(MembershipRole.TREASURER);
  });

  it('un TRÉSORIER ne peut pas retirer un administrateur', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).remove(CLUB, U_PAUL, 'ms-florent'),
    ).rejects.toThrow(ForbiddenException);
    expect(db.get('ms-florent')).not.toBeNull();
  });

  it('un compte SANS accès au club ne peut rien écrire', async () => {
    const db = deuxAdmins();
    await expect(
      svc(db).remove(CLUB, U_SANS, 'ms-paul'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un administrateur SYSTÈME peut écrire (recours de la plateforme)', async () => {
    const db = deuxAdmins();
    await svc(db).remove(CLUB, U_ROOT, 'ms-paul');
    expect(db.get('ms-paul')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------

describe('ClubTeamService.list', () => {
  it('ne liste que le club demandé, avec e-mail et nom', async () => {
    const rows = await svc(deuxAdmins()).list(CLUB, U_FLORENT);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.email).sort()).toEqual([
      'Jeanne@Example.com',
      'florent@example.com',
      'paul@example.com',
    ]);
  });

  it('marque « soi-même »', async () => {
    const rows = await svc(deuxAdmins()).list(CLUB, U_FLORENT);
    expect(rows.filter((r) => r.isSelf).map((r) => r.membershipId)).toEqual([
      'ms-florent',
    ]);
  });

  it('marque le dernier administrateur — et LUI SEUL', async () => {
    const seul = await svc(unSeulAdmin()).list(CLUB, U_ROOT);
    expect(seul.filter((r) => r.isLastAdmin).map((r) => r.membershipId)).toEqual(
      ['ms-florent'],
    );
    // À deux administrateurs, plus personne n'est « le dernier ».
    const deux = await svc(deuxAdmins()).list(CLUB, U_ROOT);
    expect(deux.filter((r) => r.isLastAdmin)).toHaveLength(0);
  });
});
