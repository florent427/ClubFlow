/** Identifiant stocké en base pour les domaines gérés en SMTP (pas d’API fournisseur). */
export function smtpProviderIdForFqdn(fqdn: string): string {
  return `smtp:${Buffer.from(fqdn, 'utf8').toString('base64url')}`;
}

/**
 * Vrai si l’identifiant stocké est bien au format SMTP. Les lignes créées
 * avant la bascule vers le relais SMTP portent un identifiant du fournisseur
 * d’API d’alors (ex. `69f8410ed5eb982a25003083`) : elles doivent être
 * recalculées depuis le FQDN plutôt que passées telles quelles au transport.
 */
export function isSmtpProviderId(
  providerDomainId: string | null | undefined,
): providerDomainId is string {
  return typeof providerDomainId === 'string' && providerDomainId.startsWith('smtp:');
}

export function fqdnFromSmtpProviderId(providerDomainId: string): string {
  if (!providerDomainId.startsWith('smtp:')) {
    throw new Error('Identifiant domaine SMTP invalide');
  }
  return Buffer.from(providerDomainId.slice(5), 'base64url').toString('utf8');
}
