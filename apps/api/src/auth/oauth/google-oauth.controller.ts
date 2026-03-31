import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Flux OAuth Google (code) → redirect portail avec JWT en fragment.
 * Voir spec : pas d’open redirect ; origine portail = MEMBER_PORTAL_ORIGIN.
 */
@Controller('auth/google')
@UseGuards(ThrottlerGuard)
export class GoogleOAuthController {
  private readonly log = new Logger(GoogleOAuthController.name);

  constructor(
    private readonly google: GoogleOAuthService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  start(@Res() res: Response): void {
    const state = this.google.signState();
    const url = this.google.getAuthorizeUrl(state);
    res.redirect(302, url);
  }

  @Get('callback')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const portalBase = (
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174'
    ).replace(/\/$/, '');

    if (oauthError) {
      this.log.warn(`Google OAuth error: ${oauthError}`);
      res.redirect(302, `${portalBase}/login?oauth=error`);
      return;
    }
    if (!code?.trim()) {
      res.redirect(302, `${portalBase}/login?oauth=missing_code`);
      return;
    }

    try {
      this.google.verifyState(state);
      const info = await this.google.exchangeCodeForUserInfo(code);
      const payload = await this.auth.upsertUserFromGoogleOAuth({
        providerSubject: info.sub,
        email: info.email,
        emailVerified: info.email_verified === true,
        givenName: info.given_name,
        familyName: info.family_name,
      });
      const token = encodeURIComponent(payload.accessToken);
      const club =
        payload.contactClubId != null
          ? encodeURIComponent(payload.contactClubId)
          : '';
      const hash =
        club !== ''
          ? `access_token=${token}&contact_club_id=${club}`
          : `access_token=${token}`;
      res.redirect(302, `${portalBase}/oauth/callback#${hash}`);
    } catch (e) {
      if (e instanceof BadRequestException) {
        res.redirect(302, `${portalBase}/login?oauth=invalid`);
        return;
      }
      this.log.warn(`Google callback: ${e instanceof Error ? e.message : e}`);
      res.redirect(302, `${portalBase}/login?oauth=failed`);
    }
  }
}
