import {
  matchVolunteerRefund,
  type VolunteerBalanceForMatch,
  type VolunteerOpenReceipt,
} from './volunteer-refund-matcher';

/**
 * Ce que la reconnaissance doit garantir : on ne propose de rembourser
 * quelqu'un que si son nom est dans le libellé ET que le montant tombe
 * juste. Rembourser la mauvaise personne est une erreur qu'un relevé ne
 * rattrape pas.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function receipt(entryId: string, amountCents: number, iso = '2026-09-01'): VolunteerOpenReceipt {
  return { entryId, label: `Reçu ${entryId}`, amountCents, occurredAt: day(iso) };
}

function balance(
  firstName: string,
  lastName: string,
  receipts: VolunteerOpenReceipt[],
): VolunteerBalanceForMatch {
  return { memberId: `m-${lastName.toLowerCase()}`, firstName, lastName, receipts };
}

const DUPONT = balance('Jean', 'Dupont', [
  receipt('e1', 4510, '2026-09-01'),
  receipt('e2', 3000, '2026-09-02'),
  receipt('e3', 1230, '2026-09-03'),
]);

function match(label: string, amountCents: number, balances = [DUPONT]) {
  return matchVolunteerRefund({ label, reference: null, amountCents, balances });
}

describe('matchVolunteerRefund', () => {
  it('propose de solder tous les reçus quand le montant est le total dû', () => {
    const [c] = match('VIR SEPA JEAN DUPONT REMB FRAIS', 8740);

    expect(c.amountMatch).toBe('EXACT_ALL');
    expect(c.entryIds).toEqual(['e1', 'e2', 'e3']);
    expect(c.openCents).toBe(8740);
    expect(c.confidence).toBeGreaterThanOrEqual(80);
  });

  it('propose le sous-ensemble qui tombe juste quand il est unique', () => {
    const [c] = match('VIR SEPA JEAN DUPONT', 4230);

    expect(c.amountMatch).toBe('EXACT_SUBSET');
    expect(c.entryIds).toEqual(['e2', 'e3']);
  });

  it('ne choisit pas quand deux combinaisons font le même total', () => {
    // 30,00 € se fait par le reçu e2 seul, ou par e4 seul : proposer l'un
    // reviendrait à trancher à la place du trésorier.
    const ambigu = balance('Jean', 'Dupont', [
      receipt('e2', 3000, '2026-09-02'),
      receipt('e4', 3000, '2026-09-04'),
    ]);
    const [c] = match('VIR SEPA JEAN DUPONT', 3000, [ambigu]);

    expect(c.amountMatch).toBe('NONE');
    expect(c.entryIds).toEqual([]);
    expect(c.confidence).toBeLessThan(80);
  });

  it('ne propose rien quand aucun sous-ensemble ne tombe juste', () => {
    const [c] = match('VIR SEPA JEAN DUPONT', 5000);

    expect(c.amountMatch).toBe('NONE');
    expect(c.entryIds).toEqual([]);
  });

  it('ne propose rien quand le montant dépasse ce que le club doit', () => {
    const [c] = match('VIR SEPA JEAN DUPONT', 99_999);

    expect(c.amountMatch).toBe('NONE');
    expect(c.openCents).toBe(8740);
  });

  it('reconnaît le nom de famille seul, avec moins d’assurance', () => {
    const [c] = match('VIR SEPA DUPONT REMBOURSEMENT', 8740);

    expect(c.nameScore).toBe(70);
    expect(c.confidence).toBeLessThan(90);
  });

  it('deux homonymes reconnus : plus rien n’est proposable en un clic', () => {
    const autre = balance('Marie', 'Dupont', [receipt('e9', 8740, '2026-09-05')]);
    const cands = match('VIR SEPA DUPONT REMB', 8740, [DUPONT, autre]);

    expect(cands).toHaveLength(2);
    for (const c of cands) expect(c.confidence).toBeLessThanOrEqual(60);
  });

  it('ignore un bénévole que le libellé ne nomme pas', () => {
    expect(match('VIR SEPA MARTIN LEA', 8740)).toEqual([]);
  });

  it('ignore un bénévole à qui le club ne doit rien', () => {
    const solde = balance('Jean', 'Dupont', []);
    expect(match('VIR SEPA JEAN DUPONT', 8740, [solde])).toEqual([]);
  });

  it('ignore une ligne créditrice : un remboursement fait SORTIR l’argent', () => {
    expect(matchVolunteerRefund({ label: 'VIR JEAN DUPONT', reference: null, amountCents: 0, balances: [DUPONT] })).toEqual([]);
  });

  it('cherche aussi le nom dans la référence', () => {
    const cands = matchVolunteerRefund({
      label: 'VIREMENT EMIS',
      reference: 'JEAN DUPONT',
      amountCents: 8740,
      balances: [DUPONT],
    });

    expect(cands[0]?.amountMatch).toBe('EXACT_ALL');
  });

  it('renonce à chercher un sous-ensemble au-delà de seize reçus', () => {
    // Le coût explose et la proposition ne vaudrait plus rien : trop de
    // combinaisons se ressemblent.
    const beaucoup = balance(
      'Jean',
      'Dupont',
      Array.from({ length: 17 }, (_, i) => receipt(`x${i}`, 100 + i, `2026-09-0${(i % 9) + 1}`)),
    );
    const [c] = match('VIR SEPA JEAN DUPONT', 201, [beaucoup]);

    expect(c.amountMatch).toBe('NONE');
  });

  it('solde tout de même les dix-sept reçus si le montant est le total', () => {
    const receipts = Array.from({ length: 17 }, (_, i) => receipt(`x${i}`, 100, '2026-09-01'));
    const beaucoup = balance('Jean', 'Dupont', receipts);
    const [c] = match('VIR SEPA JEAN DUPONT', 1700, [beaucoup]);

    expect(c.amountMatch).toBe('EXACT_ALL');
    expect(c.entryIds).toHaveLength(17);
  });
});
