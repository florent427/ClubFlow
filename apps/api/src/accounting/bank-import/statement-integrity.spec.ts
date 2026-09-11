import {
  checkStatementIntegrity,
  deriveStatementStatus,
} from './statement-integrity';

describe('checkStatementIntegrity (ADR-0014 §4)', () => {
  it('juste au centime et chaîné : exploitable', () => {
    const r = checkStatementIntegrity({
      openingBalanceCents: 123456,
      closingBalanceCents: 155946,
      lineAmounts: [25000, -4510, 12000],
      previousClosingCents: 123456,
    });
    expect(r).toEqual({
      deltaCents: 0,
      arithmeticOk: true,
      chainOk: true,
      chainExpectedCents: 123456,
      ok: true,
    });
  });

  it('une ligne manquante se voit dans le delta, même si les deux lectures étaient d’accord', () => {
    const r = checkStatementIntegrity({
      openingBalanceCents: 123456,
      closingBalanceCents: 155946,
      lineAmounts: [25000, 12000],
      previousClosingCents: 123456,
    });
    // Le débit de 45,10 manque : la somme est trop haute de 45,10.
    expect(r.deltaCents).toBe(4510);
    expect(r.ok).toBe(false);
  });

  it('solde de début différent du relevé précédent : chaîne rompue', () => {
    const r = checkStatementIntegrity({
      openingBalanceCents: 123456,
      closingBalanceCents: 155946,
      lineAmounts: [25000, -4510, 12000],
      previousClosingCents: 100000,
    });
    expect(r.arithmeticOk).toBe(true);
    expect(r.chainOk).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('solde d’ouverture inconnu : chaînage indécidable, donc pas exploitable', () => {
    const r = checkStatementIntegrity({
      openingBalanceCents: 0,
      closingBalanceCents: 0,
      lineAmounts: [],
      previousClosingCents: null,
    });
    expect(r.chainOk).toBeNull();
    expect(r.ok).toBe(false);
  });
});

describe('deriveStatementStatus', () => {
  it('NEEDS_CHECK tant que le contrôle ne passe pas, quoi qu’il arrive aux lignes', () => {
    expect(deriveStatementStatus({ ok: false }, ['MATCHED', 'MATCHED'])).toBe('NEEDS_CHECK');
  });
  it('READY quand il reste des lignes à traiter, RECONCILED quand tout est rapproché ou ignoré', () => {
    expect(deriveStatementStatus({ ok: true }, ['MATCHED', 'UNMATCHED'])).toBe('READY');
    expect(deriveStatementStatus({ ok: true }, ['MATCHED', 'IGNORED'])).toBe('RECONCILED');
    expect(deriveStatementStatus({ ok: true }, [])).toBe('READY');
  });
});
