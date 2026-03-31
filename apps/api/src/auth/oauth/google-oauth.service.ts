import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
};

@Injectable()
export class GoogleOAuthService {
  constructor(private readonly jwt: JwtService) {}

  signState(): string {
    return this.jwt.sign(
      { purpose: 'google-oauth', v: 1 },
      {
        secret: process.env.JWT_SECRET ?? 'change-me-in-development',
        expiresIn: '600s',
      },
    );
  }

  verifyState(state: string | undefined): void {
    if (!state?.trim()) {
      throw new BadRequestException('État OAuth manquant.');
    }
    try {
      const payload = this.jwt.verify<{ purpose?: string }>(state, {
        secret: process.env.JWT_SECRET ?? 'change-me-in-development',
      });
      if (payload.purpose !== 'google-oauth') {
        throw new BadRequestException('État OAuth invalide.');
      }
    } catch {
      throw new BadRequestException('État OAuth expiré ou invalide.');
    }
  }

  getAuthorizeUrl(state: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new BadRequestException(
        'GOOGLE_CLIENT_ID non configuré.',
      );
    }
    const apiBase = (
      process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/$/, '');
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() ??
      `${apiBase}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForUserInfo(code: string): Promise<GoogleUserInfo> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new BadRequestException('OAuth Google non configuré.');
    }
    const apiBase = (
      process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/$/, '');
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() ??
      `${apiBase}/auth/google/callback`;

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokRes.ok) {
      throw new UnauthorizedException('Échange du code Google refusé.');
    }
    const tokJson = (await tokRes.json()) as { access_token?: string };
    if (!tokJson.access_token) {
      throw new UnauthorizedException('Réponse token Google invalide.');
    }

    const uiRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${tokJson.access_token}` },
      },
    );
    if (!uiRes.ok) {
      throw new UnauthorizedException('Profil Google indisponible.');
    }
    return uiRes.json() as Promise<GoogleUserInfo>;
  }
}
