import { buildSmtpMailFrom } from './mail-from';

describe('buildSmtpMailFrom', () => {
  it('produit name + address pour Nodemailer', () => {
    expect(
      buildSmtpMailFrom('SKSR', 'sksr.re', 'noreply'),
    ).toEqual({
      name: 'SKSR',
      address: 'noreply@sksr.re',
    });
  });

  it('assainit une virgule dans le nom du club (sans casser le parseur SMTP)', () => {
    const r = buildSmtpMailFrom('Club SKSR, section Paris', 'sksr.re', 'noreply');
    expect(r.name).toBe('Club SKSR, section Paris');
    expect(r.address).toBe('noreply@sksr.re');
  });

  it('retire retours ligne du nom', () => {
    expect(buildSmtpMailFrom('Ligne1\nLigne2', 'x.fr', 'a').name).toBe(
      'Ligne1 Ligne2',
    );
  });

  it('retombe sur noreply si partie locale invalide', () => {
    expect(buildSmtpMailFrom('C', 'x.fr', 'bad space').address).toBe(
      'noreply@x.fr',
    );
  });
});
