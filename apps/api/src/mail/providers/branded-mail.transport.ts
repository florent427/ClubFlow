import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  clubMailBranding,
  platformMailBranding,
  type ClubMailBranding,
} from '../branding/club-mail-branding';
import {
  clubMailTextSignature,
  renderClubMailLayout,
} from '../branding/club-mail-layout';
import type {
  DomainVerificationSnapshot,
  MailTransport,
  RegisterDomainResult,
  SendClubEmailParams,
} from '../mail-transport.interface';

/**
 * Habille tout e-mail sortant de la charte du club, puis délègue au transport
 * réel.
 *
 * Posé au **goulot** (le provider `MAIL_TRANSPORT`) et non dans chaque
 * service : les quelque vingt points d'envoi n'ont rien à appeler, et un
 * nouveau point d'envoi est couvert sans que personne y pense. C'est la
 * différence entre une règle et une consigne
 * (cf. pitfall une-supposition-survit-a-la-decision).
 */
export class BrandedMailTransport implements MailTransport {
  private readonly log = new Logger(BrandedMailTransport.name);

  constructor(
    private readonly inner: MailTransport,
    private readonly prisma: PrismaService,
  ) {}

  registerDomain(fqdn: string): Promise<RegisterDomainResult> {
    return this.inner.registerDomain(fqdn);
  }

  refreshDomain(providerDomainId: string): Promise<DomainVerificationSnapshot> {
    return this.inner.refreshDomain(providerDomainId);
  }

  async sendEmail(
    params: SendClubEmailParams,
  ): Promise<{ providerMessageId: string }> {
    const branding = await this.loadBranding(params.clubId);
    const unsubscribeUrl = humanUnsubscribeUrl(params.listUnsubscribe);

    return this.inner.sendEmail({
      ...params,
      html: renderClubMailLayout({
        branding,
        bodyHtml: params.html,
        unsubscribeUrl,
        preheader: params.preheader ?? null,
      }),
      // La version texte doit dire la même chose que la version HTML :
      // sans signature, le lecteur en texte brut perd les coordonnées et
      // le lien de désinscription.
      text: params.text
        ? params.text + clubMailTextSignature(branding, unsubscribeUrl)
        : undefined,
    });
  }

  private async loadBranding(clubId: string): Promise<ClubMailBranding> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        name: true,
        logoUrl: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
        siret: true,
        legalMentions: true,
        vitrinePaletteJson: true,
      },
    });
    if (!club) {
      // Club introuvable : on expédie quand même, habillé en plateforme.
      // Un e-mail non envoyé coûte plus cher qu'un e-mail non signé.
      this.log.warn(
        `Club inconnu ${clubId} — e-mail habillé aux couleurs plateforme.`,
      );
      return platformMailBranding();
    }
    return clubMailBranding(club);
  }
}

/**
 * Adresse de désinscription destinée à un humain. `List-Unsubscribe` liste
 * d'abord l'URL que la boîte mail appelle toute seule (RFC 8058), puis la
 * page du portail : c'est la dernière qu'on met dans le pied.
 */
export function humanUnsubscribeUrl(header?: string): string | null {
  if (!header) {
    return null;
  }
  const urls = [...header.matchAll(/<([^>]+)>/g)]
    .map((m) => m[1].trim())
    .filter((u) => /^https?:\/\//i.test(u));
  return urls.length ? urls[urls.length - 1] : null;
}
