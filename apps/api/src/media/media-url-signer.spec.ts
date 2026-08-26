import {
  MediaUrlSignerService,
  stripMediaSignature,
} from './media-url-signer.service';

/**
 * Ce que la signature doit garantir, et surtout ce qu'elle ne doit PAS
 * laisser passer.
 *
 * Le mécanisme existe parce qu'une photo d'adhérent est privée mais
 * affichée par une balise `<img>`, qui n'envoie aucun en-tête. Le droit de
 * lecture voyage donc dans l'URL — ce qui n'est acceptable QUE si la
 * signature est infalsifiable et périssable. Les deux propriétés sont
 * testées ici, avec leur pendant : une URL légitime doit fonctionner.
 */
const ASSET = '1b0ff4ee-b929-412d-bc89-6616f3b9362a';
const AUTRE = '00000000-0000-4000-8000-000000000000';
const T0 = 1_700_000_000_000; // instant fixe : Date.now() est injecté

// `JWT_SECRET` est un état GLOBAL du process : le modifier ici sans le
// remettre fait échouer les suites qui s'exécutent après dans le même
// worker (constaté sur auth.service.spec).
const SECRET_INITIAL = process.env.JWT_SECRET;
beforeEach(() => {
  process.env.JWT_SECRET = 'secret-de-test';
});
afterAll(() => {
  if (SECRET_INITIAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = SECRET_INITIAL;
});

function svc(): MediaUrlSignerService {
  process.env.JWT_SECRET = 'secret-de-test';
  return new MediaUrlSignerService();
}

describe('signature — ce qui passe', () => {
  it('une URL fraîchement signée est acceptée', () => {
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    expect(s.verify(ASSET, String(exp), sig, T0)).toBe(true);
  });

  it('reste valide juste avant expiration', () => {
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    const justeAvant = exp * 1000 - 1000;
    expect(s.verify(ASSET, String(exp), sig, justeAvant)).toBe(true);
  });
});

describe('signature — ce qui est refusé', () => {
  it('REFUSE une signature expirée', () => {
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    const apres = exp * 1000 + 1;
    expect(s.verify(ASSET, String(exp), sig, apres)).toBe(false);
  });

  it('REFUSE la signature d’un AUTRE asset', () => {
    // Sans liaison de la signature à l'id, une seule URL légitime
    // ouvrirait tout le stockage : compta, documents signés, pièces
    // jointes. C'est l'assertion la plus importante du fichier.
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    expect(s.verify(AUTRE, String(exp), sig, T0)).toBe(false);
  });

  it('REFUSE une expiration repoussée à la main', () => {
    // L'attaque évidente : recopier une URL et allonger `exp`. La
    // signature couvre `exp`, donc elle ne suit pas.
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    const repousse = exp + 86_400;
    expect(s.verify(ASSET, String(repousse), sig, T0)).toBe(false);
  });

  it('REFUSE une signature forgée avec un autre secret', () => {
    process.env.JWT_SECRET = 'secret-de-test';
    const legitime = new MediaUrlSignerService();
    const { exp } = legitime.sign(ASSET, T0);
    process.env.JWT_SECRET = 'secret-de-lattaquant';
    const attaquant = new MediaUrlSignerService();
    const sigForgee = attaquant.sign(ASSET, T0).sig;

    process.env.JWT_SECRET = 'secret-de-test';
    expect(legitime.verify(ASSET, String(exp), sigForgee, T0)).toBe(false);
  });

  it('REFUSE une URL sans signature, et une signature vide', () => {
    const s = svc();
    const { exp } = s.sign(ASSET, T0);
    expect(s.verify(ASSET, String(exp), undefined, T0)).toBe(false);
    expect(s.verify(ASSET, String(exp), '', T0)).toBe(false);
    expect(s.verify(ASSET, undefined, 'peu-importe', T0)).toBe(false);
  });

  it('REFUSE un `exp` non entier', () => {
    const s = svc();
    const { exp, sig } = s.sign(ASSET, T0);
    expect(s.verify(ASSET, 'demain', sig, T0)).toBe(false);
    expect(s.verify(ASSET, `${exp}.5`, sig, T0)).toBe(false);
  });
});

describe('signUrl — ce qui est signé, et ce qui ne l’est pas', () => {
  it('signe une URL de notre endpoint média', () => {
    const s = svc();
    const out = s.signUrl(
      `https://api.clubflow.topdigital.re/media/${ASSET}`,
      T0,
    );
    expect(out).toContain(`/media/${ASSET}?exp=`);
    const u = new URL(out!);
    expect(
      s.verify(
        ASSET,
        u.searchParams.get('exp')!,
        u.searchParams.get('sig')!,
        T0,
      ),
    ).toBe(true);
  });

  it('laisse INTACTE une data URI base64', () => {
    // La photo recadrée dans l'admin est stockée en base64 inline, sans
    // MediaAsset. La signer produirait une image cassée.
    const s = svc();
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(s.signUrl(dataUri, T0)).toBe(dataUri);
  });

  it('laisse INTACTE une URL externe', () => {
    const s = svc();
    const externe = 'https://exemple.test/photos/moi.jpg';
    expect(s.signUrl(externe, T0)).toBe(externe);
  });

  it('traverse null, undefined et chaîne vide sans planter', () => {
    // Rien n'est inventé : nullish devient null, la chaîne vide reste la
    // chaîne vide. Une photo absente ne doit pas se mettre à ressembler à
    // une URL.
    const s = svc();
    expect(s.signUrl(null, T0)).toBeNull();
    expect(s.signUrl(undefined, T0)).toBeNull();
    expect(s.signUrl('', T0)).toBe('');
  });

  it('conserve une query déjà présente', () => {
    const s = svc();
    const out = s.signUrl(
      `https://api.clubflow.topdigital.re/media/${ASSET}?format=png&w=128`,
      T0,
    );
    expect(out).toContain('format=png');
    expect(out).toContain('w=128');
    expect(out).toContain('&exp=');
  });
});

/**
 * Le nettoyage à l'écriture. Sans lui, un formulaire qui relit `photoUrl`
 * et la resoumet persiste une URL périssable : la photo tient une heure,
 * puis casse pour de bon.
 */
describe('stripMediaSignature — ce qui est persisté', () => {
  it('un aller-retour signature → nettoyage rend l’URL canonique', () => {
    // L'assertion qui compte : c'est exactement le cycle vécu par un
    // formulaire (lecture signée, resoumission).
    const s = svc();
    const canonique = `https://api.clubflow.topdigital.re/media/${ASSET}`;
    expect(stripMediaSignature(s.signUrl(canonique, T0))).toBe(canonique);
  });

  it('conserve les autres paramètres', () => {
    const s = svc();
    const avecFormat = `https://api.clubflow.topdigital.re/media/${ASSET}?format=png&w=128`;
    expect(stripMediaSignature(s.signUrl(avecFormat, T0))).toBe(avecFormat);
  });

  it('laisse intactes data URI, URL externe et valeurs vides', () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(stripMediaSignature(dataUri)).toBe(dataUri);
    expect(stripMediaSignature('https://exemple.test/moi.jpg')).toBe(
      'https://exemple.test/moi.jpg',
    );
    expect(stripMediaSignature(null)).toBeNull();
    expect(stripMediaSignature(undefined)).toBeNull();
  });

  it('est idempotent', () => {
    const s = svc();
    const canonique = `https://api.clubflow.topdigital.re/media/${ASSET}`;
    const une = stripMediaSignature(s.signUrl(canonique, T0));
    expect(stripMediaSignature(une)).toBe(canonique);
  });
});
