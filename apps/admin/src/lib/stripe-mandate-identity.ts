/**
 * Comparaison entre l'identité KYC Stripe et le nom du club (cf. ADR-0008).
 *
 * Module PUR : en direct charges, le mandat SEPA signé par l'adhérent et le
 * libellé de son relevé bancaire portent l'identité du compte connecté, pas
 * `Club.name`. Quand les deux divergent, l'adhérent peut ne pas reconnaître le
 * prélèvement — et le SEPA lui laisse huit semaines pour le contester sans
 * motif. La décision « faut-il alerter le trésorier ? » est isolée ici pour
 * être testable sans monter la page.
 */

/**
 * Normalise un nom avant comparaison : casse, accents et espaces multiples ne
 * sont pas des divergences réelles. « Club  ÉLAN » et « club elan » désignent
 * le même club — alerter là-dessus n'apprendrait rien au trésorier et
 * l'habituerait à ignorer l'avertissement quand il compte vraiment.
 */
export function normalizeName(value: string): string {
  return (
    value
      .normalize('NFD')
      // Retire les diacritiques combinants produits par la décomposition NFD.
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * Faut-il avertir que l'identité Stripe ne correspond pas au nom du club ?
 *
 * Ne porte que sur la raison sociale. Le libellé de relevé est un champ Stripe
 * distinct, souvent tronqué ou suffixé (constaté sur staging : raison sociale
 * « SKSR », libellé « SKSR.RE ») : le comparer au nom du club produirait une
 * alerte permanente et donc ignorée.
 *
 * `businessName` à `null` = KYC pas encore renseigné : il n'y a rien à
 * comparer, et afficher une divergence à ce stade serait un faux positif.
 */
export function hasMandateNameMismatch(
  businessName: string | null,
  clubName: string,
): boolean {
  if (businessName == null) return false;
  return normalizeName(businessName) !== normalizeName(clubName);
}
