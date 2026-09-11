import '../graphql/register-enums';
import { AccountingResolver } from './accounting.resolver';

/**
 * `createClubAccountingEntry` renvoie l'écriture qu'il vient de créer. Le
 * code renvoyait « la plus récente du club » : une écriture datée avant une
 * autre existante n'est pas la première de la liste, et la mutation renvoyait
 * alors une autre écriture (constaté sur staging le 2026-09-11 : deux
 * cotisations du 5 septembre créées, un chèque du 10 renvoyé les deux fois).
 */
describe('createClubAccountingEntry — valeur de retour', () => {
  it('renvoie l’écriture créée, pas la plus récente du club', async () => {
    const row = (id: string) => ({
      id,
      clubId: 'club-1',
      kind: 'INCOME',
      status: 'POSTED',
      source: 'MANUAL',
      label: 'Cotisation',
      amountCents: 10000,
      vatTotalCents: null,
      paymentId: null,
      projectId: null,
      contraEntryId: null,
      financialAccountId: null,
      financialAccount: null,
      consolidatedAt: null,
      paymentMethod: null,
      paymentReference: null,
      aiProcessingStartedAt: null,
      invoiceNumber: null,
      duplicateOfEntryId: null,
      occurredAt: new Date('2026-09-05T00:00:00.000Z'),
      createdAt: new Date(),
      lines: [],
      documents: [],
    });
    const accounting = {
      createManualEntry: jest.fn(async () => ({ id: 'new-entry' })),
      getEntry: jest.fn(async (_clubId: string, id: string) => row(id)),
      // La plus récente du club est une autre écriture.
      listEntries: jest.fn(async () => [row('other-entry')]),
    };
    const deps = Array.from({ length: 12 }, () => ({})) as unknown[];
    deps[0] = accounting;
    const resolver = new AccountingResolver(
      ...(deps as ConstructorParameters<typeof AccountingResolver>),
    );

    const out = await resolver.createClubAccountingEntry(
      { id: 'club-1' } as never,
      { userId: 'user-1' } as never,
      { kind: 'INCOME', label: 'Cotisation', amountCents: 10000, accountCode: '706100' } as never,
    );

    expect(out.id).toBe('new-entry');
    expect(accounting.getEntry).toHaveBeenCalledWith('club-1', 'new-entry');
    expect(accounting.listEntries).not.toHaveBeenCalled();
  });
});
