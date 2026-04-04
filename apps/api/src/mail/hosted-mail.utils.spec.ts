import {
  fqdnIsUnderHostedSuffix,
  slugToMailDnsLabel,
} from './hosted-mail.utils';

describe('hosted-mail.utils', () => {
  it('slugToMailDnsLabel nettoie et préfixe si chiffre initial', () => {
    expect(slugToMailDnsLabel('sksr', 'fb')).toBe('sksr');
    expect(slugToMailDnsLabel('SKSR_Club!', 'fb')).toBe('sksr-club');
    expect(slugToMailDnsLabel('123abc', 'fb')).toBe('c-123abc');
    expect(slugToMailDnsLabel('%%%', 'fallback-x')).toBe('fallback-x');
  });

  it('fqdnIsUnderHostedSuffix', () => {
    expect(fqdnIsUnderHostedSuffix('sksr.mail.clubflow.fr', 'mail.clubflow.fr')).toBe(
      true,
    );
    expect(fqdnIsUnderHostedSuffix('other.fr', 'mail.clubflow.fr')).toBe(false);
  });
});
