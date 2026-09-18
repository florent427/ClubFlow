import {
  buildUnsubscribeToken,
  readUnsubscribeToken,
  unsubscribeSecret,
} from './unsubscribe-token';

const SECRET = 'secret-de-signature-du-serveur';

describe('jeton de désinscription', () => {
  it('rend l’adresse et le club qu’il porte', () => {
    const token = buildUnsubscribeToken(
      { clubId: 'club-1', email: 'Parent@Exemple.FR ' },
      SECRET,
    );

    expect(readUnsubscribeToken(token, SECRET)).toEqual({
      clubId: 'club-1',
      // Normalisée à l'émission : la liste de suppression compare ainsi.
      email: 'parent@exemple.fr',
    });
  });

  it('refuse un jeton dont la charge a été modifiée', () => {
    const token = buildUnsubscribeToken(
      { clubId: 'club-1', email: 'parent@exemple.fr' },
      SECRET,
    );
    const [, signature] = token.split('.');
    const autre = buildUnsubscribeToken(
      { clubId: 'club-1', email: 'voisin@exemple.fr' },
      SECRET,
    ).split('.')[0];

    expect(readUnsubscribeToken(`${autre}.${signature}`, SECRET)).toBeNull();
  });

  it('refuse un jeton signé avec un autre secret', () => {
    const token = buildUnsubscribeToken(
      { clubId: 'club-1', email: 'parent@exemple.fr' },
      'secret-d-un-autre-serveur',
    );

    expect(readUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it('refuse ce qui n’est pas un jeton', () => {
    expect(readUnsubscribeToken('', SECRET)).toBeNull();
    expect(readUnsubscribeToken('sans-point', SECRET)).toBeNull();
    expect(readUnsubscribeToken('a.b.c', SECRET)).toBeNull();
    expect(readUnsubscribeToken('.signature', SECRET)).toBeNull();
  });
});

describe('secret de signature', () => {
  const avant = { ...process.env };
  afterEach(() => {
    process.env = { ...avant };
  });

  it('prend le secret dédié quand il existe', () => {
    process.env.MAIL_UNSUBSCRIBE_SECRET = 'dedie';
    expect(unsubscribeSecret()).toBe('dedie');
  });

  it('à défaut, dérive celui de la vérification d’e-mail', () => {
    delete process.env.MAIL_UNSUBSCRIBE_SECRET;
    process.env.EMAIL_VERIFICATION_SECRET = 'verif';
    const secret = unsubscribeSecret();
    expect(secret).toBe('unsubscribe:verif');
    // Dérivé, donc distinct : un jeton de désinscription ne vaut jamais
    // jeton de vérification, ni l'inverse.
    expect(secret).not.toBe('verif');
  });

  it('sinon celui des jetons de session, le seul posé sur les serveurs', () => {
    delete process.env.MAIL_UNSUBSCRIBE_SECRET;
    delete process.env.EMAIL_VERIFICATION_SECRET;
    process.env.JWT_SECRET = 'secret-des-sessions';
    const secret = unsubscribeSecret();
    expect(secret).toBe('unsubscribe:secret-des-sessions');
    expect(secret).not.toBe('secret-des-sessions');
  });

  it('sans aucun secret, pas de jeton', () => {
    delete process.env.MAIL_UNSUBSCRIBE_SECRET;
    delete process.env.EMAIL_VERIFICATION_SECRET;
    delete process.env.JWT_SECRET;
    expect(unsubscribeSecret()).toBeNull();
  });
});
