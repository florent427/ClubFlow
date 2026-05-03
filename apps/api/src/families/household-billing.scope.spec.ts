import { buildInvoiceWhereForHouseholdGroup } from './household-billing.scope';

describe('household-billing.scope', () => {
  it('filtre par familles visibles dans le groupe et inclut le porteur si visible', () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: 'fam-carrier',
      visibleFamilyIds: new Set(['fam-carrier', 'fam-invited']),
    });
    expect(w).toEqual({
      OR: [
        {
          householdGroupId: 'hg-1',
          familyId: { in: ['fam-carrier', 'fam-invited'] },
        },
        { familyId: 'fam-carrier', householdGroupId: null },
      ],
    });
  });

  it("n'inclut pas le porteur si celui-ci n'est pas dans les familles visibles", () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: 'fam-carrier',
      visibleFamilyIds: new Set(['fam-other']),
    });
    expect(w).toEqual({
      OR: [
        {
          householdGroupId: 'hg-1',
          familyId: { in: ['fam-other'] },
        },
      ],
    });
  });

  it("renvoie une clause vide quand aucune famille n'est visible", () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: null,
      visibleFamilyIds: new Set(),
    });
    expect(w).toEqual({ id: { in: [] } });
  });

  it('sans porteur : uniquement le filtre groupe + familles visibles', () => {
    const w = buildInvoiceWhereForHouseholdGroup({
      kind: 'householdGroup',
      householdGroupId: 'hg-1',
      carrierFamilyId: null,
      visibleFamilyIds: new Set(['fam-a', 'fam-b']),
    });
    expect(w).toEqual({
      OR: [
        {
          householdGroupId: 'hg-1',
          familyId: { in: ['fam-a', 'fam-b'] },
        },
      ],
    });
  });
});
