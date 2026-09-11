import { BadRequestException } from '@nestjs/common';
import { BankMemberTransferService } from './bank-member-transfer.service';

/**
 * Encaissement d'un virement d'adhérent (ADR-0014 §7). Ce qui est vérifié :
 * les paiements partent un à un avec le bon compte bancaire, la ligne est
 * rapprochée des écritures produites, et un refus en cours de route est dit
 * en clair plutôt que d'être avalé.
 */

const CLUB = 'club-1';

function makeWorld(
  opts: { failOn?: string; entriesFor?: string[]; proposedEntryId?: string | null } = {},
) {
  const line = {
    id: 'l-1',
    clubId: CLUB,
    label: 'VIR SEPA DUPONT JEAN COTISATION',
    reference: null as string | null,
    amountCents: 40000,
    status: 'UNMATCHED',
    proposedEntryId: opts.proposedEntryId ?? null,
    statement: { id: 'st-1', status: 'READY', financialAccountId: 'fa-1' },
  };
  const deletedEntries: string[] = [];
  const lineUpdates: Array<Record<string, unknown>> = [];
  const prisma: Record<string, unknown> = {
    bankStatementLine: {
      findFirst: jest.fn(async () => line),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lineUpdates.push(data);
        Object.assign(line, data);
        return line;
      }),
    },
    accountingEntry: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === line.proposedEntryId ? { id: where.id } : null,
      ),
      findMany: jest.fn(async ({ where }: { where: { paymentId: { in: string[] } } }) => {
        const ids = opts.entriesFor ?? where.paymentId.in;
        return ids.map((paymentId, i) => ({
          id: `entry-${i + 1}`,
          amountCents: i === 0 ? 25000 : 15000,
          paymentId,
        }));
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        deletedEntries.push(where.id);
        return {};
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  const recorded: Array<Record<string, unknown>> = [];
  const payments = {
    recordManualPayment: jest.fn(
      async (_clubId: string, input: Record<string, unknown>) => {
        if (opts.failOn && input.invoiceId === opts.failOn) {
          throw new BadRequestException('Facture déjà soldée ou annulée');
        }
        recorded.push(input);
        return { id: `pay-${recorded.length}` };
      },
    ),
  };
  const reconciliation = {
    match: jest.fn(async () => ({ id: 'l-1' })),
    // La règle « une proposition cède devant une résolution mieux fondée »
    // vit dans BankReconciliationService, avec son propre test.
    dropPendingProposal: jest.fn(async () => undefined),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new BankMemberTransferService(
    prisma as never,
    payments as never,
    reconciliation as never,
    audit as never,
  );
  return { svc, line, recorded, payments, reconciliation, audit, deletedEntries, lineUpdates };
}

const ALLOCATIONS = [
  { invoiceId: 'inv-1', amountCents: 25000, paidByMemberId: 'm-dupont' },
  { invoiceId: 'inv-2', amountCents: 15000, paidByMemberId: 'm-dupont' },
];

describe('BankMemberTransferService.acceptMemberPayment', () => {
  it('encaisse chaque facture sur le compte bancaire du relevé, puis rapproche la ligne', async () => {
    const w = makeWorld();
    const out = await w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS);

    expect(out).toMatchObject({ invoicesPaid: 2, lineMatched: true, stoppedBecause: null });
    expect(w.recorded).toHaveLength(2);
    expect(w.recorded[0]).toMatchObject({
      invoiceId: 'inv-1',
      amountCents: 25000,
      method: 'MANUAL_TRANSFER',
      // Le compte du relevé, pas la route par défaut du mode de paiement.
      financialAccountId: 'fa-1',
      paidByMemberId: 'm-dupont',
      externalRef: 'VIR SEPA DUPONT JEAN COTISATION',
    });
    expect(w.reconciliation.match).toHaveBeenCalledWith(
      CLUB,
      'user-1',
      'l-1',
      [
        { entryId: 'entry-1', amountCents: 25000 },
        { entryId: 'entry-2', amountCents: 15000 },
      ],
      'PROPOSAL',
    );
  });

  it('la référence du virement sert de référence de paiement quand elle existe', async () => {
    const w = makeWorld();
    w.line.reference = 'REF-2026-0042';
    await w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS);
    expect(w.recorded[0].externalRef).toBe('REF-2026-0042');
  });

  it('refus sur la deuxième facture : la première reste encaissée et on le dit', async () => {
    const w = makeWorld({ failOn: 'inv-2' });
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS),
    ).rejects.toThrow(/1 encaissement\(s\) enregistré\(s\), puis arrêt/);
    expect(w.recorded).toHaveLength(1);
    // Ce qui a été fait est journalisé, pas perdu.
    expect(w.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ recordedPaymentIds: ['pay-1'] }),
      }),
    );
  });

  it('refus dès la première facture : rien d’encaissé, message d’origine', async () => {
    const w = makeWorld({ failOn: 'inv-1' });
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS),
    ).rejects.toThrow('Facture déjà soldée ou annulée');
    expect(w.recorded).toHaveLength(0);
    expect(w.reconciliation.match).not.toHaveBeenCalled();
  });

  it('une écriture manquante laisse le rapprochement à la main plutôt que de le fausser', async () => {
    const w = makeWorld({ entriesFor: ['pay-1'] });
    const out = await w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS);
    expect(out.invoicesPaid).toBe(2);
    expect(out.lineMatched).toBe(false);
    expect(w.reconciliation.match).not.toHaveBeenCalled();
  });

  it('la proposition d’écriture en attente est jetée : c’est le paiement qui porte la recette', async () => {
    const w = makeWorld({ proposedEntryId: 'entry-proposee' });
    await w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS);
    expect(w.reconciliation.dropPendingProposal).toHaveBeenCalledWith(
      CLUB,
      'l-1',
      'entry-proposee',
    );
  });

  it('les parts doivent couvrir exactement le virement', async () => {
    const w = makeWorld();
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', [
        { invoiceId: 'inv-1', amountCents: 25000 },
      ]),
    ).rejects.toThrow(/exactement le virement/);
    expect(w.recorded).toHaveLength(0);
  });

  it('une même facture deux fois est refusée', async () => {
    const w = makeWorld();
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', [
        { invoiceId: 'inv-1', amountCents: 20000 },
        { invoiceId: 'inv-1', amountCents: 20000 },
      ]),
    ).rejects.toThrow(/deux fois/);
  });

  it('une ligne au débit n’est pas un encaissement d’adhérent', async () => {
    const w = makeWorld();
    w.line.amountCents = -40000;
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS),
    ).rejects.toThrow(/ligne au crédit/);
  });

  it('un relevé qui ne passe pas le contrôle bloque l’encaissement', async () => {
    const w = makeWorld();
    w.line.statement.status = 'NEEDS_CHECK';
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS),
    ).rejects.toThrow(/contrôle d’intégrité/);
    expect(w.recorded).toHaveLength(0);
  });

  it('une ligne déjà rapprochée n’est pas encaissée une deuxième fois', async () => {
    const w = makeWorld();
    w.line.status = 'MATCHED';
    await expect(
      w.svc.acceptMemberPayment(CLUB, 'user-1', 'l-1', ALLOCATIONS),
    ).rejects.toThrow(/à traiter/);
  });
});
