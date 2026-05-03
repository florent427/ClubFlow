import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  VitrineAnnouncement,
  VitrineArticle,
  VitrineArticleChannel,
  VitrineArticleStatus,
  VitrineGalleryPhoto,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return base.length > 0 ? base : 'article';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Extrait un texte brut exploitable depuis un `bodyJson` d'article (qui peut
 * être `{ format: 'html', html: '...' }` ou un `string[]` legacy ou un JSON
 * inconnu). Tronque à `maxChars` en coupant au dernier espace propre.
 */
function extractPlainBody(
  bodyJson: unknown,
  opts: { fallbackExcerpt?: string | null; maxChars: number },
): string {
  const fallback = opts.fallbackExcerpt?.trim();
  let raw = '';
  if (
    bodyJson &&
    typeof bodyJson === 'object' &&
    !Array.isArray(bodyJson) &&
    (bodyJson as Record<string, unknown>).format === 'html' &&
    typeof (bodyJson as Record<string, unknown>).html === 'string'
  ) {
    // Strip HTML tags, decode quelques entités courantes.
    raw = (bodyJson as { html: string }).html
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else if (Array.isArray(bodyJson)) {
    raw = (bodyJson as unknown[])
      .filter((s): s is string => typeof s === 'string')
      .join('\n\n')
      .trim();
  } else if (typeof bodyJson === 'string') {
    raw = bodyJson.trim();
  }
  if (!raw && fallback) return fallback;
  if (raw.length <= opts.maxChars) return raw || fallback || '';
  const cutAt = raw.lastIndexOf(' ', opts.maxChars);
  const hard = cutAt > opts.maxChars / 2 ? cutAt : opts.maxChars;
  return `${raw.slice(0, hard).trim()}…`;
}

/**
 * CRUD pour les contenus vitrine : articles, annonces, photos de galerie.
 *
 * Une seule classe plutôt qu'un service par modèle — tous suivent le même
 * pattern (findMany scope par clubId, CRUD standard) et partagent rien de
 * particulier, donc un gros fichier reste lisible.
 */
@Injectable()
export class VitrineContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Articles ----------

  async listArticlesAdmin(
    clubId: string,
    channel: VitrineArticleChannel | null = null,
  ) {
    return this.prisma.vitrineArticle.findMany({
      where: {
        clubId,
        ...(channel ? { channel } : {}),
      },
      orderBy: [
        { pinned: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      include: {
        coverImage: { select: { publicUrl: true } },
        seoOgImage: { select: { publicUrl: true } },
        categories: {
          select: { id: true, slug: true, name: true, color: true },
        },
      },
    });
  }

  async getArticleByIdAdmin(clubId: string, id: string) {
    return this.prisma.vitrineArticle.findFirst({
      where: { id, clubId },
      include: {
        coverImage: { select: { publicUrl: true } },
        seoOgImage: { select: { publicUrl: true } },
        categories: {
          select: { id: true, slug: true, name: true, color: true },
        },
      },
    });
  }

  async listArticlesPublic(
    clubId: string,
    limit = 20,
    channel: VitrineArticleChannel | null = null,
  ) {
    return this.prisma.vitrineArticle.findMany({
      where: {
        clubId,
        status: 'PUBLISHED',
        publishedAt: { not: null },
        ...(channel ? { channel } : {}),
      },
      orderBy: [
        { pinned: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
      ],
      take: Math.max(1, Math.min(50, limit)),
      include: {
        categories: {
          select: { id: true, slug: true, name: true, color: true },
        },
      },
    });
  }

  async getArticleBySlug(
    clubId: string,
    slug: string,
    { includeDraft = false } = {},
  ) {
    const article = await this.prisma.vitrineArticle.findUnique({
      where: { clubId_slug: { clubId, slug } },
      include: {
        categories: {
          select: { id: true, slug: true, name: true, color: true },
        },
      },
    });
    if (!article) return null;
    if (!includeDraft && article.status !== 'PUBLISHED') return null;
    return article;
  }

  async createArticle(
    clubId: string,
    authorUserId: string,
    input: {
      title: string;
      slug?: string;
      excerpt?: string | null;
      bodyJson: Prisma.InputJsonValue;
      coverImageId?: string | null;
      coverImageAlt?: string | null;
      publishNow?: boolean;
      /**
       * Canal de publication. Si absent → BLOG (comportement historique).
       * Permet de créer un brouillon directement dans l'onglet actualités
       * ou blog sans avoir à basculer ensuite.
       */
      channel?: VitrineArticleChannel;
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoKeywords?: string[];
      seoH1?: string | null;
      seoFaq?: Prisma.InputJsonValue | null;
      seoCanonicalUrl?: string | null;
      seoNoindex?: boolean;
      seoOgImageId?: string | null;
    },
  ): Promise<VitrineArticle> {
    const baseSlug = input.slug ?? slugify(input.title);
    const slug = await this.uniqueArticleSlug(clubId, baseSlug);
    const publishNow = input.publishNow === true;
    return this.prisma.vitrineArticle.create({
      data: {
        clubId,
        authorUserId,
        slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        bodyJson: input.bodyJson,
        coverImageId: input.coverImageId ?? null,
        coverImageAlt: input.coverImageAlt ?? null,
        status: publishNow ? 'PUBLISHED' : 'DRAFT',
        channel: input.channel ?? 'BLOG',
        publishedAt: publishNow ? new Date() : null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        seoKeywords: input.seoKeywords ?? [],
        seoH1: input.seoH1 ?? null,
        seoFaqJson: input.seoFaq === undefined ? undefined : input.seoFaq === null ? Prisma.JsonNull : input.seoFaq,
        seoCanonicalUrl: input.seoCanonicalUrl ?? null,
        seoNoindex: input.seoNoindex ?? false,
        seoOgImageId: input.seoOgImageId ?? null,
      },
    });
  }

  async updateArticle(
    clubId: string,
    id: string,
    input: {
      title?: string;
      slug?: string;
      excerpt?: string | null;
      bodyJson?: Prisma.InputJsonValue;
      coverImageId?: string | null;
      coverImageAlt?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoKeywords?: string[];
      seoH1?: string | null;
      seoFaq?: Prisma.InputJsonValue | null;
      seoCanonicalUrl?: string | null;
      seoNoindex?: boolean;
      seoOgImageId?: string | null;
    },
  ): Promise<VitrineArticle> {
    const existing = await this.prisma.vitrineArticle.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    const data: Prisma.VitrineArticleUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      data.slug = await this.uniqueArticleSlug(clubId, input.slug, existing.id);
    }
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.bodyJson !== undefined) data.bodyJson = input.bodyJson;
    if (input.coverImageId !== undefined) {
      data.coverImage = input.coverImageId
        ? { connect: { id: input.coverImageId } }
        : { disconnect: true };
    }
    if (input.coverImageAlt !== undefined) data.coverImageAlt = input.coverImageAlt;

    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.seoKeywords !== undefined) data.seoKeywords = input.seoKeywords;
    if (input.seoH1 !== undefined) data.seoH1 = input.seoH1;
    if (input.seoFaq !== undefined) {
      data.seoFaqJson = input.seoFaq === null ? Prisma.JsonNull : input.seoFaq;
    }
    if (input.seoCanonicalUrl !== undefined) data.seoCanonicalUrl = input.seoCanonicalUrl;
    if (input.seoNoindex !== undefined) data.seoNoindex = input.seoNoindex;
    if (input.seoOgImageId !== undefined) {
      data.seoOgImage = input.seoOgImageId
        ? { connect: { id: input.seoOgImageId } }
        : { disconnect: true };
    }
    return this.prisma.vitrineArticle.update({
      where: { id: existing.id },
      data,
    });
  }

  async setArticleStatus(
    clubId: string,
    id: string,
    status: VitrineArticleStatus,
  ): Promise<VitrineArticle> {
    const existing = await this.prisma.vitrineArticle.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    const publishedAt =
      status === 'PUBLISHED'
        ? (existing.publishedAt ?? new Date())
        : existing.publishedAt;
    return this.prisma.vitrineArticle.update({
      where: { id: existing.id },
      data: { status, publishedAt },
    });
  }

  async deleteArticle(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.vitrineArticle.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.vitrineArticle.delete({ where: { id: existing.id } });
    return true;
  }

  private async uniqueArticleSlug(
    clubId: string,
    desired: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(desired);
    if (!base) throw new BadRequestException('Slug invalide');
    let candidate = base;
    let n = 2;
    while (true) {
      const clash = await this.prisma.vitrineArticle.findFirst({
        where: {
          clubId,
          slug: candidate,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${n}`;
      n += 1;
      if (n > 100) throw new BadRequestException('Slug insatiable');
    }
  }

  // ---------- Annonces ----------

  async listAnnouncementsAdmin(
    clubId: string,
  ): Promise<VitrineAnnouncement[]> {
    return this.prisma.vitrineAnnouncement.findMany({
      where: { clubId },
      orderBy: [
        { pinned: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async listAnnouncementsPublic(
    clubId: string,
  ): Promise<VitrineAnnouncement[]> {
    return this.prisma.vitrineAnnouncement.findMany({
      where: { clubId, publishedAt: { not: null } },
      orderBy: [
        { pinned: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
      ],
      take: 20,
    });
  }

  async createAnnouncement(
    clubId: string,
    input: {
      title: string;
      body: string;
      pinned?: boolean;
      publishNow?: boolean;
    },
  ): Promise<VitrineAnnouncement> {
    return this.prisma.vitrineAnnouncement.create({
      data: {
        clubId,
        title: input.title,
        body: input.body,
        pinned: input.pinned === true,
        publishedAt: input.publishNow === true ? new Date() : null,
      },
    });
  }

  async updateAnnouncement(
    clubId: string,
    id: string,
    input: {
      title?: string;
      body?: string;
      pinned?: boolean;
      publishedAt?: Date | null;
    },
  ): Promise<VitrineAnnouncement> {
    const existing = await this.prisma.vitrineAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Annonce introuvable');
    return this.prisma.vitrineAnnouncement.update({
      where: { id: existing.id },
      data: {
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        pinned: input.pinned ?? existing.pinned,
        publishedAt:
          input.publishedAt !== undefined
            ? input.publishedAt
            : existing.publishedAt,
      },
    });
  }

  async deleteAnnouncement(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.vitrineAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.vitrineAnnouncement.delete({ where: { id: existing.id } });
    return true;
  }

  // ---------- Pin / réordonnancement ----------

  /**
   * Applique un ordre personnalisé (issu d'un drag-and-drop admin) à une
   * liste d'articles. Chaque item de `orderedIds` reçoit un `sortOrder`
   * = index * 10 (pas 10 pour laisser de la marge pour des insertions
   * futures sans tout renuméroter).
   */
  async reorderArticles(
    clubId: string,
    orderedIds: string[],
  ): Promise<void> {
    if (orderedIds.length === 0) return;
    // Vérifie que tous les articles appartiennent au club.
    const rows = await this.prisma.vitrineArticle.findMany({
      where: { clubId, id: { in: orderedIds } },
      select: { id: true },
    });
    if (rows.length !== orderedIds.length) {
      throw new BadRequestException(
        'Certains articles ne sont pas rattachés à ce club.',
      );
    }
    await this.prisma.$transaction(
      orderedIds.map((id, i) =>
        this.prisma.vitrineArticle.update({
          where: { id },
          data: { sortOrder: i * 10 },
        }),
      ),
    );
  }

  async reorderAnnouncements(
    clubId: string,
    orderedIds: string[],
  ): Promise<void> {
    if (orderedIds.length === 0) return;
    const rows = await this.prisma.vitrineAnnouncement.findMany({
      where: { clubId, id: { in: orderedIds } },
      select: { id: true },
    });
    if (rows.length !== orderedIds.length) {
      throw new BadRequestException(
        'Certaines annonces ne sont pas rattachées à ce club.',
      );
    }
    await this.prisma.$transaction(
      orderedIds.map((id, i) =>
        this.prisma.vitrineAnnouncement.update({
          where: { id },
          data: { sortOrder: i * 10 },
        }),
      ),
    );
  }

  async setArticlePinned(
    clubId: string,
    id: string,
    pinned: boolean,
  ): Promise<VitrineArticle> {
    const existing = await this.prisma.vitrineArticle.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    return this.prisma.vitrineArticle.update({
      where: { id: existing.id },
      data: { pinned },
    });
  }

  async setAnnouncementPinned(
    clubId: string,
    id: string,
    pinned: boolean,
  ): Promise<VitrineAnnouncement> {
    const existing = await this.prisma.vitrineAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Annonce introuvable');
    return this.prisma.vitrineAnnouncement.update({
      where: { id: existing.id },
      data: { pinned },
    });
  }

  // ---------- Bascule de canal (actualités ↔ blog) ----------

  /**
   * Bascule un article d'un canal à l'autre (actualités ↔ blog). L'article
   * conserve son id, son slug, son SEO, ses catégories, ses commentaires et
   * son statut — seule sa place dans le site public change (il apparaît
   * désormais sous /actualites au lieu de /blog, ou inversement).
   *
   * Remplace l'ancien couple `promoteAnnouncementToArticle` /
   * `demoteArticleToAnnouncement` : comme actualités et blog partagent
   * maintenant la même structure, plus besoin de conversion destructive.
   */
  async setArticleChannel(
    clubId: string,
    articleId: string,
    channel: VitrineArticleChannel,
  ): Promise<VitrineArticle> {
    const existing = await this.prisma.vitrineArticle.findFirst({
      where: { id: articleId, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    if (existing.channel === channel) return existing;
    return this.prisma.vitrineArticle.update({
      where: { id: existing.id },
      data: { channel },
    });
  }

  // ---------- Galerie ----------

  async listGalleryPhotosPublic(
    clubId: string,
    category: string | null = null,
  ): Promise<(VitrineGalleryPhoto & { publicUrl: string })[]> {
    const rows = await this.prisma.vitrineGalleryPhoto.findMany({
      where: {
        clubId,
        ...(category ? { category } : {}),
      },
      include: { mediaAsset: { select: { publicUrl: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ ...r, publicUrl: r.mediaAsset.publicUrl }));
  }

  async addGalleryPhoto(
    clubId: string,
    input: {
      mediaAssetId: string;
      caption?: string | null;
      category?: string | null;
      sortOrder?: number;
    },
  ): Promise<VitrineGalleryPhoto> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, clubId },
    });
    if (!asset) throw new BadRequestException('MediaAsset introuvable');
    return this.prisma.vitrineGalleryPhoto.create({
      data: {
        clubId,
        mediaAssetId: input.mediaAssetId,
        caption: input.caption ?? null,
        category: input.category ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async updateGalleryPhoto(
    clubId: string,
    id: string,
    input: {
      caption?: string | null;
      category?: string | null;
      sortOrder?: number;
    },
  ): Promise<VitrineGalleryPhoto> {
    const existing = await this.prisma.vitrineGalleryPhoto.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Photo introuvable');
    return this.prisma.vitrineGalleryPhoto.update({
      where: { id: existing.id },
      data: {
        caption: input.caption !== undefined ? input.caption : existing.caption,
        category:
          input.category !== undefined ? input.category : existing.category,
        sortOrder:
          input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
      },
    });
  }

  async deleteGalleryPhoto(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.vitrineGalleryPhoto.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.vitrineGalleryPhoto.delete({
      where: { id: existing.id },
    });
    return true;
  }
}
