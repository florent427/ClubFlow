import {
  clubMailBranding,
  platformMailBranding,
  type ClubBrandingRow,
} from './club-mail-branding';
import {
  clubMailTextSignature,
  isFullHtmlDocument,
  preheaderFromText,
  renderClubMailLayout,
} from './club-mail-layout';

/**
 * L'enveloppe est le seul endroit où le club signe ses e-mails. Ce qu'elle
 * doit tenir : les couleurs viennent bien du club, le contenu venu de la base
 * ressort échappé, et le lien de désinscription n'apparaît QUE s'il a été
 * fourni — un lien de désinscription sur un mot de passe oublié serait absurde.
 */

const SKSR: ClubBrandingRow = {
  name: 'Shotokan Karaté Sud Réunion',
  logoUrl: 'https://api.clubflow.topdigital.re/media/abc',
  address: '77 T chemin du Maniron\n97427 L’Étang-Salé',
  contactEmail: 'sksr.club@yahoo.fr',
  contactPhone: '0692934246',
  siret: '79857312700015',
  legalMentions: 'Association loi 1901',
  vitrinePaletteJson: {
    ink: '#0a0908',
    paper: '#f5f1e8',
    accent: '#c9a96a',
    muted: '#8a8276',
  },
};

const CORPS = '<p>Bonjour,</p>';

function rendu(over: Partial<Parameters<typeof renderClubMailLayout>[0]> = {}) {
  return renderClubMailLayout({
    branding: clubMailBranding(SKSR),
    bodyHtml: CORPS,
    ...over,
  });
}

