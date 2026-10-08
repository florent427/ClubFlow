import {
  buildMonthlyContinuationPlan,
  continuationLabel,
  dateInZone,
  firstCoveredMonth,
  monthlyConsentText,
  remainingMonths,
} from './monthly-continuation-plan';

const TZ = 'Indian/Reunion';
const SEASON_START = new Date('2026-09-01T00:00:00Z');
const SEASON_END = new Date('2027-08-31T00:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('firstCoveredMonth — le mois que paie l’adhésion', () => {
  it('une adhésion d’août couvre septembre, premier mois de la saison', () => {
    expect(
      firstCoveredMonth({
        seasonStartsOn: SEASON_START,
        adheredAt: new Date('2026-08-24T10:00:00Z'),
        timeZone: TZ,
      }),
    ).toEqual({ year: 2026, month: 8 });
  });

  it('une adhésion d’octobre couvre octobre', () => {
    expect(
      firstCoveredMonth({
        seasonStartsOn: SEASON_START,
        adheredAt: new Date('2026-10-03T10:00:00Z'),
        timeZone: TZ,
      }),
    ).toEqual({ year: 2026, month: 9 });
  });

  it('se lit à l’heure du club : le 30/09 à 21h UTC est déjà le 1er octobre à La Réunion', () => {
    expect(
      firstCoveredMonth({
        seasonStartsOn: SEASON_START,
        adheredAt: new Date('2026-09-30T21:00:00Z'),
        timeZone: TZ,
      }),
    ).toEqual({ year: 2026, month: 9 });
  });
});

describe('remainingMonths — les mois encore dus', () => {
  it('septembre payé : octobre à août, soit 11 mois', () => {
    const months = remainingMonths({
      firstCovered: { year: 2026, month: 8 },
      seasonEndsOn: SEASON_END,
    });
    expect(months).toHaveLength(11);
    expect(months[0]).toEqual({ year: 2026, month: 9 });
    expect(months[10]).toEqual({ year: 2027, month: 7 });
  });

  it('passe le changement d’année sans sauter décembre ni janvier', () => {
    const months = remainingMonths({
      firstCovered: { year: 2026, month: 10 },
      seasonEndsOn: new Date('2027-02-28T00:00:00Z'),
    });
    expect(months).toEqual([
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ]);
  });

  it('rien quand la saison se termine avec le mois payé', () => {
    expect(
      remainingMonths({
        firstCovered: { year: 2027, month: 7 },
        seasonEndsOn: SEASON_END,
      }),
    ).toEqual([]);
  });
});

describe('buildMonthlyContinuationPlan — quand prélever', () => {
  const octToAug = remainingMonths({
    firstCovered: { year: 2026, month: 8 },
    seasonEndsOn: SEASON_END,
  });

  it('le mois en cours tout de suite, les suivants le 10', () => {
    const plan = buildMonthlyContinuationPlan({
      monthlyCents: 3000,
      months: octToAug,
      today: { year: 2026, month: 9, day: 8 },
    });
    expect(plan.map((p) => iso(p.dueOn))).toEqual([
      '2026-10-08',
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
      '2027-02-10',
      '2027-03-10',
      '2027-04-10',
      '2027-05-10',
      '2027-06-10',
      '2027-07-10',
      '2027-08-10',
    ]);
    expect(plan.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('chaque mensualité vaut exactement un mois, sans reliquat', () => {
    const plan = buildMonthlyContinuationPlan({
      monthlyCents: 2750,
      months: octToAug,
      today: { year: 2026, month: 9, day: 8 },
    });
    expect(new Set(plan.map((p) => p.amountCents))).toEqual(new Set([2750]));
    expect(plan.reduce((s, p) => s + p.amountCents, 0)).toBe(2750 * 11);
  });

  it('carte enregistrée en retard : tous les mois entamés partent ensemble', () => {
    const plan = buildMonthlyContinuationPlan({
      monthlyCents: 3000,
      months: octToAug,
      today: { year: 2026, month: 10, day: 20 },
    });
    expect(iso(plan[0]!.dueOn)).toBe('2026-11-20');
    expect(iso(plan[1]!.dueOn)).toBe('2026-11-20');
    expect(iso(plan[2]!.dueOn)).toBe('2026-12-10');
  });

  it('refuse une mensualité nulle ou un jour qui n’existe pas en février', () => {
    expect(() =>
      buildMonthlyContinuationPlan({
        monthlyCents: 0,
        months: octToAug,
        today: { year: 2026, month: 9, day: 8 },
      }),
    ).toThrow();
    expect(() =>
      buildMonthlyContinuationPlan({
        monthlyCents: 3000,
        months: octToAug,
        today: { year: 2026, month: 9, day: 8 },
        chargeDay: 30,
      }),
    ).toThrow();
  });
});

describe('textes', () => {
  it('libellé de la facture des mensualités', () => {
    expect(
      continuationLabel({
        months: [
          { year: 2026, month: 9 },
          { year: 2027, month: 7 },
        ],
        payerLabel: 'Christelle CALIAMA',
      }),
    ).toBe('Cotisation mensuelle — octobre 2026 à août 2027 — Christelle CALIAMA');
  });

  it('accord : tous les mois à venir, débités le 10', () => {
    const text = monthlyConsentText({
      clubName: 'SKSR',
      monthlyCents: 3000,
      months: remainingMonths({
        firstCovered: { year: 2026, month: 9 },
        seasonEndsOn: SEASON_END,
      }),
      today: { year: 2026, month: 9 },
    });
    expect(text).toContain('SKSR');
    expect(text).toContain('30,00 € le 10 de chaque mois de novembre 2026 à août 2027');
    expect(text).toContain('10 mensualités');
    expect(text).not.toContain("dès aujourd'hui");
  });

  it('accord : annonce le mois déjà entamé, débité tout de suite', () => {
    const text = monthlyConsentText({
      clubName: 'SKSR',
      monthlyCents: 3000,
      months: remainingMonths({
        firstCovered: { year: 2026, month: 8 },
        seasonEndsOn: SEASON_END,
      }),
      today: { year: 2026, month: 9 },
    });
    expect(text).toContain("30,00 € dès aujourd'hui pour octobre 2026");
    expect(text).toContain('le 10 de chaque mois de novembre 2026 à août 2027');
    expect(text).toContain('11 mensualités');
  });

  it('dateInZone lit la date civile du club', () => {
    expect(dateInZone(new Date('2026-10-07T21:30:00Z'), TZ)).toEqual({
      year: 2026,
      month: 9,
      day: 8,
    });
  });
});
