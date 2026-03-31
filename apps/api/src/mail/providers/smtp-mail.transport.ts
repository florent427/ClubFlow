import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
  DomainVerificationSnapshot,
  MailDnsRecord,
  MailTransport,
  RegisterDomainResult,
  SendClubEmailParams,
} from '../mail-transport.interface';
import { fqdnFromSmtpProviderId, smtpProviderIdForFqdn } from './smtp-id';
import { spfTxtIncludesIp4 } from './spf-dns-check';

function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, '');
}

/** Si « true » / absent : « Vérifier » marque le domaine prêt sans appel externe (relais SMTP = vous). */
function smtpAutoVerifyDomain(): boolean {
  const v = process.env.SMTP_AUTO_VERIFY_DOMAIN?.trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

function smtpDnsSpfCheckEnabled(): boolean {
  return process.env.SMTP_DNS_SPF_CHECK?.trim().toLowerCase() === 'true';
}

@Injectable()
export class SmtpMailTransport implements MailTransport {
  private readonly log = new Logger(SmtpMailTransport.name);

  constructor(private readonly transporter: Transporter) {}

  static fromEnv(): SmtpMailTransport {
    const host = process.env.SMTP_HOST?.trim() || '127.0.0.1';
    const port = parseInt(process.env.SMTP_PORT ?? '1025', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth:
        user !== undefined && user !== '' && pass !== undefined
          ? { user, pass: pass ?? '' }
          : undefined,
    });
    return new SmtpMailTransport(transporter);
  }

  async registerDomain(fqdn: string): Promise<RegisterDomainResult> {
    const norm = normalizeFqdn(fqdn);
    return {
      providerDomainId: smtpProviderIdForFqdn(norm),
      records: [],
    };
  }

  async refreshDomain(
    providerDomainId: string,
  ): Promise<DomainVerificationSnapshot> {
    const fqdn = fqdnFromSmtpProviderId(providerDomainId);
    if (smtpDnsSpfCheckEnabled()) {
      const egress = process.env.SMTP_PUBLIC_EGRESS_IP?.trim() ?? '';
      if (!egress) {
        const hint: MailDnsRecord = {
          type: 'TXT',
          name: '@',
          value:
            'Définir SMTP_PUBLIC_EGRESS_IP (ip4 sortante) pour activer SMTP_DNS_SPF_CHECK.',
        };
        return {
          providerDomainId,
          records: [hint],
          verified: false,
          failed: true,
        };
      }
      const ok = await spfTxtIncludesIp4(fqdn, egress);
      return {
        providerDomainId,
        records: [],
        verified: ok,
        failed: !ok,
      };
    }
    const verified = smtpAutoVerifyDomain();
    return {
      providerDomainId,
      records: [],
      verified,
      failed: !verified,
    };
  }

  async sendEmail(
    params: SendClubEmailParams,
  ): Promise<{ providerMessageId: string }> {
    const headers: Record<string, string> = {
      'X-Clubflow-Club-Id': params.clubId,
      'X-Clubflow-Mail-Kind': params.kind,
    };
    if (params.listUnsubscribe) {
      headers['List-Unsubscribe'] = params.listUnsubscribe;
    }
    try {
      const info = await this.transporter.sendMail({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        replyTo: params.replyTo,
        headers,
      });
      const mid =
        typeof info.messageId === 'string' && info.messageId
          ? info.messageId
          : `smtp-${Date.now()}`;
      return { providerMessageId: mid };
    } catch (e) {
      this.log.warn(`SMTP sendMail: ${e}`);
      throw new Error(
        `Envoi SMTP impossible : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
