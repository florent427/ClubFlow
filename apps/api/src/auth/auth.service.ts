import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { OAuthProvider } from '@prisma/client';
import { ClubsService } from '../clubs/clubs.service';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { FamiliesService } from '../families/families.service';
import { CaddyApiService } from '../infra/caddy.service';
import { CaptchaVerifyService } from './captcha-verify.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ViewerProfileGraph } from '../families/models/viewer-profile.model';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { AUTH_LOGIN_REJECT_MESSAGE } from './constants';
import type { CreateClubAndAdminInput } from './dto/create-club-and-admin.input';
import type { RegisterContactInput } from './dto/register-contact.input';
import { EmailVerificationService } from './email-verification.service';
import { LoginInput } from './dto/login.input';
import type { JwtPayload } from './jwt.strategy';
import { CreateClubAndAdminResult } from './models/create-club-and-admin-result.model';
import { LoginPayload } from './models/login-payload.model';
import { RegisterContactResult } from './models/register-contact-result.model';
import { RequestPasswordResetResult } from './models/request-password-reset-result.model';
import { ResendVerificationResult } from './models/resend-verification-result.model';
import { PasswordResetService } from './password-reset.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly families: FamiliesService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly mail: TransactionalMailService,
    private readonly clubs: ClubsService,
    private readonly caddy: CaddyApiService,
    private readonly captcha: CaptchaVerifyService,
  ) {}

  /**
   * Options de signature des JWT d’accès (login, sélection de profil, etc.).
   * `JWT_EXPIRES_IN` : durée type `15m`, `7d`, `365d`. Valeurs `none`, `never`, `false`, `0`
   * ou variable absente / chaîne vide = pas de claim `exp` (session sans expiration côté JWT).
   */
  private accessTokenSignOptions(): JwtSignOptions {
    const secret = process.env.JWT_SECRET ?? 'change-me-in-development';
    const raw = process.env.JWT_EXPIRES_IN?.trim();
    const opts: JwtSignOptions = { secret };
    if (!raw) {
      return opts;
    }
    const lower = raw.toLowerCase();
    if (
      lower === 'none' ||
      lower === 'never' ||
      lower === 'false' ||
      lower === '0'
    ) {
      return opts;
    }
    opts.expiresIn = raw as JwtSignOptions['expiresIn'];
    return opts;
  }

  private signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign({ ...payload }, this.accessTokenSignOptions());
  }

  private clubIdFromEnv(): string {
    const raw = process.env.CLUB_ID?.trim();
    if (!raw) {
      throw new Error('CLUB_ID manquant');
    }
    return raw;
  }

  private buildVerifyUrl(rawToken: string): string {
    const base = (
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174'
    ).replace(/\/$/, '');
    return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
  }

  private buildResetUrl(rawToken: string): string {
    // Priorité ADMIN_WEB_ORIGIN_PRIMARY (admin) : la majorité des comptes
    // qui demandent un reset sont des admins de club. Si non défini, fallback
    // vers le portail membre.
    const adminBase = (
      process.env.ADMIN_WEB_ORIGIN_PRIMARY ??
      (process.env.ADMIN_WEB_ORIGIN ?? '').split(',')[0]?.trim() ??
      ''
    ).replace(/\/$/, '');
    const portalBase = (
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174'
    ).replace(/\/$/, '');
    const base = adminBase || portalBase;
    return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private async buildLoginPayload(
    userId: string,
    email: string,
    viewerProfiles: ViewerProfileGraph[],
  ): Promise<LoginPayload> {
    const primary =
      viewerProfiles.find((p) => p.isPrimaryProfile) ?? viewerProfiles[0];
    const jwtPayload: JwtPayload = { sub: userId, email };
    if (primary?.memberId) {
      jwtPayload.activeProfileMemberId = primary.memberId;
    } else if (primary?.contactId) {
      jwtPayload.activeProfileContactId = primary.contactId;
    }
    const clubEnv = process.env.CLUB_ID?.trim();
    let contactClubId: string | null = null;
    if (viewerProfiles.length === 0 && clubEnv) {
      const c = await this.prisma.contact.findUnique({
        where: { userId_clubId: { userId, clubId: clubEnv } },
      });
      contactClubId = c?.clubId ?? null;
      if (c && !jwtPayload.activeProfileContactId) {
        jwtPayload.activeProfileContactId = c.id;
      }
    }
    const accessToken = this.signAccessToken(jwtPayload);
    return { accessToken, viewerProfiles, contactClubId };
  }

  async login(input: LoginInput): Promise<LoginPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException(AUTH_LOGIN_REJECT_MESSAGE);
    }
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(AUTH_LOGIN_REJECT_MESSAGE);
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(AUTH_LOGIN_REJECT_MESSAGE);
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(AUTH_LOGIN_REJECT_MESSAGE);
    }
    const viewerProfiles = await this.families.listViewerProfiles(user.id);
    return this.buildLoginPayload(user.id, user.email, viewerProfiles);
  }

  async registerContact(input: RegisterContactInput): Promise<RegisterContactResult> {
    const clubId = this.clubIdFromEnv();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const displayName = `${input.firstName} ${input.lastName}`.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) {
      throw new ConflictException('USER_ALREADY_EXISTS');
    }

    if (existing && !existing.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, displayName },
      });
      await this.prisma.contact.upsert({
        where: {
          userId_clubId: { userId: existing.id, clubId },
        },
        create: {
          userId: existing.id,
          clubId,
          firstName: input.firstName,
          lastName: input.lastName,
        },
        update: {
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });
      const raw = await this.emailVerification.issueTokenForUser(existing.id);
      await this.mail.sendEmailVerificationLink(
        clubId,
        email,
        this.buildVerifyUrl(raw),
      );
      return { ok: true };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        contacts: {
          create: {
            clubId,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        },
      },
    });
    const raw = await this.emailVerification.issueTokenForUser(user.id);
    await this.mail.sendEmailVerificationLink(
      clubId,
      email,
      this.buildVerifyUrl(raw),
    );
    return { ok: true };
  }

  async verifyEmail(rawToken: string): Promise<LoginPayload> {
    const consumed = await this.emailVerification.consumeRawToken(rawToken);
    if (!consumed) {
      throw new BadRequestException('Lien invalide ou expiré.');
    }
    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: consumed.userId },
    });
    const contacts = await this.prisma.contact.findMany({
      where: { userId: user.id },
      select: { clubId: true },
    });
    for (const c of contacts) {
      await this.families.syncContactUserPayerMemberLinks(c.clubId, user.id);
    }
    const viewerProfiles = await this.families.listViewerProfiles(user.id);
    return this.buildLoginPayload(user.id, user.email, viewerProfiles);
  }

  async resendVerificationEmail(email: string): Promise<ResendVerificationResult> {
    const norm = email.trim().toLowerCase();
    const clubId = this.clubIdFromEnv();
    const user = await this.prisma.user.findUnique({ where: { email: norm } });
    if (user && !user.emailVerifiedAt && user.passwordHash) {
      const raw = await this.emailVerification.issueTokenForUser(user.id);
      await this.mail.sendEmailVerificationLink(
        clubId,
        norm,
        this.buildVerifyUrl(raw),
      );
    }
    return { ok: true };
  }

  async requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
    const norm = email.trim().toLowerCase();
    const clubId = this.clubIdFromEnv();
    const user = await this.prisma.user.findUnique({ where: { email: norm } });
    if (user && user.emailVerifiedAt && user.passwordHash) {
      const raw = await this.passwordReset.issueTokenForUser(user.id);
      await this.mail.sendPasswordResetLink(
        clubId,
        norm,
        this.buildResetUrl(raw),
      );
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<LoginPayload> {
    const consumed = await this.passwordReset.consumeRawToken(rawToken);
    if (!consumed) {
      throw new BadRequestException('Lien invalide ou expiré.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: consumed.userId },
    });
    const viewerProfiles = await this.families.listViewerProfiles(user.id);
    return this.buildLoginPayload(user.id, user.email, viewerProfiles);
  }

  async upsertUserFromGoogleOAuth(oauth: {
    providerSubject: string;
    email: string;
    emailVerified: boolean;
    givenName?: string | null;
    familyName?: string | null;
  }): Promise<LoginPayload> {
    if (!oauth.emailVerified) {
      throw new UnauthorizedException('E-mail Google non vérifié.');
    }
    const clubId = this.clubIdFromEnv();
    const email = oauth.email.trim().toLowerCase();
    const firstName = (oauth.givenName ?? '').trim() || '—';
    const lastName = (oauth.familyName ?? '').trim() || '—';

    const byIdentity = await this.prisma.user.findFirst({
      where: {
        userIdentities: {
          some: {
            provider: OAuthProvider.GOOGLE,
            providerSubject: oauth.providerSubject,
          },
        },
      },
      include: { userIdentities: true },
    });

    let userId: string;
    let userEmail: string;

    if (byIdentity) {
      userId = byIdentity.id;
      userEmail = byIdentity.email;
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerifiedAt: byIdentity.emailVerifiedAt ?? new Date(),
        },
      });
    } else {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        userId = byEmail.id;
        userEmail = byEmail.email;
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
          },
        });
        const hasGoogleId = await this.prisma.userIdentity.findFirst({
          where: {
            provider: OAuthProvider.GOOGLE,
            providerSubject: oauth.providerSubject,
          },
        });
        if (!hasGoogleId) {
          await this.prisma.userIdentity.create({
            data: {
              userId,
              provider: OAuthProvider.GOOGLE,
              providerSubject: oauth.providerSubject,
            },
          });
        }
      } else {
        const created = await this.prisma.user.create({
          data: {
            email,
            emailVerifiedAt: new Date(),
            displayName: `${firstName} ${lastName}`.trim(),
            passwordHash: null,
            userIdentities: {
              create: {
                provider: OAuthProvider.GOOGLE,
                providerSubject: oauth.providerSubject,
              },
            },
            contacts: {
              create: { clubId, firstName, lastName },
            },
          },
        });
        userId = created.id;
        userEmail = created.email;
        await this.families.syncContactUserPayerMemberLinks(clubId, userId, userEmail);
        const viewerProfiles = await this.families.listViewerProfiles(userId);
        return this.buildLoginPayload(userId, userEmail, viewerProfiles);
      }
    }

    await this.prisma.contact.upsert({
      where: { userId_clubId: { userId, clubId } },
      create: { userId, clubId, firstName, lastName },
      update: { firstName, lastName },
    });

    await this.families.syncContactUserPayerMemberLinks(clubId, userId, userEmail);
    const viewerProfiles = await this.families.listViewerProfiles(userId);
    return this.buildLoginPayload(userId, userEmail, viewerProfiles);
  }

  async viewerProfilesForUser(userId: string): Promise<ViewerProfileGraph[]> {
    return this.families.listViewerProfiles(userId);
  }

  async viewerAdminSwitch(
    userId: string,
    viewerClubId: string,
  ): Promise<{ canAccessClubBackOffice: boolean; adminWorkspaceClubId: string | null }> {
    const adminWorkspaceClubId = await resolveAdminWorkspaceClubId(
      this.prisma,
      userId,
      viewerClubId,
    );
    return {
      canAccessClubBackOffice: adminWorkspaceClubId !== null,
      adminWorkspaceClubId,
    };
  }

  async selectActiveProfile(
    userId: string,
    memberId: string,
  ): Promise<LoginPayload> {
    await this.families.assertViewerHasProfile(userId, memberId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const viewerProfiles = await this.families.listViewerProfiles(userId);
    const accessToken = this.signAccessToken({
      sub: userId,
      email: user.email,
      activeProfileMemberId: memberId,
    });
    const clubEnv = process.env.CLUB_ID?.trim();
    let contactClubId: string | null = null;
    if (viewerProfiles.length === 0 && clubEnv) {
      const c = await this.prisma.contact.findUnique({
        where: { userId_clubId: { userId, clubId: clubEnv } },
      });
      contactClubId = c?.clubId ?? null;
    }
    return { accessToken, viewerProfiles, contactClubId };
  }

  /**
   * Mutation publique : signup self-service d'un nouveau club + admin.
   *
   * Crée en une transaction :
   *  1. Un Club (slug auto-généré ou validé) avec modules par défaut
   *     (MEMBERS, FAMILIES, COMMUNICATION) activés.
   *  2. Un User si l'email est libre, OU réutilise un user existant non-vérifié
   *     (anti-stalled-signup). Refuse si l'email est déjà actif sur un compte.
   *  3. Une ClubMembership(role=CLUB_ADMIN) liant ce user au nouveau club.
   *  4. Tente d'envoyer un mail de vérification. Si SMTP n'est pas configuré
   *     (dev sans Mailpit / prod sans Brevo), le user est créé quand même
   *     mais devra vérifier son email plus tard (ou être marqué vérifié
   *     manuellement si superadmin).
   *
   * Anti-énumération : la mutation est rate-limitée au resolver level
   * (`@Throttle` 5/min). Pas de message qui révèle si un email est déjà
   * utilisé — on renvoie une 409 explicite uniquement si l'admin existant
   * est *vérifié* (sinon on permet "reprendre" un signup interrompu).
   */
  async createClubAndAdmin(
    input: CreateClubAndAdminInput,
  ): Promise<CreateClubAndAdminResult> {
    // Captcha gate (rejette les bots avant tout traitement)
    const captchaOk = await this.captcha.verify(input.captchaToken);
    if (!captchaOk) {
      throw new BadRequestException('CAPTCHA_FAILED');
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const displayName = `${input.firstName} ${input.lastName}`.trim();

    // Check email pas déjà actif
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (existingUser?.emailVerifiedAt) {
      throw new ConflictException('USER_ALREADY_EXISTS');
    }

    // Slug : valider la suggestion ou en générer un depuis le nom
    const slug = await this.clubs.generateUniqueSlug(
      input.clubName,
      input.clubSlug,
    );

    // Création club + modules par défaut
    const club = await this.clubs.createClubWithDefaults({
      name: input.clubName,
      slug,
    });

    // User : reuse non-vérifié OU create
    let userId: string;
    if (existingUser && !existingUser.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, displayName },
      });
      userId = existingUser.id;
    } else {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
        },
        select: { id: true },
      });
      userId = user.id;
    }

    // Membership CLUB_ADMIN sur le nouveau club
    await this.prisma.clubMembership.create({
      data: {
        userId,
        clubId: club.id,
        role: 'CLUB_ADMIN',
      },
    });

    // Mail de vérification : best-effort, n'échoue pas le signup si SMTP KO
    let emailSent = false;
    try {
      const rawToken = await this.emailVerification.issueTokenForUser(userId);
      await this.mail.sendEmailVerificationLink(
        club.id,
        email,
        this.buildVerifyUrl(rawToken),
      );
      emailSent = true;
    } catch {
      // Log via console.warn ; l'admin peut être marqué vérifié manuellement
      // ou redemander un mail via resendVerificationEmail plus tard.
      // eslint-disable-next-line no-console
      console.warn(
        `[createClubAndAdmin] Mail verification non envoyé pour ${email} (SMTP KO ou domaine non configuré).`,
      );
    }

    const vitrineBase =
      process.env.VITRINE_PUBLIC_BASE_DOMAIN ?? 'clubflow.topdigital.re';
    const fallbackHost = `${slug}.${vitrineBase}`;

    // Auto-provisioning du vhost vitrine fallback via Caddy admin API.
    // Best-effort : si Caddy KO, on log mais on n'échoue pas le signup
    // (le club est créé, l'admin peut configurer un domaine custom plus tard
    // via Settings → Domaine vitrine, et le cron VitrineDomainCron rattrapera).
    // ⚠️ Le DNS wildcard *.clubflow.topdigital.re doit pointer sur le serveur
    // pour que Caddy obtienne le cert HTTP-01. Cf. runbooks/wildcard-vitrine-subdomain.md.
    try {
      await this.caddy.addVitrineVhost(fallbackHost);
      // eslint-disable-next-line no-console
      console.log(
        `[createClubAndAdmin] Vhost vitrine fallback ${fallbackHost} provisioné via Caddy API.`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[createClubAndAdmin] Caddy addVitrineVhost ${fallbackHost} a échoué : ${(err as Error).message}. Club créé quand même, vitrine fallback inactive jusqu'à intervention manuelle.`,
      );
    }

    return {
      ok: true,
      clubId: club.id,
      clubSlug: club.slug,
      vitrineFallbackUrl: `https://${fallbackHost}`,
      emailSent,
    };
  }

  async selectActiveContactProfile(
    userId: string,
    contactId: string,
  ): Promise<LoginPayload> {
    await this.families.assertViewerHasContactProfile(userId, contactId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const viewerProfiles = await this.families.listViewerProfiles(userId);
    const accessToken = this.signAccessToken({
      sub: userId,
      email: user.email,
      activeProfileContactId: contactId,
    });
    const clubEnv = process.env.CLUB_ID?.trim();
    let contactClubId: string | null = null;
    if (viewerProfiles.length === 0 && clubEnv) {
      const c = await this.prisma.contact.findUnique({
        where: { userId_clubId: { userId, clubId: clubEnv } },
      });
      contactClubId = c?.clubId ?? null;
    }
    return { accessToken, viewerProfiles, contactClubId };
  }
}
