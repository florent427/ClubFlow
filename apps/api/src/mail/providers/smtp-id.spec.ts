import {
  fqdnFromSmtpProviderId,
  isSmtpProviderId,
  smtpProviderIdForFqdn,
} from './smtp-id';

describe('smtp-id', () => {
  it('encode / decode fqdn', () => {
    const id = smtpProviderIdForFqdn('mail.exemple.fr');
    expect(id.startsWith('smtp:')).toBe(true);
    expect(fqdnFromSmtpProviderId(id)).toBe('mail.exemple.fr');
  });

  it('reconnait un identifiant herite comme non-SMTP', () => {
    expect(isSmtpProviderId(smtpProviderIdForFqdn('mail.exemple.fr'))).toBe(true);
    expect(isSmtpProviderId('69f8410ed5eb982a25003083')).toBe(false);
    expect(isSmtpProviderId(null)).toBe(false);
  });
});
