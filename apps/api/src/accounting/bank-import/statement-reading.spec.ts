import {
  buildStatementReadingPrompt,
  parseReadCents,
  parseReadDate,
  parseStatementReadingJson,
} from './statement-reading';

describe('parseStatementReadingJson', () => {
  it('lit une réponse conforme', () => {
    const r = parseStatementReadingJson(
      JSON.stringify({
        iban: 'FR76 1871 9000 0100 0123 4567 890',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        openingBalanceCents: 123456,
        closingBalanceCents: 132866,
        lines: [
          { bookedOn: '2026-09-05', valueOn: '2026-09-05', label: 'VIR SEPA DUPONT', amountCents: 25000, balanceAfterCents: 148456 },
          { bookedOn: '2026-09-15', valueOn: null, label: 'PRLV EDF', amountCents: -3590, balanceAfterCents: null },
        ],
      }),
    );
    expect(r.warnings).toEqual([]);
    expect(r.reading).toEqual({
      iban: 'FR7618719000010001234567890',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      openingBalanceCents: 123456,
      closingBalanceCents: 132866,
      lines: [
        { bookedOn: '2026-09-05', valueOn: '2026-09-05', label: 'VIR SEPA DUPONT', amountCents: 25000, balanceAfterCents: 148456 },
        { bookedOn: '2026-09-15', valueOn: null, label: 'PRLV EDF', amountCents: -3590, balanceAfterCents: null },
      ],
    });
  });

  it('tolère les clôtures markdown, les euros décimaux, les chaînes françaises et les dates JJ/MM/AAAA', () => {
    const r = parseStatementReadingJson(
      '```json\n' +
        JSON.stringify({
          openingBalanceCents: '1 234,56',
          closingBalanceCents: 1328.66,
          lines: [{ bookedOn: '05/09/2026', label: 'VIR', amountCents: '−45,10' }],
        }) +
        '\n```',
    );
    expect(r.reading?.openingBalanceCents).toBe(123456);
    expect(r.reading?.closingBalanceCents).toBe(132866);
    expect(r.reading?.lines[0]).toMatchObject({ bookedOn: '2026-09-05', amountCents: -4510 });
  });

  it('écarte les lignes sans date ou sans montant, avec un avertissement, et garde les autres', () => {
    const r = parseStatementReadingJson(
      JSON.stringify({
        lines: [
          { bookedOn: '2026-09-31', label: 'date impossible', amountCents: 100 },
          { bookedOn: '2026-09-05', label: 'montant nul', amountCents: 0 },
          { bookedOn: '2026-09-05', label: 'ok', amountCents: -100 },
        ],
      }),
    );
    expect(r.reading?.lines.map((l) => l.label)).toEqual(['ok']);
    expect(r.warnings).toHaveLength(2);
  });

  it('réponse non JSON : pas de lecture', () => {
    const r = parseStatementReadingJson('Désolé, je ne peux pas.');
    expect(r.reading).toBeNull();
    expect(r.warnings[0]).toMatch(/non JSON/);
  });
});

describe('parseReadDate / parseReadCents', () => {
  it('dates', () => {
    expect(parseReadDate('2026-02-29')).toBeNull();
    expect(parseReadDate('1/9/2026')).toBe('2026-09-01');
    expect(parseReadDate(20260901)).toBeNull();
  });
  it('montants', () => {
    expect(parseReadCents(-4510)).toBe(-4510);
    expect(parseReadCents(-45.1)).toBe(-4510);
    expect(parseReadCents('1.234,56 €')).toBe(123456);
    expect(parseReadCents('abc')).toBeNull();
  });
});

describe('buildStatementReadingPrompt', () => {
  it('première et dernière page : les deux soldes sont attendus ; le texte natif est joint', () => {
    const p = buildStatementReadingPrompt({
      pageNumbers: [1],
      pageCount: 1,
      nativeText: 'ANCIEN SOLDE 1 234,56',
      previousRunningBalanceCents: null,
    });
    expect(p).toMatch(/openingBalanceCents = « ancien solde »/);
    expect(p).toMatch(/closingBalanceCents = « nouveau solde »/);
    expect(p).toContain('ANCIEN SOLDE 1 234,56');
    expect(p).not.toMatch(/solde courant/);
  });
  it('pages du milieu : soldes null, solde courant transmis', () => {
    const p = buildStatementReadingPrompt({
      pageNumbers: [4, 5],
      pageCount: 8,
      nativeText: '',
      previousRunningBalanceCents: 99000,
    });
    expect(p).toMatch(/openingBalanceCents = null/);
    expect(p).toMatch(/closingBalanceCents = null/);
    expect(p).toContain('99000 centimes');
    expect(p).not.toContain('TEXTE NATIF');
  });
});
