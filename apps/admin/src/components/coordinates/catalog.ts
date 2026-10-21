/**
 * Les trois champs d'adresse du catalogue « Fiche adhérent » sont rendus
 * ensemble par `AddressFields`, à la place du premier d'entre eux.
 */
export const ADDRESS_CATALOG_KEYS = ['ADDRESS_LINE', 'POSTAL_CODE', 'CITY'] as const;

const ADDRESS_KEY_SET = new Set<string>(ADDRESS_CATALOG_KEYS);

export function isAddressCatalogKey(key: string): boolean {
  return ADDRESS_KEY_SET.has(key);
}

/** Clé à laquelle le bloc adresse s'affiche (null si aucune n'est visible). */
export function firstAddressCatalogKey(
  fields: { fieldKey: string }[],
): string | null {
  return fields.find((f) => ADDRESS_KEY_SET.has(f.fieldKey))?.fieldKey ?? null;
}

/** Bloc adresse requis si l'un de ses champs l'est. */
export function addressCatalogRequired(
  fields: { fieldKey: string; required?: boolean }[],
): boolean {
  return fields.some((f) => ADDRESS_KEY_SET.has(f.fieldKey) && f.required);
}
