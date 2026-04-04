import { fqdnFromSmtpProviderId, smtpProviderIdForFqdn } from './smtp-id';

describe('smtp-id', () => {
  it('encode / decode fqdn', () => {
    const id = smtpProviderIdForFqdn('mail.exemple.fr');
    expect(id.startsWith('smtp:')).toBe(true);
    expect(fqdnFromSmtpProviderId(id)).toBe('mail.exemple.fr');
  });
});
