import { allocate, matchMemberTransfer, nameScore } from './member-transfer-matcher';
import type { MatchableInvoice, MatchablePerson } from './member-transfer-matcher';
import { meaningfulTokens } from './categorization-rules';

const dupont: MatchablePerson = {
  kind: 'MEMBER',
  id: 'm-dupont',
  firstName: 'Jean',
  lastName: 'Dupont',
};
const dupontLea: MatchablePerson = {
  kind: 'MEMBER',
  id: 'm-lea',
  firstName: 'Léa',
  lastName: 'Dupont',
};
const martin: MatchablePerson = {
  kind: 'CONTACT',
  id: 'c-martin',
  firstName: 'Paul',
  lastName: 'Martin',
};

const invoice = (over: Partial<MatchableInvoice> & { id: string }): MatchableInvoice => ({
  label: 'Cotisation 2026-2027',
  amountCents: 25000,
  balanceCents: 25000,
  dueAt: new Date('2026-09-01T00:00:00.000Z'),
  payerIds: ['m-dupont'],
  ...over,
});

const tokensOf = (label: string) => new Set(meaningfulTokens(label));

describe('nameScore', () => {
  it('nom ET prénom dans le libellé : 100', () => {
    expect(nameScore(dupont, tokensOf('VIR SEPA DUPONT JEAN COTISATION 2026-2027'))).toBe(100);
  });

  it('nom de famille seul : 70', () => {
    expect(nameScore(dupont, tokensOf('VIR SEPA DUPONT COTISATION'))).toBe(70);
  });

  it('prénom seul : jamais reconnu', () => {
    expect(nameScore(dupont, tokensOf('VIR SEPA JEAN COTISATION'))).toBe(0);
  });

  it('accents et casse ignorés', () => {
    const noel: MatchablePerson = { kind: 'MEMBER', id: 'm-n', firstName: 'Noël', lastName: 'Frère' };
    expect(nameScore(noel, tokensOf('VIRT SEPA FRERE NOEL'))).toBe(100);
  });

  it('libellé sans le nom : rien', () => {
    expect(nameScore(martin, tokensOf('VIR SEPA DUPONT JEAN'))).toBe(0);
  });
});

describe('allocate', () => {
  it('une facture au reste exact', () => {
    const r = allocate(25000, [invoice({ id: 'i-1' })]);
    expect(r).toEqual({ allocations: [{ invoiceId: 'i-1', amountCents: 25000 }], amountMatch: 'EXACT' });
  });

  it('deux factures dont la somme tombe juste', () => {
    const r = allocate(40000, [
      invoice({ id: 'i-1', balanceCents: 25000 }),
      invoice({ id: 'i-2', balanceCents: 15000 }),
    ]);
    expect(r.amountMatch).toBe('SUM');
    expect(r.allocations).toEqual([
      { invoiceId: 'i-1', amountCents: 25000 },
      { invoiceId: 'i-2', amountCents: 15000 },
    ]);
  });

  it('montant inférieur au reste : acompte sur la plus ancienne', () => {
    const r = allocate(10000, [invoice({ id: 'i-1', balanceCents: 25000 })]);
    expect(r).toEqual({ allocations: [{ invoiceId: 'i-1', amountCents: 10000 }], amountMatch: 'PARTIAL' });
  });

  it('montant supérieur à tout ce qui est dû : aucune répartition', () => {
    expect(allocate(99000, [invoice({ id: 'i-1', balanceCents: 25000 })])).toEqual({
      allocations: [],
      amountMatch: 'NONE',
    });
  });

  it('aucune facture : aucune répartition', () => {
    expect(allocate(25000, [])).toEqual({ allocations: [], amountMatch: 'NONE' });
  });
});

describe('matchMemberTransfer', () => {
  const base = {
    reference: null,
    people: [dupont, martin],
    invoices: [invoice({ id: 'i-1' })],
  };

  it('libellé SEPA classique : un payeur, montant exact, proposable', () => {
    const [c] = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT JEAN COTISATION 2026-2027',
      amountCents: 25000,
    });
    expect(c.payer.id).toBe('m-dupont');
    expect(c.amountMatch).toBe('EXACT');
    expect(c.confidence).toBe(100);
    expect(c.allocations).toEqual([{ invoiceId: 'i-1', amountCents: 25000 }]);
  });

  it('les trois formats de libellé des banques donnent le même payeur', () => {
    for (const label of [
      'VIR SEPA RECU /DE DUPONT JEAN /MOTIF COTISATION',
      'VIREMENT DE M DUPONT JEAN REF 445512',
      'VIR INST DUPONT JEAN 12/09 COTISATION CLUB',
    ]) {
      const [c] = matchMemberTransfer({ ...base, label, amountCents: 25000 });
      expect(c?.payer.id).toBe('m-dupont');
      expect(c?.amountMatch).toBe('EXACT');
    }
  });

  it('deux factures réglées d’un coup', () => {
    const [c] = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT JEAN',
      amountCents: 40000,
      invoices: [
        invoice({ id: 'i-1', balanceCents: 25000, dueAt: new Date('2026-09-01') }),
        invoice({ id: 'i-2', balanceCents: 15000, dueAt: new Date('2026-10-01') }),
      ],
    });
    expect(c.amountMatch).toBe('SUM');
    expect(c.allocations).toHaveLength(2);
    expect(c.confidence).toBe(90);
  });

  it('homonymes : les deux sont rendus, aucun n’est proposable seul', () => {
    const candidates = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT COTISATION',
      amountCents: 25000,
      people: [dupont, dupontLea],
      invoices: [invoice({ id: 'i-1' }), invoice({ id: 'i-2', payerIds: ['m-lea'] })],
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.confidence < 80)).toBe(true);
  });

  it('le prénom départage deux homonymes', () => {
    const candidates = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT LEA COTISATION',
      amountCents: 25000,
      people: [dupont, dupontLea],
      invoices: [invoice({ id: 'i-2', payerIds: ['m-lea'] })],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payer.id).toBe('m-lea');
    expect(candidates[0].confidence).toBe(100);
  });

  it('nom reconnu mais aucune facture ouverte : candidat sans répartition, pas proposable', () => {
    const [c] = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT JEAN',
      amountCents: 25000,
      invoices: [],
    });
    expect(c.amountMatch).toBe('NONE');
    expect(c.allocations).toEqual([]);
    expect(c.confidence).toBeLessThan(80);
  });

  it('aucun nom connu : aucun candidat', () => {
    expect(
      matchMemberTransfer({ ...base, label: 'VIR SEPA SOCIETE XYZ', amountCents: 25000 }),
    ).toEqual([]);
  });

  it('un débit n’est jamais un encaissement d’adhérent', () => {
    expect(
      matchMemberTransfer({ ...base, label: 'VIR SEPA DUPONT JEAN', amountCents: -25000 }),
    ).toEqual([]);
  });

  it('le nom peut venir de la référence du virement', () => {
    const [c] = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA RECU',
      reference: 'DUPONT JEAN COTISATION',
      amountCents: 25000,
    });
    expect(c?.payer.id).toBe('m-dupont');
  });

  it('une facture d’un autre foyer n’est jamais proposée', () => {
    const [c] = matchMemberTransfer({
      ...base,
      label: 'VIR SEPA DUPONT JEAN',
      amountCents: 25000,
      invoices: [invoice({ id: 'i-autre', payerIds: ['m-lea'] })],
    });
    expect(c.invoices).toEqual([]);
    expect(c.amountMatch).toBe('NONE');
  });
});
