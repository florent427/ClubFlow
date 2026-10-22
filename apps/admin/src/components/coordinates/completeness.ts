/**
 * Fiche incomplète, calculée côté admin (souple : rien n'est bloqué, on
 * signale). Mêmes trous que `coordinateGaps` de l'API, en plus léger : le
 * portable doit seulement être au format international (`+…`).
 */

function blank(v: string | null | undefined): boolean {
  return !(v ?? '').trim();
}

export type CoordinatesLike = {
  phone?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

export type BirthPlaceLike = {
  birthCity?: string | null;
  birthCountryCode?: string | null;
};

/** Libellés de ce qui manque à un contact : portable, adresse. */
export function contactCoordinateGaps(c: CoordinatesLike): string[] {
  const gaps: string[] = [];
  if (blank(c.phone) || !(c.phone ?? '').trim().startsWith('+')) {
    gaps.push('portable');
  }
  if (blank(c.addressLine) || blank(c.postalCode) || blank(c.city)) {
    gaps.push('adresse');
  }
  return gaps;
}

/** Libellés de ce qui manque à un adhérent : portable, adresse, ville de naissance. */
export function memberCoordinateGaps(m: CoordinatesLike & BirthPlaceLike): string[] {
  const gaps = contactCoordinateGaps(m);
  if (blank(m.birthCity) || blank(m.birthCountryCode)) {
    gaps.push('ville de naissance');
  }
  return gaps;
}
