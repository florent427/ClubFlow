import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubmitArticleCommentInput,
  SubmitVitrineContactInput,
} from './dto/vitrine-inputs';
import {
  PublicClubBrandingGraph,
  PublicVitrineCommentGraph,
  SubmitCommentResultGraph,
  SubmitVitrineContactResult,
  VitrineAnnouncementGraph,
  VitrineArticleChannelEnum,
  VitrineArticleGenerationStatusEnum,
  VitrineArticleGraph,
  VitrineArticleStatusEnum,
  VitrineCategoryGraph,
  VitrineCommentStatusEnum,
  VitrineGalleryPhotoGraph,
  VitrinePageGraph,
  VitrinePageStatusEnum,
} from './models/vitrine-models';
import { VitrineCategoryService } from './vitrine-category.service';
import { VitrineCommentService } from './vitrine-comment.service';
import { VitrineContactService } from './vitrine-contact.service';
import { VitrineContentService } from './vitrine-content.service';
import { VitrinePageService } from './vitrine-page.service';

/**
 * Resolver public (sans JWT) — servi au site vitrine Next.js.
 *
 * Sécurité :
 *  - Aucune mutation qui modifie l'état métier ici, à l'exception de
 *    `submitVitrineContact` qui est rate-limitée et crée uniquement un
 *    prospect (Contact + User non vérifié).
 *  - Scope strict via `clubSlug` passé en argument → lookup du Club.
 *  - Rate-limit global sur ce resolver : 100/min/IP (aligné avec public-site).
 */
