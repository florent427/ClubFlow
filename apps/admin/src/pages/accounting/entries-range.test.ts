import { describe, expect, it } from 'vitest';
import { computeRange } from './entries-range';

/**
 * Ce que ces tests protègent : la période choisie borne la liste ET le
 * résumé de la page Comptabilité. Une borne décalée d'un jour fait sortir
 * ou entrer en silence les écritures du premier ou du dernier jour.
 */
describe('computeRange', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const sksr = { startsOn: '2026-09-01', endsOn: '2027-08-31' };

  it("« Exercice en cours » suit l'exercice du club, pas l'année civile", () => {
    expect(computeRange('FISCAL', '', '', sksr, now)).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2027-09-01T00:00:00.000Z',
    });
  });

  it("« Exercice en cours » sans réglages chargés ne borne rien", () => {
    expect(computeRange('FISCAL', '', '', null, now)).toEqual({
      from: null,
      to: null,
    });
  });

  it("« Cette année » reste l'année civile", () => {
    expect(computeRange('YEAR', '', '', sksr, now)).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
    });
  });

  it('période personnalisée : le dernier jour est inclus', () => {
    expect(
      computeRange('CUSTOM', '2026-09-04', '2026-09-04', null, now),
    ).toEqual({
      from: '2026-09-04T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
    });
  });

  it('« Depuis le début » ne borne rien', () => {
    expect(computeRange('ALL', '', '', sksr, now)).toEqual({
      from: null,
      to: null,
    });
  });
});
