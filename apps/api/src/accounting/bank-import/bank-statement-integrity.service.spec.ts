import { BankStatementIntegrityService } from './bank-statement-integrity.service';

/**
 * Le chaînage d'un relevé, et l'exception du relevé SYNTHÉTISÉ.
 *
 * Un relevé reçu se chaîne sur le précédent : si son solde de début ne
 * correspond pas, quelque chose manque, et c'est bloquant. Un relevé bâti
 * par ClubFlow depuis l'API Stripe n'a rien à vérifier de ce côté — c'est
 * ClubFlow qui a choisi son solde de début — et afficher « à vérifier »
 * enverrait le trésorier corriger un relevé sans fichier d'origine.
 */

const CLUB = 'club-1';

function makeWorld(
  st: {
    format?: string;
    openingBalanceCents?: number;
    closingBalanceCents?: number;
    lineAmounts?: number[];
    accountOpeningCents?: number | null;
  } = {},
  previous: { closingBalanceCents: number } | null = null,
) {
  const statement = {
    id: 'st-1',
    clubId: CLUB,
    financialAccountId: 'fa-1',
    format: st.format ?? 'CSV',
    status: 'READY',
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    openingBalanceCents: st.openingBalanceCents ?? 0,
    closingBalanceCents: st.closingBalanceCents ?? -4000,
    financialAccount: { openingBalanceCents: st.accountOpeningCents ?? null },
    lines: (st.lineAmounts ?? [-4000]).map((amountCents) => ({
      amountCents,
      status: 'UNMATCHED',
      readingAgreement: true,
    })),
  };
  const saved: Array<Record<string, unknown>> = [];
  const prisma = {
    bankStatement: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) => {
        // Deux appelants : la relecture du relevé courant, et la recherche
        // du précédent (qui filtre sur `periodEnd`, pas sur `id`).
        if (where.id === 'st-1') return statement;
        return previous ? { id: 'st-prev', closingBalanceCents: previous.closingBalanceCents } : null;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        saved.push(data);
        return data;
      }),
    },
  };
  const svc = new BankStatementIntegrityService(prisma as never);
  return { svc, saved };
}

describe('BankStatementIntegrityService.recompute', () => {
  it('un relevé reçu sans solde d’ouverture connu reste à vérifier', async () => {
    const w = makeWorld({ accountOpeningCents: null });
    await w.svc.recompute(CLUB, 'st-1');

    expect(w.saved[0]).toMatchObject({ chainOk: null, status: 'NEEDS_CHECK' });
  });

  it('un relevé reçu qui chaîne sur le précédent est exploitable', async () => {
    const w = makeWorld({ openingBalanceCents: 1000, closingBalanceCents: -3000 }, { closingBalanceCents: 1000 });
    await w.svc.recompute(CLUB, 'st-1');

    expect(w.saved[0]).toMatchObject({ chainOk: true, integrityDeltaCents: 0, status: 'READY' });
  });

  it('un relevé reçu dont le solde de début ne suit pas le précédent est bloqué', async () => {
    const w = makeWorld({ openingBalanceCents: 1000, closingBalanceCents: -3000 }, { closingBalanceCents: 9999 });
    await w.svc.recompute(CLUB, 'st-1');

    expect(w.saved[0]).toMatchObject({ chainOk: false, status: 'NEEDS_CHECK' });
  });

  it('un relevé SYNTHÉTISÉ chaîne par construction, même sans solde d’ouverture', async () => {
    // C'est ClubFlow qui a choisi ce solde de début : rien à vérifier ici,
    // et « à vérifier » enverrait corriger un relevé sans fichier d'origine.
    const w = makeWorld({ format: 'STRIPE_API', accountOpeningCents: null });
    await w.svc.recompute(CLUB, 'st-1');

    expect(w.saved[0]).toMatchObject({ chainOk: true, integrityDeltaCents: 0, status: 'READY' });
  });

  it('un relevé synthétisé dont l’arithmétique ne tombe pas juste reste bloqué', async () => {
    // L'exception porte sur le CHAÎNAGE, pas sur la somme des lignes : un
    // solde de fin qui ne suit pas ses propres lignes reste une anomalie.
    const w = makeWorld({ format: 'STRIPE_API', closingBalanceCents: -1234 });
    await w.svc.recompute(CLUB, 'st-1');

    expect(w.saved[0]).toMatchObject({ status: 'NEEDS_CHECK' });
    expect(w.saved[0].integrityDeltaCents).not.toBe(0);
  });
});
