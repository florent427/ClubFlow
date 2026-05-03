import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, VitrineCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'categorie'
  );
}

export interface CreateCategoryInput {
  slug?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  slug?: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

/**
 * CRUD pour les catégories d'articles vitrine.
 *
 * Une catégorie est scopée à un club. Chaque article peut appartenir à
 * plusieurs catégories via la table de jointure implicite Prisma
 * `VitrineArticleCategories`.
 */
@Injectable()
export class VitrineCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste toutes les catégories d'un club, triées par sortOrder. */
  async listByClub(
    clubId: string,
  ): Promise<(VitrineCategory & { articleCount: number })[]> {
    const rows = await this.prisma.vitrineCategory.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { articles: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      articleCount: r._count.articles,
    }));
  }

  /**
   * Liste toutes les catégories d'un club pour le public, avec le nombre
   * d'articles publiés. On ne filtre PAS les catégories sans articles :
   * l'UI décide d'afficher / griser / masquer selon le contexte (nav
   * catégorie actuelle, page actualités globale, etc.).
   */
  async listPublicByClub(
    clubId: string,
  ): Promise<(VitrineCategory & { publishedArticleCount: number })[]> {
    const rows = await this.prisma.vitrineCategory.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            articles: {
              where: { status: 'PUBLISHED', publishedAt: { not: null } },
            },
          },
        },
      },
    });
    return rows.map((r) => ({
      ...r,
      publishedArticleCount: r._count.articles,
    }));
  }

  async getBySlug(
    clubId: string,
    slug: string,
  ): Promise<VitrineCategory | null> {
    return this.prisma.vitrineCategory.findUnique({
      where: { clubId_slug: { clubId, slug } },
    });
  }

  async create(
    clubId: string,
    input: CreateCategoryInput,
  ): Promise<VitrineCategory> {
    if (!input.name.trim()) {
      throw new BadRequestException('Nom requis');
    }
    const baseSlug = input.slug ?? slugify(input.name);
    const slug = await this.uniqueSlug(clubId, baseSlug);
    return this.prisma.vitrineCategory.create({
      data: {
        clubId,
        slug,
        name: input.name.trim(),
        description: input.description ?? null,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(
    clubId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<VitrineCategory> {
    const existing = await this.prisma.vitrineCategory.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Catégorie introuvable');
    const data: Prisma.VitrineCategoryUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined && input.slug !== existing.slug) {
      data.slug = await this.uniqueSlug(clubId, input.slug, existing.id);
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.color !== undefined) data.color = input.color;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    return this.prisma.vitrineCategory.update({
      where: { id: existing.id },
      data,
    });
  }

  async delete(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.vitrineCategory.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    // Prisma auto-cascade la table de jointure VitrineArticleCategories
    await this.prisma.vitrineCategory.delete({ where: { id: existing.id } });
    return true;
  }

  /**
   * Met à jour les catégories d'un article (remplace la liste entière).
   * `categoryIds` = [] → retire toutes les catégories.
   */
  async setArticleCategories(
    clubId: string,
    articleId: string,
    categoryIds: string[],
  ): Promise<void> {
    // Vérifie que toutes les catégories appartiennent au club
    if (categoryIds.length > 0) {
      const validCats = await this.prisma.vitrineCategory.findMany({
        where: { clubId, id: { in: categoryIds } },
        select: { id: true },
      });
      if (validCats.length !== categoryIds.length) {
        throw new BadRequestException(
          'Certaines catégories sont introuvables ou appartiennent à un autre club.',
        );
      }
    }
    // Vérifie que l'article appartient au club
    const article = await this.prisma.vitrineArticle.findFirst({
      where: { id: articleId, clubId },
      select: { id: true },
    });
    if (!article) throw new NotFoundException('Article introuvable');

    await this.prisma.vitrineArticle.update({
      where: { id: articleId },
      data: {
        categories: {
          set: categoryIds.map((id) => ({ id })),
        },
      },
    });
  }

  private async uniqueSlug(
    clubId: string,
    desired: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(desired);
    let candidate = base;
    let n = 2;
    while (true) {
      const clash = await this.prisma.vitrineCategory.findFirst({
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
}
