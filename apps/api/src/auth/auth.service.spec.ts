import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { ClubsService } from '../clubs/clubs.service';
import { FamiliesService } from '../families/families.service';
import type { CaddyApiService } from '../infra/caddy.service';
import type { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CaptchaVerifyService } from './captcha-verify.service';
import { AUTH_LOGIN_REJECT_MESSAGE } from './constants';
import type { CreateClubAndAdminInput } from './dto/create-club-and-admin.input';
import type { RegisterContactInput } from './dto/register-contact.input';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('good', 8);
  });

  it('lance Unauthorized si mot de passe incorrect', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash,
          emailVerifiedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const families = {
      listViewerProfiles: jest.fn().mockResolvedValue([]),
    } as unknown as FamiliesService;
    const emailV = {} as unknown as EmailVerificationService;
    const passwordReset = {} as unknown as PasswordResetService;
    const mail = {
      sendEmailVerificationLink: jest.fn(),
    } as unknown as import('../mail/transactional-mail.service').TransactionalMailService;
    const clubs = {} as unknown as import('../clubs/clubs.service').ClubsService;
    const caddy = {} as unknown as import('../infra/caddy.service').CaddyApiService;
    const captcha = {} as unknown as import('./captcha-verify.service').CaptchaVerifyService;
    const svc = new AuthService(
      prisma,
      jwt,
      families,
      emailV,
      passwordReset,
      mail,
      clubs,
      caddy,
      captcha,
    );
    await expect(
      svc.login({ email: 'a@b.c', password: 'bad' }),
    ).rejects.toThrow(AUTH_LOGIN_REJECT_MESSAGE);
  });

  /** Un compte au mot de passe « good » dont l'e-mail n'est pas vérifié. */
  function serviceCompteNonVerifie() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash,
          emailVerifiedAt: null,
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const families = { listViewerProfiles: jest.fn() } as unknown as FamiliesService;
    const emailV = {} as unknown as EmailVerificationService;
    const passwordReset = {} as unknown as PasswordResetService;
    const mail = {} as unknown as import('../mail/transactional-mail.service').TransactionalMailService;
    const clubs = {} as unknown as import('../clubs/clubs.service').ClubsService;
    const caddy = {} as unknown as import('../infra/caddy.service').CaddyApiService;
    const captcha = {} as unknown as import('./captcha-verify.service').CaptchaVerifyService;
    const svc = new AuthService(prisma, jwt, families, emailV, passwordReset, mail, clubs, caddy, captcha);
    return { svc, families };
  }

  it('mot de passe correct, e-mail non vérifié : le dit, sans ouvrir de session', async () => {
    const { svc, families } = serviceCompteNonVerifie();

    // L'identité est prouvée par le mot de passe : l'état de vérification peut
    // être dit, et c'est ce qui permet à la personne de débloquer son compte.
    await expect(svc.login({ email: 'a@b.c', password: 'good' })).rejects.toThrow(
      'Votre adresse e-mail n’est pas encore vérifiée.',
    );
    expect(families.listViewerProfiles).not.toHaveBeenCalled();
  });

  it('mot de passe faux, e-mail non vérifié : le message générique, rien sur la vérification', async () => {
    const { svc } = serviceCompteNonVerifie();

    // Sans mot de passe prouvé, « non vérifiée » confirmerait qu'un compte
    // existe à cette adresse : l'anti-énumération passe avant.
    await expect(svc.login({ email: 'a@b.c', password: 'bad' })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('lance Unauthorized si compte sans mot de passe (OAuth uniquement)', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash: null,
          emailVerifiedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const families = {
      listViewerProfiles: jest.fn(),
    } as unknown as FamiliesService;
    const emailV = {} as unknown as EmailVerificationService;
    const passwordReset = {} as unknown as PasswordResetService;
    const mail = {} as unknown as import('../mail/transactional-mail.service').TransactionalMailService;
    const clubs = {} as unknown as import('../clubs/clubs.service').ClubsService;
    const caddy = {} as unknown as import('../infra/caddy.service').CaddyApiService;
    const captcha = {} as unknown as import('./captcha-verify.service').CaptchaVerifyService;
    const svc = new AuthService(prisma, jwt, families, emailV, passwordReset, mail, clubs, caddy, captcha);
    await expect(
      svc.login({ email: 'a@b.c', password: 'anything' }),
    ).rejects.toThrow(AUTH_LOGIN_REJECT_MESSAGE);
    expect(families.listViewerProfiles).not.toHaveBeenCalled();
  });
});

