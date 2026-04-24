import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club, Prisma } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubCommManagerRoleGuard } from '../common/guards/club-comm-manager-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import {
  AddSectionListItemInput,
  AddVitrineGalleryPhotoInput,
  CreateVitrineAnnouncementInput,
  CreateVitrineArticleInput,
  CreateVitrineCategoryInput,
  GenerateCommentReplyInput,
  RemoveSectionListItemInput,
  ReorderSectionListItemsInput,
  ReorderVitrinePageSectionsInput,
  RestoreVitrineRevisionInput,
  SetVitrineArticleCategoriesInput,
  SetVitrineArticleStatusInput,
  SetVitrineCommentReplyInput,
  SetVitrineCommentStatusInput,
  SetVitrinePageStatusInput,
  UpdateSectionListItemInput,
  UpdateVitrineAnnouncementInput,
  UpdateVitrineArticleInput,
  UpdateVitrineCategoryInput,
  UpdateVitrineGalleryPhotoInput,
  UpdateVitrinePageSectionInput,
  UpdateVitrinePageSeoInput,
  UpdateVitrineBrandingInput,
  UpdateVitrineSettingsInput,
  UpsertVitrinePageInput,
} from './dto/vitrine-inputs';
import {
  VitrineAnnouncementGraph,
  VitrineArticleChannelEnum,
  VitrineArticleGenerationStatusEnum,
  VitrineArticleGraph,
  VitrineArticleStatusEnum,
  VitrineBrandingGraph,
  VitrineCategoryGraph,
  VitrineCommentGraph,
  VitrineCommentStatusEnum,
  VitrineEditTokenGraph,
  VitrineGalleryPhotoGraph,
  VitrinePageGraph,
  VitrinePageRevisionGraph,
  VitrinePageStatusEnum,
  VitrineSettingsGraph,
} from './models/vitrine-models';
import { VitrineCategoryService } from './vitrine-category.service';
import { VitrineCommentService } from './vitrine-comment.service';
import { VitrineContentService } from './vitrine-content.service';
import { VitrineIsrService } from './vitrine-isr.service';
import { VitrinePageService } from './vitrine-page.service';
import { VitrineSettingsService } from './vitrine-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import type { VitrineCommentStatus } from '@prisma/client';

/**
 * Mappers Prisma → Graph. Les `sectionsJson` / `bodyJson` sont sérialisés
 * en string pour éviter un Scalar Json custom (GraphQL n'en a pas nativement).
 */
function pageToGraph(page: {
  id: string;
  slug: string;
  templateKey: string;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  seoDescription: string | null;
  seoOgImage?: { publicUrl: string } | null;
  sectionsJson: unknown;
  updatedAt: Date;
}): VitrinePageGraph {
  return {
    id: page.id,
    slug: page.slug,
    templateKey: page.templateKey,
    status: page.status as VitrinePageStatusEnum,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    seoOgImageUrl: page.seoOgImage?.publicUrl ?? null,
    sectionsJson: JSON.stringify(page.sectionsJson ?? []),
    updatedAt: page.updatedAt,
  };
}

interface ArticleRowForGraph {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyJson: unknown;
  coverImageId?: string | null;
  coverImageAlt?: string | null;
  coverImage?: { publicUrl: string } | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  channel?: 'NEWS' | 'BLOG';
  publishedAt: Date | null;
  updatedAt: Date;
  pinned?: boolean;
  sortOrder?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[];
  seoH1?: string | null;
  seoFaqJson?: unknown;
  seoCanonicalUrl?: string | null;
  seoNoindex?: boolean;
  seoOgImageId?: string | null;
  seoOgImage?: { publicUrl: string } | null;
  generationStatus?: 'NONE' | 'PENDING' | 'DONE' | 'FAILED';
  generationProgress?: string | null;
  generationError?: string | null;
  generationWarnings?: string[];
  categories?: Array<{
    id: string;
    slug: string;
    name: string;
    color: string | null;
  }>;
}

