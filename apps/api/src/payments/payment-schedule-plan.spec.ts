import {
  addMonthsClamped,
  buildInstallmentPlan,
  splitAmountIntoInstallments,
} from './payment-schedule-plan';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('splitAmountIntoInstallments', () => {
  it('conserve le total au centime près, quel que soit le découpage', () => {
    // La propriété qui compte vraiment : aucun centime ne doit être créé
    // ni perdu, sinon la facture ne se soldera jamais exactement.
    const cases: Array<[number, number]> = [
      [10000, 3],
      [10001, 3],
      [15000, 10],
      [19100, 7],
      [999, 4],
      [2500, 1],
      [123457, 12],
    ];
    for (const [total, count] of cases) {
      const parts = splitAmountIntoInstallments(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p > 0)).toBe(true);
    }
  });

  it('fait absorber le reliquat par la dernière échéance (ADR-0009)', () => {
    expect(splitAmountIntoInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it('répartit exactement quand la division tombe juste', () => {
    expect(splitAmountIntoInstallments(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it('refuse un découpage qui produirait des échéances nulles', () => {
    // 3 centimes en 4 fois : une échéance à 0 € ferait échouer le
    // prélèvement (montant minimum Stripe).
    expect(() => splitAmountIntoInstallments(3, 4)).toThrow();
  });

  it('refuse les entrées absurdes', () => {
    expect(() => splitAmountIntoInstallments(0, 3)).toThrow();
    expect(() => splitAmountIntoInstallments(-100, 3)).toThrow();
    expect(() => splitAmountIntoInstallments(1000, 0)).toThrow();
    expect(() => splitAmountIntoInstallments(1000.5, 3)).toThrow();
  });
});

describe('addMonthsClamped', () => {
  it('rabote au dernier jour du mois quand le quantième n’existe pas', () => {
    // Le piège classique : 31 janvier + 1 mois déborderait sur mars.
    expect(iso(addMonthsClamped(new Date(Date.UTC(2026, 0, 31)), 1))).toBe(
      '2026-02-28',
    );
  });

  it('gère le 29 février des années bissextiles', () => {
    expect(iso(addMonthsClamped(new Date(Date.UTC(2028, 0, 31)), 1))).toBe(
      '2028-02-29',
    );
  });

  it('passe correctement à l’année suivante', () => {
    expect(iso(addMonthsClamped(new Date(Date.UTC(2026, 10, 15)), 3))).toBe(
      '2027-02-15',
    );
  });
});

describe('buildInstallmentPlan', () => {
  it('produit N échéances numérotées dont la somme fait le total', () => {
    const plan = buildInstallmentPlan({
      totalCents: 15000,
      count: 10,
      firstDueOn: new Date(Date.UTC(2026, 8, 5)),
    });
    expect(plan).toHaveLength(10);
    expect(plan.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plan.reduce((s, p) => s + p.amountCents, 0)).toBe(15000);
  });

  it('échelonne mensuellement à partir de la première échéance', () => {
    const plan = buildInstallmentPlan({
      totalCents: 30000,
      count: 3,
      firstDueOn: new Date(Date.UTC(2026, 8, 5)),
    });
    expect(plan.map((p) => iso(p.dueOn))).toEqual([
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
    ]);
  });

  it('ne laisse pas un mois court contaminer les échéances suivantes', () => {
    // Départ le 31 : février est raboté à 28, mais mars doit REVENIR au 31.
    // C'est ce que garantit le calcul depuis la date de départ plutôt que
    // de proche en proche.
    const plan = buildInstallmentPlan({
      totalCents: 30000,
      count: 4,
      firstDueOn: new Date(Date.UTC(2026, 0, 31)),
    });
    expect(plan.map((p) => iso(p.dueOn))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('respecte un intervalle personnalisé', () => {
    const plan = buildInstallmentPlan({
      totalCents: 30000,
      count: 3,
      firstDueOn: new Date(Date.UTC(2026, 0, 15)),
      intervalMonths: 2,
    });
    expect(plan.map((p) => iso(p.dueOn))).toEqual([
      '2026-01-15',
      '2026-03-15',
      '2026-05-15',
    ]);
  });

  it('normalise la date de départ à minuit UTC', () => {
    // Une heure résiduelle ferait basculer la date d'un jour selon le fuseau.
    const plan = buildInstallmentPlan({
      totalCents: 10000,
      count: 1,
      firstDueOn: new Date(Date.UTC(2026, 5, 10, 23, 45, 0)),
    });
    expect(plan[0]!.dueOn.toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });
});
