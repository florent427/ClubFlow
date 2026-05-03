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
import { normalizeIpv4, spfTxtIncludesIp4 } from './spf-dns-check';

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

/** Enregistrements d’aide à publier quand l’IP sortante est connue (MVP, pas de DKIM). */
function smtpSuggestedDnsRecords(fqdn: string): MailDnsRecord[] {
  const egress = process.env.SMTP_PUBLIC_EGRESS_IP?.trim() ?? '';
  const ip = normalizeIpv4(egress);
  if (!ip) {
    return [];
  }
  const records: MailDnsRecord[] = [
    {
      type: 'TXT',
      name: '@',
      value: `v=spf1 ip4:${ip} ~all`,
    },
  ];
  const rua = process.env.SMTP_DMARC_RUA_EMAIL?.trim();
  if (rua) {
    const mailto = rua.startsWith('mailto:') ? rua : `mailto:${rua}`;
    records.push({
      type: 'TXT',
      name: '_dmarc',
      value: `v=DMARC1; p=none; rua=${mailto}`,
    });
  }
  return records;
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
      records: smtpSuggestedDnsRecords(norm),
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
      // En DEV (NODE_ENV != production), si le SMTP local est down
      // (ECONNREFUSED, ETIMEDOUT, ECONNRESET), on dégrade gracieusement
      // en console.log au lieu de bloquer le flow utilisateur. Évite
      // qu'un dev sans Mailpit ne puisse pas s'inscrire ou tester
      // les notifications.
      const isConnError =
        e instanceof Error &&
        /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND/.test(e.message);
      const isProd = process.env.NODE_ENV === 'production';
      if (isConnError && !isProd) {
        this.log.warn(
          `[DEV] SMTP local injoignable — email loggé uniquement : ${
            (e as Error).message
          }`,
        );
        // eslint-disable-next-line no-console
        console.log(
          [
            '\n========================================================================',
            '📧 EMAIL SIMULÉ (SMTP local indisponible — démarrer Mailpit pour le voir)',
            `   from    : ${params.from}`,
            `   to      : ${params.to}`,
            `   subject : ${params.subject}`,
            `   replyTo : ${params.replyTo ?? '—'}`,
            `   --- text ---`,
            params.text ?? '(html only)',
            '========================================================================\n',
          ].join('\n'),
        );
        return { providerMessageId: `dev-fallback-${Date.now()}` };
      }
      this.log.warn(`SMTP sendMail: ${e}`);
      throw new Error(
        `Envoi SMTP impossible : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
