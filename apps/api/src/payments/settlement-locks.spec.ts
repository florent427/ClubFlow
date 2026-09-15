import { lockInvoicesInTx } from './settlement-locks';

/**
 * L'ordre des verrous de facture (ADR-0022, §3) : deux chemins qui verrouillent
 * les mêmes factures doivent les prendre dans le même ordre, sinon ils peuvent
 * s'interbloquer. L'exclusion que donne le verrou se vérifie dans
 * invoice-void-lock.spec.ts.
 */
describe('lockInvoicesInTx', () => {
  it('prend chaque facture une fois, dans l’ordre de leurs identifiants', async () => {
    const pris: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
        expect(sql.join('?')).toBe(
          "SELECT pg_advisory_xact_lock(hashtext('clubflow:invoice'), hashtext(?))",
        );
        pris.push(String(values[0]));
        return 0;
      }),
    };

    await lockInvoicesInTx(tx as never, ['inv-sup', 'inv-1', 'inv-sup', 'inv-0']);

    expect(pris).toEqual(['inv-0', 'inv-1', 'inv-sup']);
  });
});
