import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ViewerProfileGraph } from '../families/models/viewer-profile.model';
import { LoginInput } from './dto/login.input';
import type { JwtPayload } from './jwt.strategy';
import { LoginPayload } from './models/login-payload.model';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly families: FamiliesService,
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

  async login(input: LoginInput): Promise<LoginPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException();
    }
    const viewerProfiles = await this.families.listViewerProfiles(user.id);
    const primary =
      viewerProfiles.find((p) => p.isPrimaryProfile) ?? viewerProfiles[0];
    const jwtPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      ...(primary ? { activeProfileMemberId: primary.memberId } : {}),
    };
    const accessToken = this.signAccessToken(jwtPayload);
    return { accessToken, viewerProfiles };
  }

  async viewerProfilesForUser(userId: string): Promise<ViewerProfileGraph[]> {
    return this.families.listViewerProfiles(userId);
  }

  /**
   * Accès back-office pour le portail : ne dépend pas du garde « profil membre actif »
   * (utile si viewerMe échoue alors que le JWT et X-Club-Id sont valides).
   */
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
    return { accessToken, viewerProfiles };
  }
}
