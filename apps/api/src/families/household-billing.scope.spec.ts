import { buildInvoiceWhereForHouseholdGroup } from './household-billing.scope';

describe('household-billing.scope', () => {
  it('inclut householdGroupId et relais foyer porteur sans groupe sur facture', () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: 'fam-carrier',
    });
    expect(w).toEqual({
      OR: [
        { householdGroupId: 'hg-1' },
        { familyId: 'fam-carrier', householdGroupId: null },
      ],
    });
  });

  it('sans porteur : seulement householdGroupId', () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: null,
    });
    expect(w).toEqual({
      OR: [{ householdGroupId: 'hg-1' }],
    });
  });
});
