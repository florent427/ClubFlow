/** Règles métier « un payeur parmi les membres du foyer » (Phase C). */

export type FamilyCreationValidation = {
  /** Payeur adhérent — mutuellement exclusif avec `payerContactId`. */
  payerMemberId?: string | null;
  /** Payeur contact (sans fiche membre) — mutuellement exclusif avec `payerMemberId`. */
  payerContactId?: string | null;
  memberIds: string[];
};

export function validateFamilyCreationInput(
  input: FamilyCreationValidation,
): string | null {
  if (input.memberIds.length === 0) {
    return 'Au moins un membre doit composer le foyer';
  }
  const unique = new Set(input.memberIds);
  if (unique.size !== input.memberIds.length) {
    return 'La liste des membres ne doit pas contenir de doublon';
  }

  const pm = input.payerMemberId?.trim() || null;
  const pc = input.payerContactId?.trim() || null;
  const hasMemberPayer = pm != null && pm.length > 0;
  const hasContactPayer = pc != null && pc.length > 0;

  if (hasMemberPayer === hasContactPayer) {
    if (!hasMemberPayer) {
      return 'Désignez un payeur : soit un adhérent du foyer, soit un contact du club';
    }
    return 'Un seul type de payeur : adhérent ou contact, pas les deux';
  }

  if (hasMemberPayer) {
    if (!unique.has(pm!)) {
      return 'Le payeur (adhérent) doit faire partie des membres du foyer';
    }
  }

  return null;
}
