import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoint utilisé par Caddy `on_demand_tls { ask ... }` pour autoriser
 * l'émission d'un cert TLS Let's Encrypt à la première requête sur un
 * domaine. Empêche n'importe qui de pointer un DNS sur notre IP et de
 * déclencher une émission de cert (DoS sur les rate limits Let's Encrypt).
 *
 * Caddy appelle GET ?domain=<host>. Réponse 200 = autorise, 4xx = refuse.
 *
 * Politique :
 *  - autorise tout `*.clubflow.topdigital.re` (vitrine fallback subdomain)
 *  - autorise tout domaine présent dans `Club.customDomain`
 *  - refuse le reste
 *
 * Cf. ADR-0007 (Caddy admin API) et bin/bootstrap-multitenant.sh.
 */
@Controller('v1/vitrine')
export class VitrineCheckDomainController {
  private readonly publicBase: string;

  constructor(private readonly prisma: PrismaService) {
    this.publicBase = (
      process.env.VITRINE_PUBLIC_BASE_DOMAIN ?? 'clubflow.topdigital.re'
    )
      .trim()
      .toLowerCase();
  }

  @Get('check-domain')
  async checkDomain(@Query('domain') domain: string, @Res() res: Response) {
    const host = (domain ?? '').trim().toLowerCase();
    if (!host) {
      return res.status(HttpStatus.BAD_REQUEST).send('domain query missing');
    }

    // Wildcard subdomain : *.clubflow.topdigital.re
    // (mais pas exactement clubflow.topdigital.re, ça c'est la landing)
    if (
      host.endsWith(`.${this.publicBase}`) &&
      host !== this.publicBase &&
      host !== `app.${this.publicBase}` &&
      host !== `api.${this.publicBase}` &&
      host !== `portail.${this.publicBase}`
    ) {
      return res.status(HttpStatus.OK).send('ok-wildcard');
    }

    // Custom domain : présent dans Club.customDomain (avec vhost déjà ajouté
    // par CaddyApiService normalement, mais on autorise aussi ici par sécurité)
    const club = await this.prisma.club.findUnique({
      where: { customDomain: host },
      select: { id: true },
    });
    if (club) {
      return res.status(HttpStatus.OK).send('ok-custom');
    }

    return res.status(HttpStatus.FORBIDDEN).send('domain not allowed');
  }
}