function articleToGraph(article: ArticleRowForGraph): VitrineArticleGraph {
  let faq: Array<{ question: string; answer: string }> = [];
  const raw = article.seoFaqJson;
  if (Array.isArray(raw)) {
    for (const item of raw) {
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
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    bodyJson: JSON.stringify(article.bodyJson ?? []),
    coverImageUrl: article.coverImage?.publicUrl ?? null,
    coverImageId: article.coverImageId ?? null,
    coverImageAlt: article.coverImageAlt ?? null,
    status: article.status as VitrineArticleStatusEnum,
    channel: (article.channel ?? 'BLOG') as VitrineArticleChannelEnum,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    pinned: (article.pinned ?? false) as boolean,
    sortOrder: (article.sortOrder ?? 0) as number,
    seoTitle: article.seoTitle ?? null,
    seoDescription: article.seoDescription ?? null,
    seoKeywords: article.seoKeywords ?? [],
    seoH1: article.seoH1 ?? null,
    seoFaq: faq,
    seoCanonicalUrl: article.seoCanonicalUrl ?? null,
    seoNoindex: article.seoNoindex ?? false,
    seoOgImageId: article.seoOgImageId ?? null,
    seoOgImageUrl: article.seoOgImage?.publicUrl ?? null,
    generationStatus:
      (article.generationStatus ?? 'NONE') as VitrineArticleGenerationStatusEnum,
    generationProgress: article.generationProgress ?? null,
    generationError: article.generationError ?? null,
    generationWarnings: article.generationWarnings ?? [],
    categories: (article.categories ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      color: c.color,
    })),
  };
}

@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubCommManagerRoleGuard)
export class VitrineAdminResolver {
  constructor(
    private readonly pages: VitrinePageService,
    private readonly content: VitrineContentService,
    private readonly isr: VitrineIsrService,
    private readonly settings: VitrineSettingsService,
    private readonly categories: VitrineCategoryService,
    private readonly comments: VitrineCommentService,
    private readonly prisma: PrismaService,
  ) {}

  private async invalidatePage(
    club: Club,
    pageSlug: string | undefined | null,
  ): Promise<void> {
    if (!pageSlug) {
      await this.isr.revalidate(club.slug);
      return;
    }
    await this.isr.revalidatePage(club.slug, pageSlug);
  }

  // ---------- Pages ----------

  @Query(() => [VitrinePageGraph], { name: 'clubVitrinePages' })
  async clubVitrinePages(
    @CurrentClub() club: Club,
  ): Promise<VitrinePageGraph[]> {
    const rows = await this.pages.listForClub(club.id);
    return rows.map((r) => pageToGraph(r));
  }

  @Query(() => VitrinePageGraph, { name: 'clubVitrinePage', nullable: true })
  async clubVitrinePage(
    @CurrentClub() club: Club,
    @Args('slug') slug: string,
  ): Promise<VitrinePageGraph | null> {
    const row = await this.pages.getBySlug(club.id, slug);
    return row ? pageToGraph(row) : null;
  }

