import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';

/**
 * Service utilitaire pour vérifier qu'un nom de domaine pointe sur l'IP
 * publique du serveur ClubFlow. Utilisé par les mutations
 * `verifyVitrineDomain` et le job cron de réconciliation.
 *
 * Compare la résolution A (et AAAA si dispo) contre les valeurs attendues
 * (env `CLUBFLOW_PUBLIC_IPV4` / `CLUBFLOW_PUBLIC_IPV6`, par défaut Hetzner prod).
 */
@Injectable()
export class DnsCheckService {
  private readonly logger = new Logger(DnsCheckService.name);

  private get expectedIpv4(): string {
    return process.env.CLUBFLOW_PUBLIC_IPV4 ?? '89.167.79.253';
  }

  private get expectedIpv6(): string {
    return process.env.CLUBFLOW_PUBLIC_IPV6 ?? '2a01:4f9:c010:99d3::1';
  }

  /**
   * Résout le domaine et vérifie qu'au moins l'A record correspond à l'IP attendue.
   * AAAA est best-effort (peut être absent).
   *
   * @returns objet `{ ok, ipv4, ipv6, error? }`. Ne lance pas d'exception.
   */
  async checkDomain(domain: string): Promise<DnsCheckResult> {
    const safeDomain = domain.trim().toLowerCase();
    if (!safeDomain || !safeDomain.includes('.')) {
      return { ok: false, error: `Domaine invalide : "${domain}"` };
    }

    const result: DnsCheckResult = { ok: false };

    try {
      const a = await dns.resolve4(safeDomain);
      result.ipv4 = a;
      if (!a.includes(this.expectedIpv4)) {
        result.error = `A record ne pointe pas sur ${this.expectedIpv4} (actuel : ${a.join(', ') || 'vide'})`;
        return result;
      }
    } catch (err) {
      result.error = `Résolution A échouée : ${(err as Error).message}`;
      return result;
    }

    // AAAA optionnel — si présent, doit matcher
    try {
      const aaaa = await dns.resolve6(safeDomain);
      result.ipv6 = aaaa;
      if (aaaa.length > 0 && !aaaa.some((ip) => this.normalizeIpv6(ip) === this.normalizeIpv6(this.expectedIpv6))) {
        this.logger.warn(
          `${safeDomain} a un AAAA mais pas vers ${this.expectedIpv6} (actuel : ${aaaa.join(', ')})`,
        );
        // On ne fail pas — IPv6 mauvais c'est dégradé mais ipv4 OK = service marche.
      }
    } catch {
      // AAAA absent : OK, IPv4-only acceptable
    }

    result.ok = true;
    return result;
  }

  /**
   * Normalise une représentation IPv6 (gère les zéros leading/trailing pour
   * la comparaison string-based).
   */
  private normalizeIpv6(ip: string): string {
    // Implémentation minimale : on s'appuie sur Node net.isIPv6 + URL standardization.
    // Pour MVP on fait juste lowercase + trim spaces.
    return ip.trim().toLowerCase();
  }
}

export type DnsCheckResult = {
  ok: boolean;
  ipv4?: string[];
  ipv6?: string[];
  error?: string;
};