describe('renderClubMailLayout', () => {
  it('produit un document complet, prêt à être expédié', () => {
    const html = rendu();
    expect(isFullHtmlDocument(html)).toBe(true);
    expect(html).toContain(CORPS);
  });

  it('peint l’en-tête et le fond aux couleurs du club', () => {
    const html = rendu();
    expect(html).toContain('background:#0a0908');
    expect(html).toContain('background:#f5f1e8');
    expect(html).toContain('#c9a96a');
  });

  it('affiche le logo du club, et son nom à la place quand il n’y en a pas', () => {
    expect(rendu()).toContain('src="https://api.clubflow.topdigital.re/media/abc"');

    const sansLogo = renderClubMailLayout({
      branding: clubMailBranding({ ...SKSR, logoUrl: null }),
      bodyHtml: CORPS,
    });
    expect(sansLogo).not.toContain('<img');
    expect(sansLogo).toContain('Shotokan Karaté Sud Réunion');
  });

  it('signe avec les coordonnées et les mentions légales du club', () => {
    const html = rendu();
    expect(html).toContain('77 T chemin du Maniron');
    // L'adresse est stockée multi-lignes : elle doit le rester à l'affichage.
    expect(html).toContain('97427 L’Étang-Salé');
    expect(html).toContain('sksr.club@yahoo.fr');
    expect(html).toContain('SIRET 79857312700015');
    expect(html).toContain('Association loi 1901');
  });

  it('n’affiche le lien de désinscription que s’il est fourni', () => {
    expect(rendu()).not.toContain('Se désinscrire');
    expect(rendu({ unsubscribeUrl: 'https://portail.test/desinscription?t=1' })).toContain(
      'Se désinscrire',
    );
  });

  it('échappe ce qui vient de la base plutôt que de l’exécuter', () => {
    const html = renderClubMailLayout({
      branding: clubMailBranding({
        ...SKSR,
        name: '<script>alert("x")</script>',
      }),
      bodyHtml: CORPS,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('remplace les jetons de charte du corps par les couleurs du club', () => {
    const html = renderClubMailLayout({
      branding: clubMailBranding(SKSR),
      bodyHtml: '<td style="background:{{accent}};color:{{ink}}">x</td>',
    });

    expect(html).toContain('background:#c9a96a;color:#0a0908');
    expect(html).not.toContain('{{accent}}');
  });

  it('pose un texte d’aperçu masqué, sinon la liste montre « Bonjour, »', () => {
    const html = rendu({ preheader: 'Stage de rentrée le 4 octobre' });
    expect(html).toContain('Stage de rentrée le 4 octobre');
    expect(html).toContain('display:none');
    expect(rendu()).not.toContain('display:none');
  });

  it('habille en neutre quand le club est inconnu', () => {
    const html = renderClubMailLayout({
      branding: platformMailBranding(),
      bodyHtml: CORPS,
    });
    expect(html).toContain('ClubFlow');
    expect(html).not.toContain('#c9a96a');
  });
});

describe('clubMailTextSignature', () => {
  it('dit la même chose que le pied HTML', () => {
    const sig = clubMailTextSignature(clubMailBranding(SKSR));
    expect(sig).toContain('Shotokan Karaté Sud Réunion');
    expect(sig).toContain('97427 L’Étang-Salé');
    expect(sig).toContain('sksr.club@yahoo.fr');
    expect(sig).not.toContain('Se désinscrire');
  });

  it('porte le lien de désinscription quand il y en a un', () => {
    const sig = clubMailTextSignature(
      clubMailBranding(SKSR),
      'https://portail.test/desinscription?t=1',
    );
    expect(sig).toContain('https://portail.test/desinscription?t=1');
  });
});

describe('renderClubMailLayout — lisibilité du logo', () => {
  it('pose le logo sur un disque clair, pas à même le bandeau sombre', () => {
    // Les contours du logo de SKSR sont en #040302 : sans fond clair, ils se
    // fondraient dans le bandeau, et un format sans transparence — le JPEG
    // que produit le routeur d'envoi — arriverait en aplat.
    const html = renderClubMailLayout({
      branding: clubMailBranding(SKSR),
      bodyHtml: CORPS,
    });

    const balise = /<img[^>]+>/.exec(html)?.[0] ?? '';
    expect(balise).toContain('background:#ffffff');
    expect(balise).toContain('border-radius:50%');
    expect(balise).toContain('alt="Shotokan Karaté Sud Réunion"');
  });

  it('laisse le logo occuper tout le disque, sans marge intérieure', () => {
    // Un padding laissait un anneau blanc entre le logo et le bord du disque.
    const balise =
      /<img[^>]+>/.exec(
        renderClubMailLayout({ branding: clubMailBranding(SKSR), bodyHtml: CORPS }),
      )?.[0] ?? '';

    expect(balise).not.toMatch(/padding:\s*[1-9]/);
    // La taille déclarée en attribut doit suivre celle du style, sinon les
    // clients qui ignorent le CSS affichent un autre gabarit.
    expect(balise).toContain('width="72"');
    expect(balise).toContain('width:72px');
  });
});

describe('preheaderFromText', () => {
  it('reprend le début d’un message libre', () => {
    expect(preheaderFromText('Le stage de rentrée aura lieu samedi.')).toBe(
      'Le stage de rentrée aura lieu samedi.',
    );
  });

  it('aplatit le HTML et les sauts de ligne', () => {
    expect(
      preheaderFromText('<div>Bonjour,\n\n  le stage <strong>arrive</strong>.</div>'),
    ).toBe('Bonjour, le stage arrive.');
  });

  it('coupe au mot entier et pose des points de suspension', () => {
    const long = 'abcde '.repeat(40);
    const p = preheaderFromText(long, 40);
    expect(p!.length).toBeLessThanOrEqual(41);
    expect(p!.endsWith('…')).toBe(true);
    expect(p).not.toContain('abcd…');
  });

  it('rend undefined quand il n’y a rien à annoncer', () => {
    expect(preheaderFromText('')).toBeUndefined();
    expect(preheaderFromText('   \n  ')).toBeUndefined();
    expect(preheaderFromText(null)).toBeUndefined();
    expect(preheaderFromText('<br/>')).toBeUndefined();
  });
});
