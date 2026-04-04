/**
 * Abstraction envoi e-mail ; implémentation actuelle : relais **SMTP** (ex. Mailpit, Postfix).
 */
import type { SmtpMailFrom } from './mail-from';

export type MailSendKind = 'transactional' | 'campaign';

export type { SmtpMailFrom };

export type MailDnsRecord = {
  type: string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
};

export type SendClubEmailParams = {
  clubId: string;
  kind: MailSendKind;
  /** Objet From Nodemailer (name + address) — évite un en-tête « string » mal formé. */
  from: SmtpMailFrom;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  /** En-tête List-Unsubscribe (campagnes marketing). */
  listUnsubscribe?: string;
};

export type RegisterDomainResult = {
  providerDomainId: string;
  records: MailDnsRecord[];
};

export type DomainVerificationSnapshot = {
  providerDomainId: string;
  records: MailDnsRecord[];
  /** true si le domaine est prêt à expédier côté fournisseur. */
  verified: boolean;
  /** true si le fournisseur a marqué l’échec de vérification DNS. */
  failed: boolean;
};

export interface MailTransport {
  registerDomain(fqdn: string): Promise<RegisterDomainResult>;
  refreshDomain(providerDomainId: string): Promise<DomainVerificationSnapshot>;
  sendEmail(params: SendClubEmailParams): Promise<{ providerMessageId: string }>;
}