  @Mutation(() => VitrinePageGraph)
  async upsertVitrinePage(
    @CurrentClub() club: Club,
    @Args('input') input: UpsertVitrinePageInput,
  ): Promise<VitrinePageGraph> {
    let sections: Prisma.InputJsonValue;
    try {
      sections = JSON.parse(input.sectionsJson) as Prisma.InputJsonValue;
    } catch {
      throw new Error('sectionsJson doit être un JSON valide');
    }
    const row = await this.pages.upsertPage(club.id, input.slug, {
      templateKey: input.templateKey,
      status: input.status,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      seoOgImageId: input.seoOgImageId,
      sectionsJson: sections,
    });
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async updateVitrinePageSection(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateVitrinePageSectionInput,
  ): Promise<VitrinePageGraph> {
    const patch = JSON.parse(input.patchJson) as Record<string, unknown>;
    const row = await this.pages.updateSection(
      club.id,
      input.pageId,
      input.sectionId,
      patch,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  // ----- Array patches -----

  @Mutation(() => VitrinePageGraph)
  async updateSectionListItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateSectionListItemInput,
  ): Promise<VitrinePageGraph> {
    const patch = JSON.parse(input.patchJson) as Record<string, unknown>;
    const row = await this.pages.updateSectionListItem(
      club.id,
      input.pageId,
      input.sectionId,
      input.listField,
      input.index,
      patch,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async addSectionListItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AddSectionListItemInput,
  ): Promise<VitrinePageGraph> {
    const item = JSON.parse(input.itemJson) as unknown;
    const row = await this.pages.addSectionListItem(
      club.id,
      input.pageId,
      input.sectionId,
      input.listField,
      item,
      input.atIndex ?? null,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async removeSectionListItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RemoveSectionListItemInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.removeSectionListItem(
      club.id,
      input.pageId,
      input.sectionId,
      input.listField,
      input.index,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async reorderSectionListItems(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ReorderSectionListItemsInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.reorderSectionListItems(
      club.id,
      input.pageId,
      input.sectionId,
      input.listField,
      input.newOrder,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async reorderVitrinePageSections(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ReorderVitrinePageSectionsInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.reorderSections(
      club.id,
      input.pageId,
      input.orderedSectionIds,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async updateVitrinePageSeo(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateVitrinePageSeoInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.updateSeo(
      club.id,
      input.pageId,
      {
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        seoOgImageId: input.seoOgImageId,
      },
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async restoreVitrineRevision(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RestoreVitrineRevisionInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.restoreRevision(
      club.id,
      input.pageId,
      input.revisionId,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Mutation(() => VitrinePageGraph)
  async setVitrinePageStatus(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetVitrinePageStatusInput,
  ): Promise<VitrinePageGraph> {
    const row = await this.pages.setStatus(
      club.id,
      input.pageId,
      input.status,
      user.userId,
    );
    void this.invalidatePage(club, row.slug);
    return pageToGraph(row);
  }

  @Query(() => [VitrinePageRevisionGraph])
  async clubVitrinePageRevisions(
    @CurrentClub() club: Club,
    @Args('pageId', { type: () => ID }) pageId: string,
  ): Promise<VitrinePageRevisionGraph[]> {
    const rows = await this.pages.listRevisions(club.id, pageId, 50);
    return rows.map((r) => ({
      id: r.id,
      sectionsJson: JSON.stringify(r.sectionsJson ?? []),
      authorUserId: r.authorUserId,
      createdAt: r.createdAt,
    }));
  }

  // ---------- Articles ----------

  @Query(() => [VitrineArticleGraph], { name: 'clubVitrineArticles' })
  async clubVitrineArticles(
    @CurrentClub() club: Club,
    @Args('channel', {
      type: () => VitrineArticleChannelEnum,
      nullable: true,
      description:
        "Filtre les articles par canal (NEWS ou BLOG). Omis = tous les canaux, comportement par défaut pour rétrocompat.",
    })
    channel?: VitrineArticleChannelEnum,
  ): Promise<VitrineArticleGraph[]> {
    const rows = await this.content.listArticlesAdmin(club.id, channel ?? null);
    return rows.map((r) => articleToGraph(r));
  }

  @Mutation(() => VitrineArticleGraph)
  async createVitrineArticle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateVitrineArticleInput,
  ): Promise<VitrineArticleGraph> {
    const bodyJson = JSON.parse(input.bodyJson) as Prisma.InputJsonValue;
    const seoFaq = input.seoFaqJson
      ? (JSON.parse(input.seoFaqJson) as Prisma.InputJsonValue)
      : undefined;
    const row = await this.content.createArticle(club.id, user.userId, {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? null,
      bodyJson,
      coverImageId: input.coverImageId ?? null,
      coverImageAlt: input.coverImageAlt ?? null,
      publishNow: input.publishNow ?? false,
      channel: input.channel,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      seoKeywords: input.seoKeywords ?? [],
      seoH1: input.seoH1 ?? null,
      seoFaq,
      seoCanonicalUrl: input.seoCanonicalUrl ?? null,
      seoNoindex: input.seoNoindex ?? false,
      seoOgImageId: input.seoOgImageId ?? null,
    });
    const fresh = await this.content.getArticleByIdAdmin(club.id, row.id);
    // Revalide les deux canaux : un article NEWS peut aussi bien s'afficher
    // en page d'accueil via /actualites que sur /blog si basculé plus tard.
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites', '/blog'],
      tags: [`vitrine-articles:${club.slug}`],
    });
    return articleToGraph((fresh ?? row) as ArticleRowForGraph);
  }

  @Mutation(() => VitrineArticleGraph)
  async updateVitrineArticle(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineArticleInput,
  ): Promise<VitrineArticleGraph> {
    const bodyJson = input.bodyJson
      ? (JSON.parse(input.bodyJson) as Prisma.InputJsonValue)
      : undefined;
    let seoFaq: Prisma.InputJsonValue | null | undefined;
    if (input.seoFaqJson !== undefined) {
      if (input.seoFaqJson === null || input.seoFaqJson === '') {
        seoFaq = null;
      } else {
        seoFaq = JSON.parse(input.seoFaqJson) as Prisma.InputJsonValue;
      }
    }
    const row = await this.content.updateArticle(club.id, input.id, {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      bodyJson,
      coverImageId: input.coverImageId,
      coverImageAlt: input.coverImageAlt,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      seoKeywords: input.seoKeywords,
      seoH1: input.seoH1,
      seoFaq,
      seoCanonicalUrl: input.seoCanonicalUrl,
      seoNoindex: input.seoNoindex,
      seoOgImageId: input.seoOgImageId,
    });
    const fresh = await this.content.getArticleByIdAdmin(club.id, row.id);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites', `/actualites/${row.slug}`],
      tags: [
        `vitrine-articles:${club.slug}`,
        `vitrine-article:${club.slug}:${row.slug}`,
      ],
    });
    return articleToGraph((fresh ?? row) as ArticleRowForGraph);
  }

  @Mutation(() => VitrineArticleGraph)
  async setVitrineArticleStatus(
    @CurrentClub() club: Club,
    @Args('input') input: SetVitrineArticleStatusInput,
  ): Promise<VitrineArticleGraph> {
    const row = await this.content.setArticleStatus(
      club.id,
      input.id,
      input.status,
    );
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites', `/actualites/${row.slug}`],
      tags: [
        `vitrine-articles:${club.slug}`,
        `vitrine-article:${club.slug}:${row.slug}`,
      ],
    });
    return articleToGraph(row);
  }

  @Mutation(() => Boolean)
  async deleteVitrineArticle(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const deleted = await this.content.deleteArticle(club.id, id);
    if (deleted) {
      void this.isr.revalidate(club.slug, {
        paths: ['/', '/actualites'],
        tags: [`vitrine-articles:${club.slug}`],
      });
    }
    return deleted;
  }

  // ---------- Annonces ----------

  @Query(() => [VitrineAnnouncementGraph], { name: 'clubVitrineAnnouncements' })
  async clubVitrineAnnouncements(
    @CurrentClub() club: Club,
  ): Promise<VitrineAnnouncementGraph[]> {
    return this.content.listAnnouncementsAdmin(club.id);
  }

  @Mutation(() => VitrineAnnouncementGraph)
  async createVitrineAnnouncement(
    @CurrentClub() club: Club,
    @Args('input') input: CreateVitrineAnnouncementInput,
  ): Promise<VitrineAnnouncementGraph> {
    const row = await this.content.createAnnouncement(club.id, input);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites'],
      tags: [`vitrine-announcements:${club.slug}`],
    });
    return row;
  }

  @Mutation(() => VitrineAnnouncementGraph)
  async updateVitrineAnnouncement(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineAnnouncementInput,
  ): Promise<VitrineAnnouncementGraph> {
    const row = await this.content.updateAnnouncement(club.id, input.id, {
      title: input.title,
      body: input.body,
      pinned: input.pinned,
      publishedAt: input.publishedAt,
    });
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites'],
      tags: [`vitrine-announcements:${club.slug}`],
    });
    return row;
  }

  @Mutation(() => Boolean)
  async deleteVitrineAnnouncement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const deleted = await this.content.deleteAnnouncement(club.id, id);
    if (deleted) {
      void this.isr.revalidate(club.slug, {
        paths: ['/', '/actualites'],
        tags: [`vitrine-announcements:${club.slug}`],
      });
    }
    return deleted;
  }

  // ---------- Pin / réordonnancement (drag-and-drop) ----------

  @Mutation(() => Boolean, {
    description:
      "Applique un ordre personnalisé (drag-and-drop) aux articles. Les index fournis deviennent les sortOrder (× 10 pour laisser de la marge).",
  })
  async reorderVitrineArticles(
    @CurrentClub() club: Club,
    @Args('orderedIds', { type: () => [ID] }) orderedIds: string[],
  ): Promise<boolean> {
    await this.content.reorderArticles(club.id, orderedIds);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/blog'],
      tags: [`vitrine-articles:${club.slug}`],
    });
    return true;
  }

