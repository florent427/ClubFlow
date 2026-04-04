import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { OAuthProvider } from '@prisma/client';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ViewerProfileGraph } from '../families/models/viewer-profile.model';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { AUTH_LOGIN_REJECT_MESSAGE } from './constants';
import type { RegisterContactInput } from './dto/register-contact.input';
import { EmailVerificationService } from './email-verification.service';
import { LoginInput } from './dto/login.input';
import type { JwtPayload } from './jwt.strategy';
import { LoginPayload } from './models/login-payload.model';
import { RegisterContactResult } from './models/register-contact-result.model';
import { ResendVerificationResult } from './models/resend-verification-result.model';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly families: FamiliesService,
    private readonly emailVerification: EmailVerificationService,
    private readonly mail: TransactionalMailService,
  ) {}

  private signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign(
      { ...payload },
      {
        secret: process.env.JWT_SECRET ?? 'change-me-in-development',
        expiresIn: '15m',
      },
    );
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
    const accessToken = this.signAccessToken(jwtPayload);
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
      return { ok: true };
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