/*
 * Parcours d'inscription sur une adresse déjà connue : les tests jouent la
 * scène entière (inscriptions, clic sur le lien reçu, connexion) sur une base
 * en mémoire, parce que la faille ne se voit qu'au bout : c'est la connexion
 * du tiers qui doit échouer, pas une ligne de code qui doit exister.
 */

type UserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  displayName: string | null;
};
type ContactRow = {
  id: string;
  userId: string;
  clubId: string;
  firstName: string;
  lastName: string;
};
type JetonRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

function clausesSimulees(where: object, connues: string[]): void {
  for (const cle of Object.keys(where)) {
    if (!connues.includes(cle)) throw new Error(`Clause non simulée : ${cle}`);
  }
}

/**
 * Base en mémoire écrite en face des requêtes du service : chaque `where` est
 * appliqué tel qu'écrit et une clause inconnue lève
 * (pitfalls/double-ignore-une-clause-du-where.md). Un service qui oublierait
 * `expiresAt` en cherchant un lien en cours ferait rougir un test.
 */
function baseInscription() {
  const users: UserRow[] = [];
  const contacts: ContactRow[] = [];
  const familles: Array<{ id: string; clubId: string; payeurs: string[] }> = [];
  const jetons: JetonRow[] = [];
  const identites: Array<{ userId: string; provider: string; providerSubject: string }> = [];
  const adhesionsClub: Array<{ userId: string; clubId: string; role: string }> = [];
  const clubs = [
    { id: 'club-a', slug: 'club-a', name: 'Dojo A' },
    { id: 'club-b', slug: 'club-b', name: 'Dojo <B>' },
  ];
  let sequence = 0;
  const nouvelId = (prefixe: string) => `${prefixe}-${++sequence}`;

  const prisma = {
    club: {
      findUnique: jest.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        clausesSimulees(where, ['slug', 'id']);
        return (
          clubs.find((c) =>
            where.slug !== undefined ? c.slug === where.slug : c.id === where.id,
          ) ?? null
        );
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        clausesSimulees(where, ['email', 'id']);
        return (
          users.find((u) =>
            where.email !== undefined ? u.email === where.email : u.id === where.id,
          ) ?? null
        );
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        clausesSimulees(where, ['id']);
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error(`User ${where.id} introuvable`);
        return user;
      }),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { userIdentities: { some: { provider: string; providerSubject: string } } };
        }) => {
          clausesSimulees(where, ['userIdentities']);
          const { provider, providerSubject } = where.userIdentities.some;
          const identite = identites.find(
            (i) => i.provider === provider && i.providerSubject === providerSubject,
          );
          const user = identite && users.find((u) => u.id === identite.userId);
          return user
            ? { ...user, userIdentities: identites.filter((i) => i.userId === user.id) }
            : null;
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            email: string;
            passwordHash: string;
            displayName: string;
            contacts?: { create: { clubId: string; firstName: string; lastName: string } };
          };
        }) => {
          const user: UserRow = {
            id: nouvelId('user'),
            email: data.email,
            passwordHash: data.passwordHash,
            emailVerifiedAt: null,
            displayName: data.displayName,
          };
          users.push(user);
          if (data.contacts) {
            contacts.push({ id: nouvelId('contact'), userId: user.id, ...data.contacts.create });
          }
          return { ...user, contacts: contacts.filter((c) => c.userId === user.id) };
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
          clausesSimulees(where, ['id']);
          const user = users.find((u) => u.id === where.id);
          if (!user) throw new Error(`User ${where.id} introuvable`);
          Object.assign(user, data);
          return user;
        },
      ),
    },
    contact: {
      findUnique: jest.fn(
        async ({ where }: { where: { userId_clubId: { userId: string; clubId: string } } }) => {
          clausesSimulees(where, ['userId_clubId']);
          const { userId, clubId } = where.userId_clubId;
          return contacts.find((c) => c.userId === userId && c.clubId === clubId) ?? null;
        },
      ),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
        clausesSimulees(where, ['userId']);
        return contacts.filter((c) => c.userId === where.userId);
      }),
      create: jest.fn(async ({ data }: { data: Omit<ContactRow, 'id'> }) => {
        const contact = { id: nouvelId('contact'), ...data };
        contacts.push(contact);
        return contact;
      }),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_clubId: { userId: string; clubId: string } };
          create: Omit<ContactRow, 'id'>;
          update: Partial<ContactRow>;
        }) => {
          clausesSimulees(where, ['userId_clubId']);
          const { userId, clubId } = where.userId_clubId;
          const existant = contacts.find((c) => c.userId === userId && c.clubId === clubId);
          if (existant) {
            Object.assign(existant, update);
            return existant;
          }
          const contact = { id: nouvelId('contact'), ...create };
          contacts.push(contact);
          return contact;
        },
      ),
    },
    familyMember: {
      findFirst: jest.fn(
        async ({ where }: { where: { contactId: string; family: { clubId: string } } }) => {
          clausesSimulees(where, ['contactId', 'family']);
          const famille = familles.find(
            (f) => f.clubId === where.family.clubId && f.payeurs.includes(where.contactId),
          );
          return famille ? { id: `${famille.id}-lien` } : null;
        },
      ),
    },
    family: {
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            clubId: string;
            familyMembers: { create: Array<{ contactId: string; linkRole: string }> };
          };
        }) => {
          const famille = {
            id: nouvelId('famille'),
            clubId: data.clubId,
            payeurs: data.familyMembers.create
              .filter((m) => m.linkRole === 'PAYER')
              .map((m) => m.contactId),
          };
          familles.push(famille);
          return famille;
        },
      ),
    },
    emailVerificationToken: {
      deleteMany: jest.fn(async ({ where }: { where: { userId: string; consumedAt: null } }) => {
        clausesSimulees(where, ['userId', 'consumedAt']);
        for (let i = jetons.length - 1; i >= 0; i -= 1) {
          if (jetons[i].userId === where.userId && jetons[i].consumedAt === null) {
            jetons.splice(i, 1);
          }
        }
        return { count: 0 };
      }),
      create: jest.fn(
        async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
          const jeton: JetonRow = { id: nouvelId('jeton'), consumedAt: null, ...data };
          jetons.push(jeton);
          return jeton;
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            userId?: string;
            tokenHash?: string;
            consumedAt?: null;
            expiresAt?: { gt: Date };
          };
        }) => {
          clausesSimulees(where, ['userId', 'tokenHash', 'consumedAt', 'expiresAt']);
          return (
            jetons.find(
              (j) =>
                (where.userId === undefined || j.userId === where.userId) &&
                (where.tokenHash === undefined || j.tokenHash === where.tokenHash) &&
                (!('consumedAt' in where) || j.consumedAt === where.consumedAt) &&
                (where.expiresAt === undefined || j.expiresAt > where.expiresAt.gt),
            ) ?? null
          );
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: { consumedAt: Date } }) => {
          clausesSimulees(where, ['id']);
          const jeton = jetons.find((j) => j.id === where.id);
          if (jeton) jeton.consumedAt = data.consumedAt;
          return jeton;
        },
      ),
    },
    userIdentity: {
      findFirst: jest.fn(
        async ({ where }: { where: { provider: string; providerSubject: string } }) => {
          clausesSimulees(where, ['provider', 'providerSubject']);
          return (
            identites.find(
              (i) => i.provider === where.provider && i.providerSubject === where.providerSubject,
            ) ?? null
          );
        },
      ),
      create: jest.fn(
        async ({ data }: { data: { userId: string; provider: string; providerSubject: string } }) => {
          identites.push(data);
          return data;
        },
      ),
    },
    clubMembership: {
      create: jest.fn(async ({ data }: { data: { userId: string; clubId: string; role: string } }) => {
        adhesionsClub.push(data);
        return data;
      }),
    },
  };
  return { prisma, users, contacts, familles, jetons, identites, adhesionsClub };
}

