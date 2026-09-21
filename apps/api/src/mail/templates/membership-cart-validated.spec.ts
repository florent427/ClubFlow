import {
  clubMailBranding,
  type ClubBrandingRow,
} from '../branding/club-mail-branding';
import {
  isFullHtmlDocument,
  renderClubMailLayout,
} from '../branding/club-mail-layout';
import { renderMembershipCartValidatedEmail } from './membership-cart-validated';

/**
 * Depuis que l'enveloppe est posée au goulot (`BrandedMailTransport`), un
 * template qui rendrait un document complet produirait un `<html>` imbriqué
 * dans un autre — un e-mail cassé, et personne pour s'en apercevoir avant la
 * boîte de réception. Ce test tient l'invariant : les templates rendent des
 * fragments.
 */

const CLUB: ClubBrandingRow = {
  name: 'Shotokan Karaté Sud Réunion',
  logoUrl: null,
  address: null,
  contactEmail: null,
  contactPhone: null,
  siret: null,
  legalMentions: null,
  vitrinePaletteJson: { ink: '#0a0908', accent: '#c9a96a', paper: '#f5f1e8' },
};

function rendu() {
  return renderMembershipCartValidatedEmail({
    clubName: 'Shotokan Karaté Sud Réunion',
    seasonLabel: '2026-2027',
    payerName: 'Marie Dupont',
    invoiceId: 'inv-42',
    totalCents: 24500,
    items: [
      {
        memberFullName: 'Léa Dupont',
        productLabel: 'Licence enfant',
        billingRhythm: 'ANNUAL',
        lineTotalCents: 24500,
        hasExistingLicense: true,
        existingLicenseNumber: 'L-123',
      },
    ],
  });
}

describe('renderMembershipCartValidatedEmail', () => {
  it('rend un fragment, pas un document : l’enveloppe s’en charge', () => {
    expect(isFullHtmlDocument(rendu().html)).toBe(false);
  });

  it('porte le contenu qui compte pour le payeur', () => {
    const { subject, html, text } = rendu();

    expect(subject).toContain('2026-2027');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Léa Dupont');
    expect(html).toContain('245,00');
    expect(html).toContain('/billing/inv-42');
    expect(text).toContain('Léa Dupont');
  });

  it('prend la couleur du club une fois passé dans l’enveloppe', () => {
    const complet = renderClubMailLayout({
      branding: clubMailBranding(CLUB),
      bodyHtml: rendu().html,
    });

    expect(complet).not.toContain('{{accent}}');
    expect(complet).not.toContain('{{ink}}');
    expect(complet).toContain('background:#c9a96a');
    expect(isFullHtmlDocument(complet)).toBe(true);
  });

  it('échappe les noms plutôt que de les exécuter', () => {
    const { html } = renderMembershipCartValidatedEmail({
      clubName: 'Club',
      seasonLabel: '2026',
      payerName: '<script>alert(1)</script>',
      invoiceId: 'inv-1',
      totalCents: 100,
      items: [],
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
