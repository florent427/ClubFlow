import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberAccountLinkService } from './member-account-link.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * FAUX PRISMA QUI MORD.
 *
 * Un mock jest ordinaire (`updateMany: jest.fn()`) rendrait toute cette suite
 * VACUEUSE : il accepterait deux fiches portant le même compte, donc le test
 * de l'ordre détacher→attacher passerait au vert quel que soit l'ordre, et
 * il ne rejouerait aucun rollback, donc le test d'atomicité certifierait une
 * garantie inexistante. C'est exactement le piège « un test qui vérifie la
 * forme au lieu du comportement ».
 *
 * Ce faux rejoue les DEUX propriétés de PostgreSQL dont dépendent les
 * garanties du service :
 *   1. l'index UNIQUE `Member_clubId_userId_key` — rejet à l'écriture ;
 *   2. le rollback d'une transaction dont le callback lève.
 *
 * Le test « le faux mord » plus bas prouve que ces deux mécanismes sont
 * réellement actifs.
 */
type Row = {
  id: string;
  clubId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

type TxLike = {
  member: {
    updateMany: (a: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

class UniqueViolation extends Error {
  code = 'P2002';
  constructor() {
    super(
      'Unique constraint failed on the fields: (`clubId`,`userId`) [Member_clubId_userId_key]',
    );
  }
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const rv = (row as unknown as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object' && 'not' in (v as object)) {
      const not = (v as { not: unknown }).not;
      if (not === null) {
        if (rv === null) return false;
      } else if (rv === not) {
        return false;
      }
    } else if (rv !== v) {
      return false;
    }
  }
  return true;
}

class FakeDb {
  rows: Row[];
  /** Rendu public pour que le test d'arbitrage puisse aveugler la lecture. */
  findFirstHook: ((r: Row | null) => Row | null) | null = null;

  constructor(rows: Row[]) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  /** Rejoue l'index UNIQUE (clubId, userId). NULL n'est jamais en conflit. */
  private assertUnique() {
    const vus = new Set<string>();
    for (const r of this.rows) {
      if (r.userId === null) continue;
      const cle = `${r.clubId}::${r.userId}`;
      if (vus.has(cle)) throw new UniqueViolation();
      vus.add(cle);
    }
  }

  private client() {
    return {
      member: {
        findFirst: async ({
          where,
        }: {
          where: Record<string, unknown>;
          select?: unknown;
        }) => {
          const found = this.rows.find((r) => matches(r, where)) ?? null;
          return this.findFirstHook ? this.findFirstHook(found) : found;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const cibles = this.rows.filter((r) => matches(r, where));
          const avant = this.rows.map((r) => ({ ...r }));
          for (const r of cibles) Object.assign(r, data);
          try {
            this.assertUnique();
          } catch (e) {
            this.rows = avant; // la contrainte rejette l'instruction entière
            throw e;
          }
          return { count: cibles.length };
        },
      },
      user: { findMany: async () => [] },
    };
  }

  asPrisma(): PrismaService {
    const c = this.client();
    return {
      ...c,
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        const snapshot = this.rows.map((r) => ({ ...r }));
        try {
          return await cb(this.client());
        } catch (e) {
          this.rows = snapshot; // ROLLBACK
          throw e;
        }
      },
    } as unknown as PrismaService;
  }

  get(id: string) {
    return this.rows.find((r) => r.id === id)!;
  }
}

const CLUB = 'club-1';
const AUTRE_CLUB = 'club-2';
const COMPTE = 'user-florent';

function base(): FakeDb {
  return new FakeDb([
    {
      id: 'm-demo',
      clubId: CLUB,
      userId: COMPTE,
      firstName: 'Compte',
      lastName: 'Portail démo',
      email: 'florent@example.com',
    },
    {
      id: 'm-vraie',
      clubId: CLUB,
      userId: null,
      firstName: 'Florent',
      lastName: 'Morel',
      email: 'florent@example.com',
    },
    {
      id: 'm-libre',
      clubId: CLUB,
      userId: null,
      firstName: 'Jeanne',
      lastName: 'Dupont',
      email: 'jeanne@example.com',
    },
    {
      id: 'm-autre-club',
      clubId: AUTRE_CLUB,
      userId: 'user-tiers',
      firstName: 'Paul',
      lastName: 'Ailleurs',
      email: 'paul@example.com',
    },
  ]);
}

function svc(db: FakeDb) {
  const s = new MemberAccountLinkService(db.asPrisma());
  // Silence des logs attendus (déplacement confirmé).
  jest.spyOn((s as unknown as { log: { warn: jest.Mock } }).log, 'warn')
    .mockImplementation(() => undefined);
  return s;
}

describe('FakeDb — le faux mord', () => {
  it('rejette deux fiches du même club portant le même compte', async () => {
    const db = base();
    await expect(
      db.asPrisma().member.updateMany({
        where: { id: 'm-vraie' },
        data: { userId: COMPTE },
      }),
    ).rejects.toThrow(/Unique constraint/);
    // et l'écriture rejetée n'a rien laissé derrière elle
    expect(db.get('m-vraie').userId).toBeNull();
  });

  it('deux fiches sans compte ne sont PAS en conflit (NULL est libre)', async () => {
    const db = base();
    await expect(
      db.asPrisma().member.updateMany({
        where: { id: 'm-demo' },
        data: { userId: null },
      }),
    ).resolves.toEqual({ count: 1 });
  });

  it('une transaction qui lève est annulée', async () => {
    const db = base();
    const prisma = db.asPrisma() as unknown as {
      $transaction: (cb: (tx: TxLike) => Promise<unknown>) => Promise<unknown>;
    };
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.member.updateMany({
          where: { id: 'm-demo' },
          data: { userId: null },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.get('m-demo').userId).toBe(COMPTE);
  });
});

describe('MemberAccountLinkService.link', () => {
  it('rattache une fiche libre à un compte libre', async () => {
    const db = base();
    await svc(db).link(CLUB, { memberId: 'm-libre', userId: 'user-jeanne' });
    expect(db.get('m-libre').userId).toBe('user-jeanne');
  });

  it('est idempotent : re-rattacher le compte déjà porté ne casse rien', async () => {
    const db = base();
    await svc(db).link(CLUB, { memberId: 'm-demo', userId: COMPTE });
    expect(db.get('m-demo').userId).toBe(COMPTE);
  });

  // ---------------------------------------------------------------
  // GARANTIE 1 — pas de vol silencieux
  // ---------------------------------------------------------------

  it('REFUSE de voler un compte déjà rattaché, et NOMME la fiche en conflit', async () => {
    const db = base();
    await expect(
      svc(db).link(CLUB, { memberId: 'm-vraie', userId: COMPTE }),
    ).rejects.toThrow(ConflictException);
    await expect(
      svc(db).link(CLUB, { memberId: 'm-vraie', userId: COMPTE }),
    ).rejects.toThrow(/Compte Portail démo/);
  });

  it('confirmMove:false n’est PAS une confirmation', async () => {
    const db = base();
    await expect(
      svc(db).link(CLUB, {
        memberId: 'm-vraie',
        userId: COMPTE,
        confirmMove: false,
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.get('m-demo').userId).toBe(COMPTE);
    expect(db.get('m-vraie').userId).toBeNull();
  });

  it('l’arbitrage est le COUNT de l’écriture, pas la lecture diagnostique', async () => {
    // On aveugle la lecture qui sert à nommer la fiche. Le refus doit tomber
    // quand même — sinon c'est que la garantie repose sur un findFirst, ce que
    // l'ADR-0003 interdit précisément (pas de CHECK, pas de trigger : seul le
    // prédicat d'un updateMany arbitre).
    const db = base();
    db.findFirstHook = () => null;
    const p = svc(db).link(CLUB, { memberId: 'm-vraie', userId: COMPTE });
    await expect(p).rejects.toThrow(ConflictException);
    await expect(p.catch((e: Error) => e.message)).resolves.toMatch(
      /une autre fiche du club/,
    );
    expect(db.get('m-demo').userId).toBe(COMPTE);
  });

  // ---------------------------------------------------------------
  // GARANTIE 2 — atomicité du déplacement
  // ---------------------------------------------------------------

  it('le refus n’a RIEN détaché : le compte reste sur la fiche d’origine', async () => {
    const db = base();
    await expect(
      svc(db).link(CLUB, { memberId: 'm-vraie', userId: COMPTE }),
    ).rejects.toThrow(ConflictException);
    // Sans transaction (ou sans rollback), le détachement aurait été committé
    // et le propriétaire se retrouverait sans AUCUNE fiche : pire que l'état
    // initial.
    expect(db.get('m-demo').userId).toBe(COMPTE);
  });

  it('déplace le lien d’un seul geste quand confirmMove est true', async () => {
    const db = base();
    await svc(db).link(CLUB, {
      memberId: 'm-vraie',
      userId: COMPTE,
      confirmMove: true,
    });
    // Le compte a changé de fiche, et il n'est jamais porté par deux fiches :
    // le faux aurait levé P2002 si l'attachement précédait le détachement.
    expect(db.get('m-demo').userId).toBeNull();
    expect(db.get('m-vraie').userId).toBe(COMPTE);
  });

  it('l’ordre détacher→attacher tient même si la fiche cible portait déjà un autre compte', async () => {
    const db = base();
    db.get('m-vraie').userId = 'user-ancien';
    await svc(db).link(CLUB, {
      memberId: 'm-vraie',
      userId: COMPTE,
      confirmMove: true,
    });
    expect(db.get('m-demo').userId).toBeNull();
    expect(db.get('m-vraie').userId).toBe(COMPTE);
  });

  // ---------------------------------------------------------------
  // GARANTIE 3 — le clubId est DANS l'écriture
  // ---------------------------------------------------------------

  it('ne rattache pas une fiche d’un autre club', async () => {
    const db = base();
    await expect(
      svc(db).link(CLUB, { memberId: 'm-autre-club', userId: 'user-x' }),
    ).rejects.toThrow(NotFoundException);
    expect(db.get('m-autre-club').userId).toBe('user-tiers');
  });

  it('ne détache pas la fiche d’un autre club qui porte le même compte', async () => {
    const db = base();
    // Le compte est porté par une fiche de l'AUTRE club : ce n'est pas un
    // conflit (l'unicité est par club), et surtout on ne doit pas y toucher.
    db.get('m-demo').userId = null;
    db.get('m-autre-club').userId = COMPTE;
    await svc(db).link(CLUB, { memberId: 'm-vraie', userId: COMPTE });
    expect(db.get('m-vraie').userId).toBe(COMPTE);
    expect(db.get('m-autre-club').userId).toBe(COMPTE);
  });
});

describe('MemberAccountLinkService.unlink', () => {
  it('détache une fiche rattachée', async () => {
    const db = base();
    await svc(db).unlink(CLUB, 'm-demo');
    expect(db.get('m-demo').userId).toBeNull();
  });

  it('refuse de détacher une fiche qui n’a aucun compte', async () => {
    const db = base();
    await expect(svc(db).unlink(CLUB, 'm-vraie')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ne détache pas la fiche d’un autre club (clubId dans l’écriture)', async () => {
    const db = base();
    await expect(svc(db).unlink(CLUB, 'm-autre-club')).rejects.toThrow(
      NotFoundException,
    );
    expect(db.get('m-autre-club').userId).toBe('user-tiers');
  });
});