type Envoi = {
  genre: 'verification' | 'compte-existant' | 'reinitialisation';
  to: string;
  url?: string;
  options?: { choosePasswordUrl?: string; clubName?: string; forgotPasswordUrl?: string };
};

function parcoursInscription(base = baseInscription()) {
  const envoyes: Envoi[] = [];
  const mail = {
    sendEmailVerificationLink: jest.fn(
      async (_clubId: string, to: string, url: string, options?: { choosePasswordUrl?: string }) => {
        envoyes.push({ genre: 'verification', to, url, options });
      },
    ),
    sendSignupAttemptOnExistingAccount: jest.fn(
      async (_clubId: string, to: string, options: { clubName: string; forgotPasswordUrl: string }) => {
        envoyes.push({ genre: 'compte-existant', to, options });
      },
    ),
    sendPasswordResetLink: jest.fn(async (_clubId: string, to: string, url: string) => {
      envoyes.push({ genre: 'reinitialisation', to, url });
    }),
  };
  const families = {
    listViewerProfiles: jest.fn().mockResolvedValue([]),
    syncContactUserPayerMemberLinks: jest.fn().mockResolvedValue(undefined),
  };
  const passwordReset = {
    issueTokenForUser: jest.fn().mockResolvedValue('jeton-reinitialisation'),
  };
  const clubs = {
    generateUniqueSlug: jest.fn().mockResolvedValue('club-du-tiers'),
    createClubWithDefaults: jest.fn(async ({ name, slug }: { name: string; slug: string }) => ({
      id: 'club-cree',
      name,
      slug,
    })),
  };
  const caddy = { addVitrineVhost: jest.fn().mockResolvedValue(undefined) };
  const captcha = { verify: jest.fn().mockResolvedValue(true) };
  const prisma = base.prisma as unknown as PrismaService;
  const svc = new AuthService(
    prisma,
    { sign: jest.fn(() => 'jwt') } as unknown as JwtService,
    families as unknown as FamiliesService,
    new EmailVerificationService(prisma),
    passwordReset as unknown as PasswordResetService,
    mail as unknown as TransactionalMailService,
    clubs as unknown as ClubsService,
    caddy as unknown as CaddyApiService,
    captcha as unknown as CaptchaVerifyService,
  );

  /** Ce que fait le titulaire : ouvrir le dernier lien arrivé dans SA boîte. */
  async function ouvrirDernierLien(to: string) {
    const lien = [...envoyes].reverse().find((e) => e.genre === 'verification' && e.to === to);
    if (!lien?.url) throw new Error(`Aucun lien de vérification reçu par ${to}`);
    const jeton = new URL(lien.url).searchParams.get('token');
    if (!jeton) throw new Error('Lien sans jeton');
    return svc.verifyEmail(jeton);
  }

  return { svc, base, envoyes, passwordReset, ouvrirDernierLien };
}

