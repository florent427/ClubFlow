/**
 * Compte des sommes versées d'avance par un payeur et pas encore utilisées sur
 * une facture (ADR-0022). C'est un passif : le club les doit tant qu'elles ne
 * règlent rien. Un seul compte ; le détail par personne se calcule à partir
 * des paiements, pas de sous-comptes.
 */
export const PAYER_CREDIT_ACCOUNT_CODE = '419100';
