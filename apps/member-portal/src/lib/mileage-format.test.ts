import { describe, expect, it } from 'vitest';
import {
  base64ToPdfBlob,
  claimBadge,
  daysBetween,
  firstDayOfMonthIso,
  countWeekdays,
  formatWeekdays,
  weekdaysFromCounts,
  kmInputToMeters,
  metersToKmInput,
  todayIso,
} from './mileage-format';

describe('kmInputToMeters', () => {
  it('accepte la virgule et le point décimal', () => {
    expect(kmInputToMeters('12,5')).toBe(12_500);
    expect(kmInputToMeters('12.5')).toBe(12_500);
    expect(kmInputToMeters(' 7 ')).toBe(7_000);
  });

  it('arrondit au mètre', () => {
    expect(kmInputToMeters('0,1234')).toBe(123);
  });

  it('refuse le vide, le zéro, le négatif et le texte', () => {
    expect(kmInputToMeters('')).toBeNull();
    expect(kmInputToMeters('0')).toBeNull();
    expect(kmInputToMeters('-3')).toBeNull();
    expect(kmInputToMeters('abc')).toBeNull();
    expect(kmInputToMeters('1,2,3')).toBeNull();
  });

  it('fait l’aller-retour avec metersToKmInput', () => {
    expect(kmInputToMeters(metersToKmInput(12_500))).toBe(12_500);
    expect(metersToKmInput(12_500)).toBe('12,5');
  });
});

describe('dates', () => {
  it('formate le jour local, pas le jour UTC', () => {
    expect(todayIso(new Date(2026, 9, 3, 23, 30))).toBe('2026-10-03');
    expect(firstDayOfMonthIso(new Date(2026, 9, 21))).toBe('2026-10-01');
  });

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
  });
});

describe('formatWeekdays', () => {
  it('trie dans l’ordre de la semaine', () => {
    expect(formatWeekdays([5, 1, 3])).toBe('Lun, Mer, Ven');
  });

  it('indique les jours à plusieurs trajets', () => {
    expect(formatWeekdays([4, 2, 2])).toBe('Mar ×2, Jeu');
  });
});

describe('countWeekdays / weekdaysFromCounts', () => {
  it('passe d’une forme à l’autre sans rien perdre', () => {
    expect(countWeekdays([4, 2, 2])).toEqual({ 2: 2, 4: 1 });
    expect(weekdaysFromCounts({ 4: 1, 2: 2, 6: 0 })).toEqual([2, 2, 4]);
  });
});

describe('claimBadge', () => {
  it('distingue un brouillon renvoyé d’un brouillon neuf', () => {
    expect(claimBadge({ status: 'DRAFT', reviewComment: null }).label).toBe('Brouillon');
    expect(claimBadge({ status: 'DRAFT', reviewComment: 'Il manque le motif' })).toEqual({
      label: 'À corriger',
      tone: 'warning',
    });
  });

  it('libelle chaque statut', () => {
    expect(claimBadge({ status: 'SUBMITTED', reviewComment: null }).tone).toBe('info');
    expect(claimBadge({ status: 'APPROVED', reviewComment: null }).tone).toBe('success');
    expect(claimBadge({ status: 'REJECTED', reviewComment: 'Non' }).tone).toBe('danger');
  });
});

describe('base64ToPdfBlob', () => {
  it('décode les octets', () => {
    const blob = base64ToPdfBlob(btoa('%PDF-1.4'));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(8);
  });
});