function inscription(
  email: string,
  password: string,
  clubSlug = 'club-a',
  firstName = 'Camille',
  lastName = 'Titulaire',
): RegisterContactInput {
  return { email, password, firstName, lastName, clubSlug };
}

function empreinte(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, 4);
}

/** Les parcours sans `clubSlug` (Google, mot de passe oublié) lisent `CLUB_ID`. */
function avecClubIdEnv() {
  const avant = process.env.CLUB_ID;
  beforeEach(() => {
    process.env.CLUB_ID = 'club-a';
  });
  afterEach(() => {
    if (avant === undefined) delete process.env.CLUB_ID;
    else process.env.CLUB_ID = avant;
  });
}

const CAMILLE = 'camille@exemple.fr';
const SECRET_CAMILLE = 'mot-de-passe-de-camille';
const SECRET_TIERS = 'mot-de-passe-du-tiers';

describe('AuthService.registerContact — adresse d’un compte pas encore vérifié', () => {
  it('un tiers qui se réinscrit pendant le lien du titulaire ne récupère pas le compte', async () => {
    const { svc, base, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-a', 'Tiers', 'Malveillant'));

    // Camille ouvre le lien qu'elle vient de recevoir : son adresse est
    // confirmée et sa session ouverte…
    await expect(ouvrirDernierLien(CAMILLE)).resolves.toMatchObject({ accessToken: 'jwt' });
    // …mais le mot de passe du tiers n'ouvre pas le compte.
    await expect(svc.login({ email: CAMILLE, password: SECRET_TIERS })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
    expect(base.users[0].passwordHash).toBeNull();
  });

  it('le titulaire apprend qu’aucun mot de passe n’est actif, et où en choisir un', async () => {
    const { svc, envoyes } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS));

    expect(envoyes.map((e) => e.genre)).toEqual(['verification', 'verification']);
    expect(envoyes[0].options?.choosePasswordUrl).toBeUndefined();
    expect(envoyes[1].options?.choosePasswordUrl).toMatch(/\/forgot-password$/);
  });

  it('celui qui s’inscrit le premier avec l’adresse d’un autre ne garde pas son mot de passe', async () => {
    const { svc, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-a', 'Tiers', 'Malveillant'));
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));

    await ouvrirDernierLien(CAMILLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_TIERS })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('un tiers qui insiste ne réactive aucun mot de passe', async () => {
    const { svc, base, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS));
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS));

    await ouvrirDernierLien(CAMILLE);

    expect(base.users[0].passwordHash).toBeNull();
    await expect(svc.login({ email: CAMILLE, password: SECRET_TIERS })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('la même personne qui se réinscrit avec le même mot de passe le garde', async () => {
    const { svc, envoyes, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));

    await ouvrirDernierLien(CAMILLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
    expect(envoyes[1].options?.choosePasswordUrl).toBeUndefined();
  });

  it('un contact né d’un formulaire du site (ni mot de passe, ni lien) reçoit le mot de passe choisi', async () => {
    const base = baseInscription();
    base.users.push({
      id: 'user-site',
      email: CAMILLE,
      passwordHash: null,
      emailVerifiedAt: null,
      displayName: 'Camille (formulaire)',
    });
    const { svc, ouvrirDernierLien } = parcoursInscription(base);

    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await ouvrirDernierLien(CAMILLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
  });

  it('un lien expiré ne compte plus comme lien en cours', async () => {
    const base = baseInscription();
    base.users.push({
      id: 'user-site',
      email: CAMILLE,
      passwordHash: null,
      emailVerifiedAt: null,
      displayName: null,
    });
    base.jetons.push({
      id: 'jeton-expire',
      userId: 'user-site',
      tokenHash: 'expire',
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
    });
    const { svc, ouvrirDernierLien } = parcoursInscription(base);

    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    await ouvrirDernierLien(CAMILLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
  });

  it('reprise d’une inscription avec un autre mot de passe : adresse confirmée, mot de passe à choisir', async () => {
    const { svc, base, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    // Le lien de la première tentative a expiré ; Camille recommence avec un
    // autre mot de passe.
    for (const jeton of base.jetons) jeton.expiresAt = new Date(Date.now() - 60_000);
    await svc.registerContact(inscription(CAMILLE, 'autre-mot-de-passe'));

    await ouvrirDernierLien(CAMILLE);

    // Rien ne distingue Camille d'un tiers : aucun des deux mots de passe
    // n'est actif, elle en choisit un par « Mot de passe oublié ».
    await expect(svc.login({ email: CAMILLE, password: 'autre-mot-de-passe' })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('en conflit, ni les noms ni les clubs du compte ne changent', async () => {
    const { svc, base } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE, 'club-a'));
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-b', 'Tiers', 'Malveillant'));

    expect(base.users[0].displayName).toBe('Camille Titulaire');
    expect(base.contacts).toEqual([
      expect.objectContaining({ clubId: 'club-a', firstName: 'Camille', lastName: 'Titulaire' }),
    ]);
    expect(base.familles.map((f) => f.clubId)).toEqual(['club-a']);
  });
});

describe('AuthService.registerContact — adresse d’un compte déjà vérifié', () => {
  async function compteVerifie(passwordHash: string | null) {
    const base = baseInscription();
    base.users.push({
      id: 'user-camille',
      email: CAMILLE,
      passwordHash,
      emailVerifiedAt: new Date('2026-05-01'),
      displayName: 'Camille Titulaire',
    });
    base.contacts.push({
      id: 'contact-a',
      userId: 'user-camille',
      clubId: 'club-a',
      firstName: 'Camille',
      lastName: 'Titulaire',
    });
    return parcoursInscription(base);
  }

  it('avec son mot de passe, rejoint le nouveau club sans e-mail', async () => {
    const { svc, base, envoyes } = await compteVerifie(await empreinte(SECRET_CAMILLE));

    await expect(
      svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE, 'club-b')),
    ).resolves.toEqual({ ok: true, requiresEmailVerification: false });

    expect(base.contacts.map((c) => c.clubId)).toEqual(['club-a', 'club-b']);
    expect(base.familles.map((f) => f.clubId)).toEqual(['club-b']);
    expect(envoyes).toEqual([]);
  });

  it('avec son mot de passe, déjà contact du club : USER_ALREADY_EXISTS', async () => {
    const { svc } = await compteVerifie(await empreinte(SECRET_CAMILLE));

    await expect(
      svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE, 'club-a')),
    ).rejects.toThrow('USER_ALREADY_EXISTS');
  });

  it('sans son mot de passe : rien n’est créé, et seul le titulaire est prévenu', async () => {
    const { svc, base, envoyes } = await compteVerifie(await empreinte(SECRET_CAMILLE));

    await expect(
      svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-b', 'Tiers', 'Malveillant')),
    ).resolves.toEqual({ ok: true, requiresEmailVerification: true });

    expect(base.contacts.map((c) => c.clubId)).toEqual(['club-a']);
    expect(base.familles).toEqual([]);
    expect(base.jetons).toEqual([]);
    expect(base.users[0].displayName).toBe('Camille Titulaire');
    expect(envoyes).toEqual([
      {
        genre: 'compte-existant',
        to: CAMILLE,
        options: {
          clubName: 'Dojo <B>',
          forgotPasswordUrl: expect.stringMatching(/\/forgot-password$/),
        },
      },
    ]);
    // Son mot de passe à elle n'a pas bougé.
    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
  });

  it('un compte sans mot de passe (Google seul) ne reçoit pas celui du formulaire', async () => {
    const { svc, base, envoyes } = await compteVerifie(null);

    await expect(
      svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-b')),
    ).resolves.toEqual({ ok: true, requiresEmailVerification: true });

    expect(base.users[0].passwordHash).toBeNull();
    expect(base.contacts.map((c) => c.clubId)).toEqual(['club-a']);
    expect(envoyes.map((e) => e.genre)).toEqual(['compte-existant']);
  });

  it('la réponse ne distingue ni une adresse neuve, ni un compte en attente, ni un compte vérifié', async () => {
    const neuve = await parcoursInscription().svc.registerContact(
      inscription('neuve@exemple.fr', SECRET_TIERS),
    );

    const enAttente = parcoursInscription();
    await enAttente.svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));
    const conflit = await enAttente.svc.registerContact(inscription(CAMILLE, SECRET_TIERS));

    const verifie = await (
      await compteVerifie(await empreinte(SECRET_CAMILLE))
    ).svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-b'));

    expect(conflit).toEqual(neuve);
    expect(verifie).toEqual(neuve);
  });
});

