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
  RemoveSectionListItemInput,
  ReorderSectionListItemsInput,
  ReorderVitrinePageSectionsInput,
  RestoreVitrineRevisionInput,
  SetVitrineArticleStatusInput,
  SetVitrinePageStatusInput,
  UpdateSectionListItemInput,
  UpdateVitrineAnnouncementInput,
  UpdateVitrineArticleInput,
  UpdateVitrineGalleryPhotoInput,
  UpdateVitrinePageSectionInput,
  UpdateVitrinePageSeoInput,
  UpdateVitrineBrandingInput,
  UpdateVitrineSettingsInput,
  UpsertVitrinePageInput,
} from './dto/vitrine-inputs';
import {
  VitrineAnnouncementGraph,
  VitrineArticleGraph,
  VitrineArticleStatusEnum,
  VitrineBrandingGraph,
  VitrineEditTokenGraph,
  VitrineGalleryPhotoGraph,
  VitrinePageGraph,
  VitrinePageRevisionGraph,
  VitrinePageStatusEnum,
  VitrineSettingsGraph,
} from './models/vitrine-models';
import { VitrineContentService } from './vitrine-content.service';
import { VitrineIsrService } from './vitrine-isr.service';
import { VitrinePageService } from './vitrine-page.service';
import { VitrineSettingsService } from './vitrine-settings.service';

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

function articleToGraph(article: {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyJson: unknown;
  coverImage?: { publicUrl: string } | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: Date | null;
  updatedAt: Date;
}): VitrineArticleGraph {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    bodyJson: JSON.stringify(article.bodyJson ?? []),
    coverImageUrl: article.coverImage?.publicUrl ?? null,
    status: article.status as VitrineArticleStatusEnum,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
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
  ): Promise<VitrineArticleGraph[]> {
    const rows = await this.content.listArticlesAdmin(club.id);
    return rows.map((r) => articleToGraph(r));
  }

  @Mutation(() => VitrineArticleGraph)
  async createVitrineArticle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateVitrineArticleInput,
  ): Promise<VitrineArticleGraph> {
    const bodyJson = JSON.parse(input.bodyJson) as Prisma.InputJsonValue;
    const row = await this.content.createArticle(club.id, user.userId, {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? null,
      bodyJson,
      coverImageId: input.coverImageId ?? null,
      publishNow: input.publishNow ?? false,
    });
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites'],
      tags: [`vitrine-articles:${club.slug}`],
    });
    return articleToGraph(row);
  }

  @Mutation(() => VitrineArticleGraph)
  async updateVitrineArticle(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateVitrineArticleInput,
  ): Promise<VitrineArticleGraph> {
    const bodyJson = input.bodyJson
      ? (JSON.parse(input.bodyJson) as Prisma.InputJsonValue)
      : undefined;
    const row = await this.content.updateArticle(club.id, input.id, {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      bodyJson,
      coverImageId: input.coverImageId,
    });
    void this.isr.revalidate(club.slug, {
      paths: ['/', '/actualites', `/actualites/${row.slug}`],
      tags: [
        `vitrine-articles:${club.slug}`,
        `vitrine-article:${club.slug}:${row.slug}`,
      ],
    });
    return articleToGraph(row);
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
}