@Resolver()
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class VitrinePublicResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: VitrinePageService,
    private readonly content: VitrineContentService,
    private readonly contact: VitrineContactService,
    private readonly categories: VitrineCategoryService,
    private readonly comments: VitrineCommentService,
  ) {}

  private async getClubBySlugOrThrow(slug: string): Promise<{
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    vitrinePublished: boolean;
  }> {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        vitrinePublished: true,
      },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    return club;
  }

  @Query(() => VitrinePageGraph, {
    name: 'publicVitrinePage',
    nullable: true,
  })
  async publicVitrinePage(
    @Args('clubSlug') clubSlug: string,
    @Args('pageSlug') pageSlug: string,
  ): Promise<VitrinePageGraph | null> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const page = await this.pages.getPublishedBySlug(club.id, pageSlug);
    if (!page) return null;
    // Lookup publicUrl de l'image OG si setée
    let ogUrl: string | null = null;
    if (page.seoOgImageId) {
      const og = await this.prisma.mediaAsset.findUnique({
        where: { id: page.seoOgImageId },
        select: { publicUrl: true },
      });
      ogUrl = og?.publicUrl ?? null;
    }
    return {
      id: page.id,
      slug: page.slug,
      templateKey: page.templateKey,
      status: page.status as VitrinePageStatusEnum,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoOgImageUrl: ogUrl,
      sectionsJson: JSON.stringify(page.sectionsJson ?? []),
      updatedAt: page.updatedAt,
    };
  }

  private mapArticleToGraph(row: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    bodyJson: unknown;
    coverImageId: string | null;
    coverImageAlt: string | null;
    status: string;
    channel?: 'NEWS' | 'BLOG';
    publishedAt: Date | null;
    updatedAt: Date;
    pinned?: boolean;
    sortOrder?: number;
    seoTitle: string | null;
    seoDescription: string | null;
    seoKeywords: string[];
    seoH1: string | null;
    seoFaqJson: unknown;
    seoCanonicalUrl: string | null;
    seoNoindex: boolean;
    seoOgImageId: string | null;
    categories?: Array<{
      id: string;
      slug: string;
      name: string;
      color: string | null;
    }>;
  }, covers: Map<string, string>): VitrineArticleGraph {
    const coverUrl = row.coverImageId ? (covers.get(row.coverImageId) ?? null) : null;
    const ogUrl = row.seoOgImageId ? (covers.get(row.seoOgImageId) ?? null) : null;
    let faq: Array<{ question: string; answer: string }> = [];
    if (Array.isArray(row.seoFaqJson)) {
      for (const item of row.seoFaqJson) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).question === 'string' &&
          typeof (item as Record<string, unknown>).answer === 'string'
        ) {
          faq.push({
            question: (item as { question: string }).question,
            answer: (item as { answer: string }).answer,
          });
        }
      }
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      bodyJson: JSON.stringify(row.bodyJson ?? []),
      coverImageUrl: coverUrl,
      coverImageId: row.coverImageId,
      coverImageAlt: row.coverImageAlt,
      status: row.status as VitrineArticleStatusEnum,
      channel: (row.channel ?? 'BLOG') as VitrineArticleChannelEnum,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      pinned: (row.pinned ?? false) as boolean,
      sortOrder: (row.sortOrder ?? 0) as number,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords ?? [],
      seoH1: row.seoH1,
      seoFaq: faq,
      seoCanonicalUrl: row.seoCanonicalUrl,
      seoNoindex: row.seoNoindex,
      seoOgImageId: row.seoOgImageId,
      seoOgImageUrl: ogUrl,
      // Les champs de génération ne sont pas exposés côté public
      // (détail interne admin). Défauts silencieux.
      generationStatus: 'NONE' as unknown as VitrineArticleGenerationStatusEnum,
      generationProgress: null,
      generationError: null,
      generationWarnings: [],
      categories: (row.categories ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        color: c.color,
      })),
    };
  }

  @Query(() => [VitrineArticleGraph], { name: 'publicVitrineArticles' })
  async publicVitrineArticles(
    @Args('clubSlug') clubSlug: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
    @Args('channel', {
      type: () => VitrineArticleChannelEnum,
      nullable: true,
      description:
        "Filtre par canal : NEWS (/actualites) ou BLOG (/blog). Omis = tous canaux (rétrocompat).",
    })
    channel?: VitrineArticleChannelEnum,
  ): Promise<VitrineArticleGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.content.listArticlesPublic(
      club.id,
      limit ?? 20,
      channel ?? null,
    );
    const assetIds = new Set<string>();
    for (const r of rows) {
      if (r.coverImageId) assetIds.add(r.coverImageId);
      if (r.seoOgImageId) assetIds.add(r.seoOgImageId);
    }
    const assets = assetIds.size
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: [...assetIds] } },
          select: { id: true, publicUrl: true },
        })
      : [];
    const assetMap = new Map(assets.map((c) => [c.id, c.publicUrl]));
    return rows.map((r) => this.mapArticleToGraph(r, assetMap));
  }

  @Query(() => VitrineArticleGraph, {
    name: 'publicVitrineArticle',
    nullable: true,
  })
  async publicVitrineArticle(
    @Args('clubSlug') clubSlug: string,
    @Args('slug') slug: string,
  ): Promise<VitrineArticleGraph | null> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const row = await this.content.getArticleBySlug(club.id, slug);
    if (!row) return null;
    const ids = [row.coverImageId, row.seoOgImageId].filter(
      (x): x is string => Boolean(x),
    );
    const assets = ids.length
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: ids } },
          select: { id: true, publicUrl: true },
        })
      : [];
    const assetMap = new Map(assets.map((c) => [c.id, c.publicUrl]));
    return this.mapArticleToGraph(row, assetMap);
  }

  @Query(() => [VitrineAnnouncementGraph], {
    name: 'publicVitrineAnnouncements',
  })
  async publicVitrineAnnouncements(
    @Args('clubSlug') clubSlug: string,
  ): Promise<VitrineAnnouncementGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    return this.content.listAnnouncementsPublic(club.id);
  }

  @Query(() => [VitrineGalleryPhotoGraph], {
    name: 'publicVitrineGalleryPhotos',
  })
  async publicVitrineGalleryPhotos(
    @Args('clubSlug') clubSlug: string,
    @Args('category', { nullable: true }) category?: string,
  ): Promise<VitrineGalleryPhotoGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.content.listGalleryPhotosPublic(
      club.id,
      category ?? null,
    );
    return rows.map((r) => ({
      id: r.id,
      imageUrl: r.publicUrl,
      caption: r.caption,
      category: r.category,
      sortOrder: r.sortOrder,
    }));
  }

  @Query(() => PublicClubBrandingGraph, {
    name: 'publicClubBranding',
    nullable: true,
  })
  async publicClubBranding(
    @Args('slug') slug: string,
  ): Promise<PublicClubBrandingGraph | null> {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        vitrineKanjiTagline: true,
        vitrineFooterJson: true,
        vitrinePaletteJson: true,
        vitrineFontsJson: true,
      },
    });
    if (!club) return null;
    return {
      clubId: club.id,
      clubName: club.name,
      kanjiTagline: club.vitrineKanjiTagline,
      logoUrl: club.logoUrl,
      footerContent: club.vitrineFooterJson
        ? JSON.stringify(club.vitrineFooterJson)
        : null,
      paletteJson: club.vitrinePaletteJson
        ? JSON.stringify(club.vitrinePaletteJson)
        : null,
      fontsJson: club.vitrineFontsJson
        ? JSON.stringify(club.vitrineFontsJson)
        : null,
    };
  }

  @Mutation(() => SubmitVitrineContactResult, {
    name: 'submitVitrineContact',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submitVitrineContact(
    @Args('input') input: SubmitVitrineContactInput,
  ): Promise<SubmitVitrineContactResult> {
    return this.contact.submit({
      clubSlug: input.clubSlug,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
    });
  }

  // ====================== Catégories publiques ======================

  @Query(() => [VitrineCategoryGraph], { name: 'publicVitrineCategories' })
  async publicVitrineCategories(
    @Args('clubSlug') clubSlug: string,
  ): Promise<VitrineCategoryGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.categories.listPublicByClub(club.id);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      color: r.color,
      sortOrder: r.sortOrder,
      articleCount: r.publishedArticleCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Articles publiés filtrés par catégorie. */
  @Query(() => [VitrineArticleGraph], {
    name: 'publicVitrineArticlesByCategory',
  })
  async publicVitrineArticlesByCategory(
    @Args('clubSlug') clubSlug: string,
    @Args('categorySlug') categorySlug: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
  ): Promise<VitrineArticleGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.prisma.vitrineArticle.findMany({
      where: {
        clubId: club.id,
        status: 'PUBLISHED',
        publishedAt: { not: null },
        categories: { some: { slug: categorySlug } },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.min(50, limit ?? 20)),
    });
    const assetIds = new Set<string>();
    for (const r of rows) {
      if (r.coverImageId) assetIds.add(r.coverImageId);
      if (r.seoOgImageId) assetIds.add(r.seoOgImageId);
    }
    const assets = assetIds.size
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: [...assetIds] } },
          select: { id: true, publicUrl: true },
        })
      : [];
    const assetMap = new Map(assets.map((c) => [c.id, c.publicUrl]));
    return rows.map((r) => this.mapArticleToGraph(r, assetMap));
  }

  // ====================== Commentaires publics ======================

  @Query(() => [PublicVitrineCommentGraph], {
    name: 'publicVitrineArticleComments',
  })
  async publicVitrineArticleComments(
    @Args('clubSlug') clubSlug: string,
    @Args('articleSlug') articleSlug: string,
  ): Promise<PublicVitrineCommentGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.comments.listPublicByArticle(club.id, articleSlug);
    return rows.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      body: r.body,
      createdAt: r.createdAt,
      adminReplyBody: r.adminReplyBody ?? null,
      adminReplyAuthorName: r.adminReplyAuthorName ?? null,
      adminReplyAt: r.adminReplyAt ?? null,
    }));
  }

  @Mutation(() => SubmitCommentResultGraph, { name: 'submitArticleComment' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submitArticleComment(
    @Args('input') input: SubmitArticleCommentInput,
    @Context() ctx: { req?: Request },
  ): Promise<SubmitCommentResultGraph> {
    const ip =
      (ctx.req?.headers?.['x-forwarded-for'] as string | undefined)?.split(
        ',',
      )[0]?.trim() ??
      ctx.req?.socket?.remoteAddress ??
      null;
    const ua = (ctx.req?.headers?.['user-agent'] as string | undefined) ?? null;
    const res = await this.comments.submit({
      clubSlug: input.clubSlug,
      articleSlug: input.articleSlug,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      websiteHoneypot: input.websiteHoneypot,
      ipAddress: ip,
      userAgent: ua,
    });
    return {
      success: res.success,
      commentId: res.commentId ?? null,
      status: res.status as unknown as VitrineCommentStatusEnum,
      message: res.message,
    };
  }
}
