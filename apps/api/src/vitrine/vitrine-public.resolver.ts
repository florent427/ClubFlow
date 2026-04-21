import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitVitrineContactInput } from './dto/vitrine-inputs';
import {
  PublicClubBrandingGraph,
  SubmitVitrineContactResult,
  VitrineAnnouncementGraph,
  VitrineArticleGraph,
  VitrineArticleStatusEnum,
  VitrineGalleryPhotoGraph,
  VitrinePageGraph,
  VitrinePageStatusEnum,
} from './models/vitrine-models';
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

  @Query(() => [VitrineArticleGraph], { name: 'publicVitrineArticles' })
  async publicVitrineArticles(
    @Args('clubSlug') clubSlug: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
  ): Promise<VitrineArticleGraph[]> {
    const club = await this.getClubBySlugOrThrow(clubSlug);
    const rows = await this.content.listArticlesPublic(club.id, limit ?? 20);
    // Enrichir avec coverImageUrl
    const coverIds = rows
      .map((r) => r.coverImageId)
      .filter((id): id is string => Boolean(id));
    const covers = coverIds.length
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: coverIds } },
          select: { id: true, publicUrl: true },
        })
      : [];
    const coverMap = new Map(covers.map((c) => [c.id, c.publicUrl]));
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      bodyJson: JSON.stringify(r.bodyJson ?? []),
      coverImageUrl: r.coverImageId ? (coverMap.get(r.coverImageId) ?? null) : null,
      status: r.status as VitrineArticleStatusEnum,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
    }));
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
    let coverUrl: string | null = null;
    if (row.coverImageId) {
      const cover = await this.prisma.mediaAsset.findUnique({
        where: { id: row.coverImageId },
        select: { publicUrl: true },
      });
      coverUrl = cover?.publicUrl ?? null;
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      bodyJson: JSON.stringify(row.bodyJson ?? []),
      coverImageUrl: coverUrl,
      status: row.status as VitrineArticleStatusEnum,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };
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
}