  @Mutation(() => Boolean, {
    description:
      "Applique un ordre personnalisé (drag-and-drop) aux annonces.",
  })
  async reorderVitrineAnnouncements(
    @CurrentClub() club: Club,
    @Args('orderedIds', { type: () => [ID] }) orderedIds: string[],
  ): Promise<boolean> {
    await this.content.reorderAnnouncements(club.id, orderedIds);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites'],
      tags: [`vitrine-announcements:${club.slug}`],
    });
    return true;
  }

  @Mutation(() => VitrineArticleGraph, {
    description:
      "Épingle ou désépingle un article (affichage en tête de la liste /blog).",
  })
  async setVitrineArticlePinned(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('pinned') pinned: boolean,
  ): Promise<VitrineArticleGraph> {
    const row = await this.content.setArticlePinned(club.id, id, pinned);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/blog'],
      tags: [`vitrine-articles:${club.slug}`],
    });
    return row as unknown as VitrineArticleGraph;
  }

  @Mutation(() => VitrineAnnouncementGraph, {
    description: "Épingle ou désépingle une annonce.",
  })
  async setVitrineAnnouncementPinned(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('pinned') pinned: boolean,
  ): Promise<VitrineAnnouncementGraph> {
    const row = await this.content.setAnnouncementPinned(club.id, id, pinned);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites'],
      tags: [`vitrine-announcements:${club.slug}`],
    });
    return row;
  }

  // ---------- Bascule de canal (actualités ↔ blog) ----------

  @Mutation(() => VitrineArticleGraph, {
    description:
      "Bascule un article entre les canaux NEWS (/actualites) et BLOG (/blog). L'article conserve son id, slug, SEO, catégories et commentaires — seul son emplacement public change. Remplace les anciens promote/demote.",
  })
  async setVitrineArticleChannel(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('channel', { type: () => VitrineArticleChannelEnum })
    channel: VitrineArticleChannelEnum,
  ): Promise<VitrineArticleGraph> {
    const row = await this.content.setArticleChannel(club.id, id, channel);
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites', '/blog'],
      tags: [`vitrine-articles:${club.slug}`],
    });
    return row as unknown as VitrineArticleGraph;
  }

  // ---------- Galerie ----------

  @Query(() => [VitrineGalleryPhotoGraph], { name: 'clubVitrineGalleryPhotos' })
  async clubVitrineGalleryPhotos(
    @CurrentClub() club: Club,
    @Args('category', { nullable: true }) category?: string,
  ): Promise<VitrineGalleryPhotoGraph[]> {
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

  @Mutation(() => VitrineGalleryPhotoGraph)
  async addVitrineGalleryPhoto(
    @CurrentClub() club: Club,
    @Args('input') input: AddVitrineGalleryPhotoInput,
  ): Promise<VitrineGalleryPhotoGraph> {
    const row = await this.content.addGalleryPhoto(club.id, {
      mediaAssetId: input.mediaAssetId,
      caption: input.caption,
      category: input.category,
      sortOrder: input.sortOrder,
    });
    const fresh = await this.content.listGalleryPhotosPublic(club.id);
    const enriched = fresh.find((r) => r.id === row.id);
    return {
      id: row.id,
      imageUrl: enriched?.publicUrl ?? '',
      caption: row.caption,
      category: row.category,
      sortOrder: row.sortOrder,
    };
  }

  @Mutation(() => VitrineGalleryPhotoGraph)
  async updateVitrineGalleryPhoto(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineGalleryPhotoInput,
  ): Promise<VitrineGalleryPhotoGraph> {
    const row = await this.content.updateGalleryPhoto(club.id, input.id, {
      caption: input.caption,
      category: input.category,
      sortOrder: input.sortOrder,
    });
    const fresh = await this.content.listGalleryPhotosPublic(club.id);
    const enriched = fresh.find((r) => r.id === row.id);
    return {
      id: row.id,
      imageUrl: enriched?.publicUrl ?? '',
      caption: row.caption,
      category: row.category,
      sortOrder: row.sortOrder,
    };
  }

  @Mutation(() => Boolean)
  async deleteVitrineGalleryPhoto(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const deleted = await this.content.deleteGalleryPhoto(club.id, id);
    if (deleted) {
      void this.isr.revalidate(club.slug, {
        paths: ['/galerie'],
        tags: [`vitrine-gallery:${club.slug}`],
      });
    }
    return deleted;
  }

  // ---------- Settings + edit token ----------

  @Query(() => VitrineSettingsGraph, { name: 'clubVitrineSettings' })
  async clubVitrineSettings(
    @CurrentClub() club: Club,
  ): Promise<VitrineSettingsGraph> {
    return this.settings.getSettings(club.id);
  }

  @Mutation(() => VitrineSettingsGraph)
  async updateClubVitrineSettings(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineSettingsInput,
  ): Promise<VitrineSettingsGraph> {
    const row = await this.settings.updateSettings(club.id, {
      customDomain: input.customDomain,
      vitrinePublished: input.vitrinePublished,
    });
    // Si on publie ou on change de domaine, on invalide tout le site.
    void this.isr.revalidate(club.slug);
    return row;
  }

  @Query(() => VitrineBrandingGraph, { name: 'clubVitrineBranding' })
  async clubVitrineBranding(
    @CurrentClub() club: Club,
  ): Promise<VitrineBrandingGraph> {
    return this.settings.getBranding(club.id);
  }

  @Mutation(() => VitrineBrandingGraph)
  async updateClubVitrineBranding(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineBrandingInput,
  ): Promise<VitrineBrandingGraph> {
    const row = await this.settings.updateBranding(club.id, {
      kanjiTagline: input.kanjiTagline,
      footerJson: input.footerJson,
      paletteJson: input.paletteJson,
      fontsJson: input.fontsJson,
    });
    // Le branding est lu dans le layout racine de la vitrine (applicable à
    // toutes les pages) → invalidation globale.
    void this.isr.revalidate(club.slug);
    return {
      clubName: club.name,
      logoUrl: club.logoUrl,
      kanjiTagline: row.kanjiTagline,
      footerJson: row.footerJson,
      paletteJson: row.paletteJson,
      fontsJson: row.fontsJson,
    };
  }

  /**
   * Émet un JWT court (30 min) qui permet à l'admin d'ouvrir la vitrine en
   * mode édition. Le token est posé en cookie httpOnly côté Next.js via
   * `GET /api/edit/enter?token=...&redirect=/cours`.
   */
  @Mutation(() => VitrineEditTokenGraph)
  async issueVitrineEditToken(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<VitrineEditTokenGraph> {
    const token = await this.settings.issueEditToken(club.id, user.userId);
    return {
      token,
      expiresInSeconds: 30 * 60,
      vitrineBaseUrl:
        process.env.VITRINE_PUBLIC_URL ?? 'http://localhost:5175',
    };
  }

  // ========================= Catégories d'articles =========================

  @Query(() => [VitrineCategoryGraph], { name: 'clubVitrineCategories' })
  async clubVitrineCategories(
    @CurrentClub() club: Club,
  ): Promise<VitrineCategoryGraph[]> {
    const rows = await this.categories.listByClub(club.id);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      color: r.color,
      sortOrder: r.sortOrder,
      articleCount: r.articleCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Mutation(() => VitrineCategoryGraph)
  async createVitrineCategory(
    @CurrentClub() club: Club,
    @Args('input') input: CreateVitrineCategoryInput,
  ): Promise<VitrineCategoryGraph> {
    const row = await this.categories.create(club.id, {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder,
    });
    void this.isr.revalidate(club.slug);
    return { ...row, articleCount: 0 };
  }

  @Mutation(() => VitrineCategoryGraph)
  async updateVitrineCategory(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineCategoryInput,
  ): Promise<VitrineCategoryGraph> {
    const row = await this.categories.update(club.id, input.id, {
      name: input.name,
      slug: input.slug,
      description: input.description,
      color: input.color,
      sortOrder: input.sortOrder,
    });
    void this.isr.revalidate(club.slug);
    return { ...row, articleCount: 0 };
  }

  @Mutation(() => Boolean)
  async deleteVitrineCategory(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const ok = await this.categories.delete(club.id, id);
    if (ok) void this.isr.revalidate(club.slug);
    return ok;
  }

  @Mutation(() => Boolean)
  async setVitrineArticleCategories(
    @CurrentClub() club: Club,
    @Args('input') input: SetVitrineArticleCategoriesInput,
  ): Promise<boolean> {
    await this.categories.setArticleCategories(
      club.id,
      input.articleId,
      input.categoryIds,
    );
    void this.isr.revalidate(club.slug);
    return true;
  }

  // ========================= Commentaires =========================

  @Query(() => [VitrineCommentGraph], { name: 'clubVitrineComments' })
  async clubVitrineComments(
    @CurrentClub() club: Club,
    @Args('status', { type: () => VitrineCommentStatusEnum, nullable: true })
    status?: VitrineCommentStatusEnum,
  ): Promise<VitrineCommentGraph[]> {
    const rows = await this.comments.listAdminByClub(
      club.id,
      status as VitrineCommentStatus | undefined,
    );
    // Joindre title/slug de l'article pour chaque commentaire
    const articleIds = [...new Set(rows.map((r) => r.articleId))];
    const articles = articleIds.length
      ? await this.prisma.vitrineArticle.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
    const articleMap = new Map(
      articles.map((a) => [a.id, { title: a.title, slug: a.slug }]),
    );
    return rows.map((r) => {
      const a = articleMap.get(r.articleId);
      return {
        id: r.id,
        articleId: r.articleId,
        articleSlug: a?.slug ?? '',
        articleTitle: a?.title ?? '',
        authorName: r.authorName,
        authorEmail: r.authorEmail,
        body: r.body,
        status: r.status as VitrineCommentStatusEnum,
        aiScore: r.aiScore,
        aiCategory: r.aiCategory,
        aiReason: r.aiReason,
        adminReplyBody: r.adminReplyBody ?? null,
        adminReplyAuthorName: r.adminReplyAuthorName ?? null,
        adminReplyAt: r.adminReplyAt ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  @Mutation(() => VitrineCommentGraph)
  async setVitrineCommentStatus(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetVitrineCommentStatusInput,
  ): Promise<VitrineCommentGraph> {
    const status = input.status as VitrineCommentStatus;
    const row = await this.comments.setStatus(
      club.id,
      input.id,
      status,
      user.userId,
    );
    void this.isr.revalidate(club.slug);
    return {
      id: row.id,
      articleId: row.articleId,
      articleSlug: '',
      articleTitle: '',
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      body: row.body,
      status: row.status as VitrineCommentStatusEnum,
      aiScore: row.aiScore,
      aiCategory: row.aiCategory,
      aiReason: row.aiReason,
      adminReplyBody: row.adminReplyBody ?? null,
      adminReplyAuthorName: row.adminReplyAuthorName ?? null,
      adminReplyAt: row.adminReplyAt ?? null,
      createdAt: row.createdAt,
    };
  }

  @Mutation(() => Boolean)
  async deleteVitrineComment(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const ok = await this.comments.delete(club.id, id);
    if (ok) void this.isr.revalidate(club.slug);
    return ok;
  }

  /**
   * Génère (sans publier) une réponse IA à un commentaire. L'admin relit
   * le texte retourné puis le valide/édite via `setVitrineCommentReply`
   * pour le publier réellement. Le coût IA est facturé à chaque génération.
   */
  @Mutation(() => String)
  async generateVitrineCommentReply(
    @CurrentClub() club: Club,
    @Args('input') input: GenerateCommentReplyInput,
  ): Promise<string> {
    return this.comments.generateReplyDraft(
      club.id,
      input.commentId,
      input.replyAuthorName ?? null,
    );
  }

  /**
   * Enregistre et publie (ou retire si body vide) une réponse admin sur
   * un commentaire. Cette réponse apparaît sous le commentaire côté public.
   */
  @Mutation(() => VitrineCommentGraph)
  async setVitrineCommentReply(
    @CurrentClub() club: Club,
    @Args('input') input: SetVitrineCommentReplyInput,
  ): Promise<VitrineCommentGraph> {
    const row = await this.comments.setReply(club.id, input.id, {
      replyBody: input.replyBody ?? null,
      replyAuthorName: input.replyAuthorName ?? null,
    });
    void this.isr.revalidate(club.slug);
    return {
      id: row.id,
      articleId: row.articleId,
      articleSlug: '',
      articleTitle: '',
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      body: row.body,
      status: row.status as VitrineCommentStatusEnum,
      aiScore: row.aiScore,
      aiCategory: row.aiCategory,
      aiReason: row.aiReason,
      adminReplyBody: row.adminReplyBody ?? null,
      adminReplyAuthorName: row.adminReplyAuthorName ?? null,
      adminReplyAt: row.adminReplyAt ?? null,
      createdAt: row.createdAt,
    };
  }
}
