import {
  validateFamilyCreationInput,
  type FamilyCreationValidation,
} from './family-payer-rules';

describe('family-payer-rules', () => {
  const ok: FamilyCreationValidation = {
    payerMemberId: 'p1',
    memberIds: ['p1', 'c1'],
  };

  it('accepte un foyer valide', () => {
    expect(validateFamilyCreationInput(ok)).toBeNull();
  });

  it('rejette une liste vide', () => {
    expect(
      validateFamilyCreationInput({ payerMemberId: 'p1', memberIds: [] }),
    ).toContain('Au moins un membre');
  });

  it('rejette si le payeur est absent de la liste', () => {
    expect(
      validateFamilyCreationInput({
        payerMemberId: 'x',
        memberIds: ['p1', 'c1'],
      }),
    ).toContain('payeur');
  });

  it('rejette les doublons', () => {
    expect(
      validateFamilyCreationInput({
        payerMemberId: 'p1',
        memberIds: ['p1', 'p1'],
      }),
    ).toContain('doublon');
  });

  it('accepte payeur contact + membres', () => {
    expect(
      validateFamilyCreationInput({
        payerContactId: 'contact-1',
        memberIds: ['m1'],
      }),
    ).toBeNull();
  });

  it('rejette membre et contact payeur ensemble', () => {
    expect(
      validateFamilyCreationInput({
        payerMemberId: 'p1',
        payerContactId: 'c1',
        memberIds: ['p1'],
      }),
    ).toContain('Un seul type de payeur');
  });
});
