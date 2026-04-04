/** Identifiant stocké en base pour les domaines gérés en SMTP (pas d’API fournisseur). */
export function smtpProviderIdForFqdn(fqdn: string): string {
  return `smtp:${Buffer.from(fqdn, 'utf8').toString('base64url')}`;
}

export function fqdnFromSmtpProviderId(providerDomainId: string): string {
  if (!providerDomainId.startsWith('smtp:')) {
    throw new Error('Identifiant domaine SMTP invalide');
  }
  return Buffer.from(providerDomainId.slice(5), 'base64url').toString('utf8');
}
