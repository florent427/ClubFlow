import {
  NEUTRAL_MAIL_PALETTE,
  clubMailBranding,
  type ClubBrandingRow,
} from './club-mail-branding';

/**
 * La charte e-mail est lue depuis celle du site vitrine. Deux choses doivent
 * tenir : un club sans configuration ne récupère JAMAIS les couleurs d'un
 * autre club, et rien de ce qui vient de la base ne part tel quel dans un
 * attribut `style` ou `src`.
 */

const PALETTE_SKSR = {
  ink: '#0a0908',
  paper: '#f5f1e8',
  accent: '#c9a96a',
  muted: '#8a8276',
  line: 'rgba(201, 169, 106, 0.22)',
};

function ligne(over: Partial<ClubBrandingRow> = {}): ClubBrandingRow {
  return {
    name: 'Shotokan Karaté Sud Réunion',
    logoUrl: 'https://api.clubflow.topdigital.re/media/abc',
    address: '77 T chemin du Maniron, 97427 L’Étang-Salé',
    contactEmail: 'sksr.club@yahoo.fr',
    contactPhone: '0692934246',
    siret: '79857312700015',
    legalMentions: 'Association loi 1901',
    vitrinePaletteJson: null,
    ...over,
  };
}

describe('clubMailBranding', () => {
  it('reprend la palette configurée du club', () => {
    const b = clubMailBranding(ligne({ vitrinePaletteJson: PALETTE_SKSR }));

    expect(b.palette.ink).toBe('#0a0908');
    expect(b.palette.accent).toBe('#c9a96a');
    expect(b.palette.paper).toBe('#f5f1e8');
  });

  it('retombe sur le NEUTRE, jamais sur les couleurs d’un club existant', () => {
    const b = clubMailBranding(ligne({ vitrinePaletteJson: null }));

    expect(b.palette).toEqual(NEUTRAL_MAIL_PALETTE);
    // L'or de SKSR ne doit pas fuir vers un club qui n'a rien configuré.
    expect(Object.values(b.palette)).not.toContain('#c9a96a');
  });

  it('ignore une couleur qui n’est pas un hex : elle partirait dans un style', () => {
    const b = clubMailBranding(
      ligne({
        vitrinePaletteJson: {
          ...PALETTE_SKSR,
          accent: 'red;background:url(javascript:alert(1))',
        },
      }),
    );

    expect(b.palette.accent).toBe(NEUTRAL_MAIL_PALETTE.accent);
    expect(b.palette.ink).toBe('#0a0908');
  });

  it('accepte le hex court et refuse ce qui n’est pas une couleur', () => {
    const b = clubMailBranding(
      ligne({ vitrinePaletteJson: { ink: '#abc', paper: 'papayawhip', accent: 42 } }),
    );

    expect(b.palette.ink).toBe('#abc');
    expect(b.palette.paper).toBe(NEUTRAL_MAIL_PALETTE.paper);
    expect(b.palette.accent).toBe(NEUTRAL_MAIL_PALETTE.accent);
  });

  it('garde un logo en URL absolue', () => {
    const b = clubMailBranding(ligne());
    expect(b.logoUrl).toBe('https://api.clubflow.topdigital.re/media/abc');
  });

  it('écarte un logo en chemin relatif : il ne s’afficherait pas en boîte mail', () => {
    expect(clubMailBranding(ligne({ logoUrl: '/uploads/logo.png' })).logoUrl).toBeNull();
    expect(clubMailBranding(ligne({ logoUrl: '' })).logoUrl).toBeNull();
    expect(
      clubMailBranding(ligne({ logoUrl: 'javascript:alert(1)' })).logoUrl,
    ).toBeNull();
  });

  it('remplace un nom vide plutôt que de signer avec rien', () => {
    expect(clubMailBranding(ligne({ name: '   ' })).clubName).toBe('Votre club');
  });

  it('normalise les coordonnées absentes en null', () => {
    const b = clubMailBranding(
      ligne({ address: '  ', contactEmail: null, siret: '' }),
    );
    expect(b.address).toBeNull();
    expect(b.contactEmail).toBeNull();
    expect(b.siret).toBeNull();
    expect(b.contactPhone).toBe('0692934246');
  });
});
