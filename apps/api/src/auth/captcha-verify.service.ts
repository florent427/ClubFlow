import { Injectable, Logger } from '@nestjs/common';

/**
 * Vérification de captcha hCaptcha pour les mutations publiques (signup, etc.).
 *
 * Comportement :
 *  - Si `HCAPTCHA_SECRET` n'est PAS défini → captcha désactivé (dev local,
 *    test). Toutes les vérifications retournent `true` avec un warning log.
 *  - Si `HCAPTCHA_SECRET` est défini → on POST vers
 *    `https://api.hcaptcha.com/siteverify` avec le token fourni par le
 *    client et on retourne `success`.
 *
 * Doc hCaptcha : https://docs.hcaptcha.com/#verify-the-user-response-server-side
 */
@Injectable()
export class CaptchaVerifyService {
  private readonly logger = new Logger(CaptchaVerifyService.name);
  private warnedDisabled = false;

  /**
   * @returns true si OK (ou captcha désactivé), false si rejeté.
   */
  async verify(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
    const secret = process.env.HCAPTCHA_SECRET?.trim();
    if (!secret) {
      if (!this.warnedDisabled) {
        this.logger.warn(
          'HCAPTCHA_SECRET non défini — vérification captcha désactivée (OK en dev, à activer en prod).',
        );
        this.warnedDisabled = true;
      }
      return true;
    }
    if (!token || typeof token !== 'string' || token.length < 10) {
      this.logger.warn('Captcha token absent ou invalide.');
      return false;
    }

    try {
      const body = new URLSearchParams({ secret, response: token });
      if (remoteIp) body.set('remoteip', remoteIp);
      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`hCaptcha siteverify HTTP ${res.status}`);
        return false;
      }
      const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (!data.success) {
        this.logger.warn(
          `hCaptcha siteverify rejected : ${(data['error-codes'] ?? []).join(',')}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`hCaptcha verify exception : ${(err as Error).message}`);
      // Fail-closed : en cas de panne hCaptcha, on rejette plutôt que de
      // laisser passer (sinon attaquant peut juste DoS hCaptcha pour bypass).
      return false;
    }
  }
}