describe('AuthService.upsertUserFromGoogleOAuth — adresse déjà inscrite', () => {
  avecClubIdEnv();

  const GOOGLE = {
    providerSubject: 'google-camille',
    email: CAMILLE,
    emailVerified: true,
    givenName: 'Camille',
    familyName: 'Titulaire',
  };

  it('un compte jamais vérifié perd le mot de passe posé à l’inscription', async () => {
    const { svc, base } = parcoursInscription();
    // Un tiers a inscrit l'adresse de Camille, et attend qu'elle la confirme.
    await svc.registerContact(inscription(CAMILLE, SECRET_TIERS, 'club-a', 'Tiers', 'Malveillant'));

    await svc.upsertUserFromGoogleOAuth(GOOGLE);

    expect(base.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(base.identites).toEqual([
      expect.objectContaining({ userId: base.users[0].id, providerSubject: 'google-camille' }),
    ]);
    await expect(svc.login({ email: CAMILLE, password: SECRET_TIERS })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('un compte déjà vérifié garde son mot de passe', async () => {
    const base = baseInscription();
    base.users.push({
      id: 'user-camille',
      email: CAMILLE,
      passwordHash: await empreinte(SECRET_CAMILLE),
      emailVerifiedAt: new Date('2026-05-01'),
      displayName: 'Camille Titulaire',
    });
    const { svc } = parcoursInscription(base);

    await svc.upsertUserFromGoogleOAuth(GOOGLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
  });
});

describe('AuthService.requestPasswordReset', () => {
  avecClubIdEnv();

  it('un compte vérifié sans mot de passe peut en choisir un', async () => {
    const base = baseInscription();
    base.users.push({
      id: 'user-camille',
      email: CAMILLE,
      passwordHash: null,
      emailVerifiedAt: new Date('2026-05-01'),
      displayName: null,
    });
    const { svc, envoyes, passwordReset } = parcoursInscription(base);

    await expect(svc.requestPasswordReset(CAMILLE)).resolves.toEqual({ ok: true });

    expect(passwordReset.issueTokenForUser).toHaveBeenCalledWith('user-camille');
    expect(envoyes).toEqual([expect.objectContaining({ genre: 'reinitialisation', to: CAMILLE })]);
  });

  it('une adresse pas encore vérifiée ne reçoit rien', async () => {
    const base = baseInscription();
    base.users.push({
      id: 'user-camille',
      email: CAMILLE,
      passwordHash: await empreinte(SECRET_CAMILLE),
      emailVerifiedAt: null,
      displayName: null,
    });
    const { svc, envoyes, passwordReset } = parcoursInscription(base);

    await expect(svc.requestPasswordReset(CAMILLE)).resolves.toEqual({ ok: true });

    expect(passwordReset.issueTokenForUser).not.toHaveBeenCalled();
    expect(envoyes).toEqual([]);
  });
});

describe('AuthService.createClubAndAdmin — adresse d’un compte pas encore vérifié', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function creationClub(email: string, password: string): CreateClubAndAdminInput {
    return {
      clubName: 'Club du tiers',
      email,
      password,
      firstName: 'Tiers',
      lastName: 'Malveillant',
      captchaToken: 'jeton-captcha',
    };
  }

  it('créer un club ne prend pas le compte en cours d’inscription de quelqu’un d’autre', async () => {
    const { svc, base, envoyes, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));

    await svc.createClubAndAdmin(creationClub(CAMILLE, SECRET_TIERS));

    expect(base.users[0]).toMatchObject({ passwordHash: null, displayName: 'Camille Titulaire' });
    expect(envoyes[envoyes.length - 1].options?.choosePasswordUrl).toMatch(/\/forgot-password$/);
    await ouvrirDernierLien(CAMILLE);
    await expect(svc.login({ email: CAMILLE, password: SECRET_TIERS })).rejects.toThrow(
      AUTH_LOGIN_REJECT_MESSAGE,
    );
  });

  it('la même personne, avec le même mot de passe, le garde', async () => {
    const { svc, ouvrirDernierLien } = parcoursInscription();
    await svc.registerContact(inscription(CAMILLE, SECRET_CAMILLE));

    await svc.createClubAndAdmin({
      ...creationClub(CAMILLE, SECRET_CAMILLE),
      firstName: 'Camille',
      lastName: 'Titulaire',
    });
    await ouvrirDernierLien(CAMILLE);

    await expect(svc.login({ email: CAMILLE, password: SECRET_CAMILLE })).resolves.toMatchObject({
      accessToken: 'jwt',
    });
  });
});
