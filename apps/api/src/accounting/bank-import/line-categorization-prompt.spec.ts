import {
  buildCategorizationPrompt,
  parseCategorizationJson,
} from './line-categorization-prompt';
import type { CategorizationPromptInput } from './line-categorization-prompt';

const base: CategorizationPromptInput = {
  label: 'PRLV SEPA EDF FACTURE 123456',
  amountCents: -3590,
  bookedOn: '2026-09-15',
  financialAccountLabel: 'Banque principale',
  accounts: [
    { code: '606100', label: 'Fournitures non stockables (eau, énergie)', kind: 'EXPENSE' },
    { code: '706100', label: 'Cotisations membres', kind: 'INCOME' },
  ],
  projects: [{ id: 'p-1', title: 'Tournoi 2026' }],
  rules: [{ pattern: 'LOYER', direction: 'DEBIT', accountCode: '613200' }],
  examples: [{ label: 'PRLV EDF 07/26', accountCode: '606100', accountLabel: 'Énergie' }],
  conversation: [],
};

describe('buildCategorizationPrompt', () => {
  it('donne le sens, le compte bancaire, le plan, les règles et les décisions passées', () => {
    const p = buildCategorizationPrompt(base);
    expect(p).toContain('« PRLV SEPA EDF FACTURE 123456 »');
    expect(p).toContain('DÉCAISSEMENT');
    expect(p).toContain('−35,90 €');
    expect(p).toContain('Banque principale');
    expect(p).toContain('606100');
    expect(p).toContain('« LOYER » (DEBIT) → 613200');
    expect(p).toContain('« PRLV EDF 07/26 » → 606100');
    expect(p).toContain('p-1 — Tournoi 2026');
  });

  it('un encaissement est annoncé comme tel', () => {
    expect(buildCategorizationPrompt({ ...base, amountCents: 25000 })).toContain('ENCAISSEMENT');
  });

  it('sans échange, aucune section dialogue ; avec, la réponse du trésorier tranche', () => {
    expect(buildCategorizationPrompt(base)).not.toContain('Échange déjà eu');
    const withTurns = buildCategorizationPrompt({
      ...base,
      conversation: [
        { role: 'ASSISTANT', text: 'C’est une facture d’électricité ou de gaz ?' },
        { role: 'USER', text: 'électricité du dojo' },
      ],
    });
    expect(withTurns).toContain('Toi : C’est une facture');
    expect(withTurns).toContain('Trésorier : électricité du dojo');
    expect(withTurns).toContain('elle tranche');
  });

  it('sans projet actif, le prompt le dit plutôt que de laisser une liste vide', () => {
    expect(buildCategorizationPrompt({ ...base, projects: [] })).toContain('aucun projet actif');
  });
});

describe('parseCategorizationJson', () => {
  const codes = new Set(['606100', '706100']);
  const projects = new Set(['p-1']);

  it('lit une réponse conforme', () => {
    const r = parseCategorizationJson(
      JSON.stringify({
        accountCode: '606100',
        projectId: 'p-1',
        label: 'EDF — facture électricité',
        confidencePct: 92,
        reasoning: 'Prélèvement EDF récurrent',
        question: null,
      }),
      codes,
      projects,
    );
    expect(r).toEqual({
      accountCode: '606100',
      projectId: 'p-1',
      label: 'EDF — facture électricité',
      confidencePct: 92,
      reasoning: 'Prélèvement EDF récurrent',
      question: null,
    });
  });

  it('refuse un compte hors du plan comptable, et la confiance tombe à zéro', () => {
    const r = parseCategorizationJson(
      JSON.stringify({ accountCode: '999999', confidencePct: 99, label: 'X' }),
      codes,
      projects,
    );
    expect(r?.accountCode).toBeNull();
    expect(r?.confidencePct).toBe(0);
  });

  it('refuse un projet inconnu sans jeter le reste', () => {
    const r = parseCategorizationJson(
      JSON.stringify({ accountCode: '606100', projectId: 'p-inconnu', confidencePct: 80 }),
      codes,
      projects,
    );
    expect(r?.projectId).toBeNull();
    expect(r?.accountCode).toBe('606100');
  });

  it('tolère les fences markdown, le texte autour, et une confiance en fraction', () => {
    const r = parseCategorizationJson(
      'Voici :\n```json\n{"accountCode":"706100","confidencePct":0.85}\n```\nVoilà.',
      codes,
      projects,
    );
    expect(r?.accountCode).toBe('706100');
    expect(r?.confidencePct).toBe(85);
  });

  it('« null » en chaîne vaut null, et la confiance est bornée', () => {
    const r = parseCategorizationJson(
      JSON.stringify({ accountCode: '606100', question: 'null', confidencePct: 150 }),
      codes,
      projects,
    );
    expect(r?.question).toBeNull();
    expect(r?.confidencePct).toBe(100);
  });

  it('réponse non JSON : null', () => {
    expect(parseCategorizationJson('je ne sais pas', codes, projects)).toBeNull();
  });
});
