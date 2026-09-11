import { labelSimilarity, mergeReadings } from './merge-readings';
import type { ReadLine, StatementReading } from './merge-readings';

const line = (
  bookedOn: string,
  amountCents: number,
  label: string,
  extra: Partial<ReadLine> = {},
): ReadLine => ({ bookedOn, valueOn: null, label, amountCents, balanceAfterCents: null, ...extra });

const reading = (lines: ReadLine[], extra: Partial<StatementReading> = {}): StatementReading => ({
  iban: null,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  openingBalanceCents: 123456,
  closingBalanceCents: 132866,
  lines,
  ...extra,
});

describe('mergeReadings (ADR-0014 §3)', () => {
  it('lignes identiques : accord, libellé le plus complet, ordre du relevé conservé à date égale', () => {
    const a = reading([
      line('2026-09-10', -12000, 'ANNULATION REMISE'),
      line('2026-09-05', 25000, 'VIR SEPA DUPONT'),
      line('2026-09-05', -3590, 'PRLV EDF'),
    ]);
    const b = reading([
      line('2026-09-05', 25000, 'VIR SEPA DUPONT JEAN COTISATION'),
      line('2026-09-05', -3590, 'PRLV SEPA EDF FACTURE 123'),
      line('2026-09-10', -12000, 'ANNULATION REMISE CHQ R-2026-0001'),
    ]);
    const m = mergeReadings(a, b);
    expect(m.divergenceCount).toBe(0);
    expect(m.lines.every((l) => l.readingAgreement && l.divergence === null)).toBe(true);
    expect(m.lines.map((l) => l.label)).toEqual([
      'VIR SEPA DUPONT JEAN COTISATION',
      'PRLV SEPA EDF FACTURE 123',
      'ANNULATION REMISE CHQ R-2026-0001',
    ]);
    expect(m.warnings).toEqual([]);
    expect(m.singleReading).toBeNull();
  });

  it('une ligne vue d’un seul côté est incluse et marquée ONLY_IN_A ou ONLY_IN_B', () => {
    const a = reading([line('2026-09-05', 25000, 'VIR DUPONT'), line('2026-09-12', -1500, 'FRAIS')]);
    const b = reading([line('2026-09-05', 25000, 'VIR DUPONT'), line('2026-09-20', 5000, 'REMISE ESPECES')]);
    const m = mergeReadings(a, b);
    expect(m.lines.map((l) => [l.label, l.readingAgreement, l.divergence?.kind ?? null])).toEqual([
      ['VIR DUPONT', true, null],
      ['FRAIS', false, 'ONLY_IN_A'],
      ['REMISE ESPECES', false, 'ONLY_IN_B'],
    ]);
    expect(m.divergenceCount).toBe(2);
    const onlyB = m.lines[2];
    expect(onlyB.amountCents).toBe(5000);
    expect(onlyB.divergence?.a).toBeNull();
    expect(onlyB.divergence?.b?.label).toBe('REMISE ESPECES');
  });

  it('même libellé et montant, date différente → DATE ; même date, montant différent → AMOUNT ; A retenue', () => {
    const a = reading([
      line('2026-09-05', 25000, 'VIR SEPA DUPONT JEAN'),
      line('2026-09-15', -3590, 'PRLV SEPA EDF FACTURE'),
    ]);
    const b = reading([
      line('2026-09-06', 25000, 'VIR SEPA DUPONT JEAN'),
      line('2026-09-15', -3580, 'PRLV SEPA EDF FACTURE'),
    ]);
    const m = mergeReadings(a, b);
    expect(m.lines).toHaveLength(2);
    expect(m.lines[0].divergence?.kind).toBe('DATE');
    expect(m.lines[0].bookedOn).toBe('2026-09-05');
    expect(m.lines[0].divergence?.b?.bookedOn).toBe('2026-09-06');
    expect(m.lines[1].divergence?.kind).toBe('AMOUNT');
    expect(m.lines[1].amountCents).toBe(-3590);
    expect(m.lines[1].divergence?.b?.amountCents).toBe(-3580);
    expect(m.divergenceCount).toBe(2);
  });

  it('même montant mais libellés sans rapport : deux lignes distinctes, pas un désaccord de date', () => {
    const a = reading([line('2026-09-05', 5000, 'REMISE CHEQUES')]);
    const b = reading([line('2026-09-20', 5000, 'VIR SEPA MARTIN')]);
    const m = mergeReadings(a, b);
    expect(m.lines.map((l) => l.divergence?.kind)).toEqual(['ONLY_IN_A', 'ONLY_IN_B']);
  });

  it('une seule lecture aboutie : toutes les lignes gardées, aucune divergence, avertissement', () => {
    const a = reading([line('2026-09-05', 25000, 'VIR')]);
    const m = mergeReadings(a, null);
    expect(m.singleReading).toBe('A');
    expect(m.divergenceCount).toBe(0);
    expect(m.lines[0].readingAgreement).toBe(true);
    expect(m.warnings[0]).toMatch(/Une seule lecture/);
    expect(mergeReadings(null, a).singleReading).toBe('B');
  });

  it('soldes différents : A retenue, désaccord en clair, sans divergence de ligne', () => {
    const a = reading([line('2026-09-05', 25000, 'VIR')]);
    const b = reading([line('2026-09-05', 25000, 'VIR')], { closingBalanceCents: 132876 });
    const m = mergeReadings(a, b);
    expect(m.closingBalanceCents).toBe(132866);
    expect(m.divergenceCount).toBe(0);
    expect(m.warnings).toEqual([
      'Solde de fin : lecture A 1 328,66 €, lecture B 1 328,76 € ; A retenue.',
    ]);
  });

  it('aucune lecture : rien, et on le dit', () => {
    const m = mergeReadings(null, null);
    expect(m.lines).toEqual([]);
    expect(m.warnings[0]).toMatch(/Aucune lecture/);
  });
});

describe('labelSimilarity', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(labelSimilarity('Prélèvement SEPA - EDF', 'PRELEVEMENT SEPA EDF')).toBe(1);
  });
  it('un libellé contenu dans l’autre compte comme identique', () => {
    expect(labelSimilarity('VIR SEPA DUPONT', 'VIR SEPA DUPONT JEAN COTISATION 2026')).toBe(1);
  });
  it('libellés sans rapport : proche de zéro', () => {
    expect(labelSimilarity('REMISE CHEQUES', 'VIR SEPA MARTIN')).toBeLessThan(0.5);
  });
});
