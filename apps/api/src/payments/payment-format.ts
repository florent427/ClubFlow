/**
 * Formatage des montants et dates d'échéancier (cf. ADR-0009).
 *
 * Module PUR, partagé entre le mandat SEPA affiché par Stripe Checkout et
 * l'avis de prélèvement envoyé par e-mail. Ces deux textes engagent le club
 * vis-à-vis du débiteur : ils doivent annoncer EXACTEMENT les mêmes montants
 * aux mêmes dates. Les factoriser ici évite qu'une divergence de formatage
 * fasse dire deux choses différentes au même échéancier.
 */

/** Montant en centimes → « 123,45 » (sans le symbole, à ajouter par l'appelant). */
export function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Date d'exigibilité → « 15/09/2026 ».
 *
 * Formaté en UTC explicitement : `dueOn` est une colonne `@db.Date` stockée à
 * minuit UTC. Un `toLocaleDateString` sans timeZone appliquerait le fuseau du
 * serveur et reculerait la date d'un jour sur tout fuseau négatif — un avis
 * qui annonce une date de prélèvement fausse manque son objet.
 */
export function formatDueDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}
