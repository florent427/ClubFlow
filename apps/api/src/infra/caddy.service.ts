import { Injectable, Logger } from '@nestjs/common';

/**
 * Wrapper TypeScript pour l'API admin Caddy (port 2019, accessible localhost only).
 *
 * Permet d'ajouter/supprimer des vhosts à chaud sans toucher au Caddyfile,
 * en mode self-service depuis l'admin web.
 *
 * Cf. ADR-0007 (Caddy Admin API vs Caddyfile) pour le pourquoi.
 *
 * **Sécurité** : `localhost:2019` n'est jamais exposé publiquement (firewall ufw).
 * Seule l'API NestJS (sur le même serveur) y accède.
 *
 * **Activation** : sur le serveur, ajouter `{ admin localhost:2019 }` dans le
 * Caddyfile global puis `systemctl reload caddy`. Vérifier `curl http://localhost:2019/config/`.
 */
@Injectable()
export class CaddyApiService {
  private readonly logger = new Logger(CaddyApiService.name);

  /**
   * Base URL de l'API Caddy. Configurable via env pour dev/staging.
   * En prod par défaut : `http://localhost:2019`.
   */
  private get adminBase(): string {
    return process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019';
  }

  /**
   * Cible reverse_proxy par défaut pour les vhosts vitrine clubs (port Next.js vitrine).
   * Configurable via env pour la cohérence avec l'écosystème de la prod.
   */
  private get vitrineUpstream(): string {
    return process.env.VITRINE_UPSTREAM ?? 'localhost:5175';
  }

  /**
   * Vérifie que l'API admin Caddy répond. À appeler au démarrage / health check.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.adminBase}/config/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      this.logger.warn(`Caddy admin API injoignable : ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Liste les vhosts (host headers) actuellement servis par Caddy.
   * Utilisé par le job de réconciliation au boot.
   */
  async listVhosts(): Promise<string[]> {
    const res = await fetch(`${this.adminBase}/config/apps/http/servers/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Caddy GET /config/apps/http/servers : HTTP ${res.status}`);
    }
    const servers = (await res.json()) as Record<string, CaddyServer>;
    const hosts: string[] = [];
    for (const server of Object.values(servers)) {
      for (const route of server.routes ?? []) {
        for (const match of route.match ?? []) {
          if (match.host) hosts.push(...match.host);
        }
      }
    }
    return hosts;
  }

  /**
   * Ajoute un vhost vitrine pour un club : `<domain> → reverse_proxy <vitrineUpstream>`
   * avec TLS auto Let's Encrypt et log dédié.
   *
   * Idempotent : si le domaine est déjà servi, ne fait rien.
   *
   * @throws Si l'API Caddy refuse la config (validation interne, syntaxe, etc.).
   */
  async addVitrineVhost(domain: string): Promise<void> {
    const safe = this.assertDomainShape(domain);
    const existing = await this.listVhosts();
    if (existing.includes(safe)) {
      this.logger.log(`Vhost ${safe} déjà présent, skip add`);
      return;
    }
    const route: CaddyRoute = {
      match: [{ host: [safe] }],
      handle: [
        {
          handler: 'subroute',
          routes: [
            {
              handle: [
                { handler: 'encode', encodings: { gzip: {}, zstd: {} } },
                {
                  handler: 'reverse_proxy',
                  upstreams: [{ dial: this.vitrineUpstream }],
                },
              ],
            },
          ],
        },
      ],
      terminal: true,
    };

    const res = await fetch(
      `${this.adminBase}/config/apps/http/servers/srv0/routes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Caddy POST route ${safe} : HTTP ${res.status} — ${body.slice(0, 200)}`,
      );
    }
    this.logger.log(`Vhost ${safe} ajouté → ${this.vitrineUpstream}`);
  }

  /**
   * Supprime le vhost d'un domaine donné. Idempotent.
   *
   * Note : Caddy révoquera le cert TLS dans son cycle de maintenance
   * (pas immédiat — pas grave, le cert est sur disque local).
   */
  async removeVitrineVhost(domain: string): Promise<void> {
    const safe = this.assertDomainShape(domain);
    const res = await fetch(`${this.adminBase}/config/apps/http/servers/srv0/routes`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Caddy GET routes : HTTP ${res.status}`);
    }
    const routes = (await res.json()) as CaddyRoute[];
    const idx = routes.findIndex((r) =>
      (r.match ?? []).some((m) => (m.host ?? []).includes(safe)),
    );
    if (idx === -1) {
      this.logger.log(`Vhost ${safe} absent, skip remove`);
      return;
    }
    const del = await fetch(
      `${this.adminBase}/config/apps/http/servers/srv0/routes/${idx}`,
      { method: 'DELETE', signal: AbortSignal.timeout(10_000) },
    );
    if (!del.ok) {
      throw new Error(`Caddy DELETE route ${safe} : HTTP ${del.status}`);
    }
    this.logger.log(`Vhost ${safe} supprimé`);
  }

  /**
   * Validation basique du nom de domaine pour éviter les injections.
   * - lowercase
   * - chars autorisés : a-z 0-9 - .
   * - pas de leading/trailing dot/dash
   * - longueur 4-253
   * - au moins 1 dot (sinon ce n'est pas un FQDN)
   */
  private assertDomainShape(domain: string): string {
    const norm = domain.trim().toLowerCase();
    if (
      norm.length < 4 ||
      norm.length > 253 ||
      !/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/.test(norm) ||
      !norm.includes('.')
    ) {
      throw new Error(`Domaine invalide : "${domain}"`);
    }
    return norm;
  }
}

/** Types minimaux de la config JSON Caddy (pas exhaustif). */
type CaddyMatcher = { host?: string[]; [k: string]: unknown };
type CaddyHandler = Record<string, unknown>;
type CaddyRoute = {
  match?: CaddyMatcher[];
  handle?: CaddyHandler[];
  terminal?: boolean;
};
type CaddyServer = { routes?: CaddyRoute[]; listen?: string[] };
