import { buildPseudoBase, normalizePseudoInput } from './member-pseudo.util';

describe('member-pseudo.util', () => {
  it('buildPseudoBase combine prénom et nom en slug', () => {
    expect(buildPseudoBase('Jean', 'Dupont')).toBe('jean_dupont');
  });

  it('normalizePseudoInput force minuscules et caractères autorisés', () => {
    expect(normalizePseudoInput('  Jean__Dup  ')).toBe('jean__dup');
  });
});
