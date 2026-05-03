import { Injectable, Logger } from '@nestjs/common';

/**
 * Déclenche le webhook de revalidation ISR côté Next.js après chaque
 * mutation qui impacte du contenu public.
 *
 * En local/dev, l'URL cible défaut est `http://localhost:5175/api/revalidate`.
 * En prod, configurée via `VITRINE_REVALIDATE_URL` (+ secret partagé).
 *
 * Fire-and-forget : les erreurs sont loggées mais jamais remontées — une
 * mutation admin ne doit pas échouer si Next.js est momentanément down.
 */
@Injectable()
export class VitrineIsrService {
  private readonly logger = new Logger('VitrineIsrService');

  async revalidate(
    clubSlug: string,
    opts: { paths?: string[]; tags?: string[] } = {},
  ): Promise<void> {
    const baseUrl =
      process.env.VITRINE_REVALIDATE_URL ??
      'http://localhost:5175/api/revalidate';
    const secret = process.env.VITRINE_REVALIDATE_SECRET;
    if (!secret) {
      this.logger.warn(
        'VITRINE_REVALIDATE_SECRET non configuré — ISR skip',
      );
      return;
    }
    const tags = [
      ...(opts.tags ?? []),
      // Invalidation large par défaut : tous les fetchers tagués avec le
      // clubSlug. Le plus sûr en Phase 1 — ajustable plus finement plus tard.
      `vitrine-articles:${clubSlug}`,
      `vitrine-announcements:${clubSlug}`,
      `vitrine-gallery:${clubSlug}`,
    ];
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Revalidate-Secret': secret,
        },
        body: JSON.stringify({
          paths: opts.paths ?? ['/'],
          tags,
        }),
        // Court timeout — on ne veut pas bloquer la requête admin.
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        this.logger.warn(
          `Revalidate webhook HTTP ${res.status} (URL=${baseUrl})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Revalidate webhook erreur : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async revalidatePage(clubSlug: string, pageSlug: string): Promise<void> {
    const path = pageSlug === 'index' ? '/' : `/${pageSlug}`;
    return this.revalidate(clubSlug, {
      paths: [path],
      tags: [`vitrine:${clubSlug}:${pageSlug}`],
    });
  }
}
