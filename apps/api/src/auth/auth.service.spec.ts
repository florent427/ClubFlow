import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_LOGIN_REJECT_MESSAGE } from './constants';
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
