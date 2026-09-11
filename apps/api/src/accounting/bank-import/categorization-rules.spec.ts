import {
  applyRules,
  learnedPatternFor,
  meaningfulTokens,
  normalizeStatementLabel,
  ruleMatches,
} from './categorization-rules';
import type { CategorizationRule } from './categorization-rules';

const rule = (over: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: 'r1',
  pattern: 'EDF',
  matchKind: 'CONTAINS',
  direction: 'ANY',
  accountCode: '606100',
  projectId: null,
  label: null,
  isActive: true,
  ...over,
});

describe('normalizeStatementLabel', () => {
  it('retire le canal, la date et la référence, garde le nom', () => {
    expect(normalizeStatementLabel('PRLV SEPA EDF 12/08 REF 123456')).toBe('PRLV SEPA EDF REF');
    expect(normalizeStatementLabel('CARTE 17/09 DECATHLON ST DENIS')).toBe('CARTE DECATHLON ST DENIS');
  });

  it('ignore accents, casse et ponctuation', () => {
    expect(normalizeStatementLabel('Prélèvement — Sté Générale')).toBe('PRELEVEMENT STE GENERALE');
  });

  it('efface les identifiants mêlant lettres et chiffres', () => {
    expect(normalizeStatementLabel('VIR FR7618719000010001234567890 LOYER')).toBe('VIR LOYER');
    expect(normalizeStatementLabel('CB 4974XXXX1234 SNCF')).toBe('CB SNCF');
  });
});

describe('learnedPatternFor', () => {
  it('retient le nom de la contrepartie, pas le canal', () => {
    expect(learnedPatternFor('PRLV SEPA EDF FACTURE 123456')).toBe('EDF');
    expect(learnedPatternFor('CARTE 17/09 DECATHLON ST DENIS')).toBe('DECATHLON');
  });

  it('complète avec un second jeton quand le premier est court', () => {
    expect(learnedPatternFor('VIR SARL DUPONT LOYER')).toBe('SARL DUPONT');
  });

  it('rend null quand il ne reste rien d’utile', () => {
    expect(learnedPatternFor('VIR SEPA 12/08 REF 998877')).toBeNull();
    expect(learnedPatternFor('   ')).toBeNull();
  });

  it('meaningfulTokens garde l’ordre du libellé', () => {
    expect(meaningfulTokens('VIR SEPA MAIRIE DE SAINT DENIS SUBVENTION')).toEqual([
      'MAIRIE',
      'SAINT',
      'DENIS',
      'SUBVENTION',
    ]);
  });
});

describe('ruleMatches', () => {
  const label = normalizeStatementLabel('PRLV SEPA EDF 12/08 REF 123');

  it('CONTAINS tombe sur le nom où qu’il soit', () => {
    expect(ruleMatches(rule(), label, -3590)).toBe(true);
  });

  it('une règle DEBIT ne s’applique pas à un crédit', () => {
    expect(ruleMatches(rule({ direction: 'DEBIT' }), label, -3590)).toBe(true);
    expect(ruleMatches(rule({ direction: 'DEBIT' }), label, 3590)).toBe(false);
    expect(ruleMatches(rule({ direction: 'CREDIT' }), label, 3590)).toBe(true);
  });

  it('STARTS_WITH exige le début du libellé normalisé', () => {
    expect(ruleMatches(rule({ pattern: 'PRLV', matchKind: 'STARTS_WITH' }), label, -100)).toBe(true);
    expect(ruleMatches(rule({ pattern: 'EDF', matchKind: 'STARTS_WITH' }), label, -100)).toBe(false);
  });

  it('REGEX est confrontée telle quelle ; une expression invalide ne fait pas tout échouer', () => {
    expect(ruleMatches(rule({ pattern: 'ED[FG]', matchKind: 'REGEX' }), label, -100)).toBe(true);
    expect(ruleMatches(rule({ pattern: 'ED[F', matchKind: 'REGEX' }), label, -100)).toBe(false);
  });

  it('une règle désactivée ne s’applique jamais', () => {
    expect(ruleMatches(rule({ isActive: false }), label, -100)).toBe(false);
  });

  it('un motif saisi avec accents ou minuscules tombe quand même', () => {
    expect(ruleMatches(rule({ pattern: 'edf' }), label, -100)).toBe(true);
  });
});

describe('applyRules', () => {
  it('la règle la plus spécifique l’emporte', () => {
    const general = rule({ id: 'general', pattern: 'CARTE', accountCode: '606800' });
    const precise = rule({ id: 'precise', pattern: 'DECATHLON', accountCode: '606300' });
    const m = applyRules([general, precise], 'CARTE 17/09 DECATHLON ST DENIS', -8990);
    expect(m?.rule.id).toBe('precise');
  });

  it('à motif égal, celle qui vise un sens l’emporte sur celle qui prend les deux', () => {
    const any = rule({ id: 'any', pattern: 'LOYER', direction: 'ANY' });
    const debit = rule({ id: 'debit', pattern: 'LOYER', direction: 'DEBIT' });
    expect(applyRules([any, debit], 'VIR LOYER', -50000)?.rule.id).toBe('debit');
  });

  it('aucune règle applicable : null', () => {
    expect(applyRules([rule({ direction: 'CREDIT' })], 'PRLV EDF', -100)).toBeNull();
    expect(applyRules([], 'PRLV EDF', -100)).toBeNull();
    expect(applyRules([rule()], '12/08 123456', -100)).toBeNull();
  });
});
