import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  VitrineAnnouncement,
  VitrineArticle,
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

  async listArticlesAdmin(clubId: string): Promise<VitrineArticle[]> {
    return this.prisma.vitrineArticle.findMany({
      where: { clubId },
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async listArticlesPublic(
    clubId: string,
    limit = 20,
  ): Promise<VitrineArticle[]> {
    return this.prisma.vitrineArticle.findMany({
      where: {
        clubId,
        status: 'PUBLISHED',
        publishedAt: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });
  }

  async getArticleBySlug(
    clubId: string,
    slug: string,
    { includeDraft = false } = {},
  ): Promise<VitrineArticle | null> {
    const article = await this.prisma.vitrineArticle.findUnique({
      where: { clubId_slug: { clubId, slug } },
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
      publishNow?: boolean;
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
        status: publishNow ? 'PUBLISHED' : 'DRAFT',
        publishedAt: publishNow ? new Date() : null,
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
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
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
