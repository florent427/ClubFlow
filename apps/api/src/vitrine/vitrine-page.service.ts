import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, VitrinePage, VitrinePageRevision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Deep-merge récursif pour les patches d'édition.
 * - Objets plains : merge récursif clé par clé.
 * - Tableaux : remplacés entièrement (pas de merge par index).
 * - Primitives : remplacées par la valeur de la source.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof out[key] === 'object' &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Service CRUD + révisions sur les pages vitrine.
 *
 * Règles métier :
 *  - Un (clubId, slug) est unique
 *  - Chaque `update*` crée une révision de l'état *avant* la modification
 *  - Le stack de révisions est plafonné à `MAX_REVISIONS` par page (LRU)
 *  - `restoreRevision` copie le sectionsJson d'une révision cible vers la
 *    page courante + crée une nouvelle révision de l'état précédent
 *    (permet redo + undo-de-undo)
 */
@Injectable()
export class VitrinePageService {
  static readonly MAX_REVISIONS = 50;

  constructor(private readonly prisma: PrismaService) {}

  private async capRevisions(pageId: string): Promise<void> {
    const total = await this.prisma.vitrinePageRevision.count({
      where: { pageId },
    });
    if (total <= VitrinePageService.MAX_REVISIONS) return;
    const toDelete = await this.prisma.vitrinePageRevision.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
      take: total - VitrinePageService.MAX_REVISIONS,
      select: { id: true },
    });
    if (toDelete.length > 0) {
      await this.prisma.vitrinePageRevision.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }
  }

  private async snapshot(
    pageId: string,
    authorUserId: string | null,
  ): Promise<VitrinePageRevision> {
    const page = await this.prisma.vitrinePage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException('Page introuvable');
    const rev = await this.prisma.vitrinePageRevision.create({
      data: {
        pageId: page.id,
        sectionsJson: page.sectionsJson as Prisma.InputJsonValue,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        authorUserId,
      },
    });
    void this.capRevisions(pageId);
    return rev;
  }

  async listForClub(clubId: string): Promise<VitrinePage[]> {
    return this.prisma.vitrinePage.findMany({
      where: { clubId },
      orderBy: { slug: 'asc' },
    });
  }

  async getBySlug(clubId: string, slug: string): Promise<VitrinePage | null> {
    return this.prisma.vitrinePage.findUnique({
      where: { clubId_slug: { clubId, slug } },
    });
  }

  async getPublishedBySlug(
    clubId: string,
    slug: string,
  ): Promise<VitrinePage | null> {
    const page = await this.prisma.vitrinePage.findUnique({
      where: { clubId_slug: { clubId, slug } },
    });
    if (!page || page.status !== 'PUBLISHED') return null;
    return page;
  }

  async getById(clubId: string, pageId: string): Promise<VitrinePage> {
    const page = await this.prisma.vitrinePage.findFirst({
      where: { id: pageId, clubId },
    });
    if (!page) throw new NotFoundException('Page introuvable');
    return page;
  }

  async upsertPage(
    clubId: string,
    slug: string,
    data: {
      templateKey?: string;
      status?: 'DRAFT' | 'PUBLISHED';
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoOgImageId?: string | null;
      sectionsJson: Prisma.InputJsonValue;
    },
  ): Promise<VitrinePage> {
    const existing = await this.prisma.vitrinePage.findUnique({
      where: { clubId_slug: { clubId, slug } },
    });
    if (existing) {
      await this.snapshot(existing.id, null);
      return this.prisma.vitrinePage.update({
        where: { id: existing.id },
        data: {
          templateKey: data.templateKey ?? existing.templateKey,
          status: data.status ?? existing.status,
          seoTitle: data.seoTitle ?? existing.seoTitle,
          seoDescription: data.seoDescription ?? existing.seoDescription,
          seoOgImageId: data.seoOgImageId ?? existing.seoOgImageId,
          sectionsJson: data.sectionsJson,
        },
      });
    }
    return this.prisma.vitrinePage.create({
      data: {
        clubId,
        slug,
        templateKey: data.templateKey ?? 'sksr-v1',
        status: data.status ?? 'PUBLISHED',
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        seoOgImageId: data.seoOgImageId ?? null,
        sectionsJson: data.sectionsJson,
      },
    });
  }

  /**
   * Met à jour une section (props) dans le tableau `sectionsJson`.
   * Crée une révision avant modification.
   *
   * Deep-merge récursif sur les objets : `{ctaPrimary: {label: 'X'}}` ne
   * remplace pas `ctaPrimary.href`. Les tableaux sont remplacés entièrement
   * (l'édition d'items dans un tableau demandera une API dédiée).
   */
  async updateSection(
    clubId: string,
    pageId: string,
    sectionId: string,
    patch: Record<string, unknown>,
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    const page = await this.getById(clubId, pageId);
    const sections = Array.isArray(page.sectionsJson)
      ? (page.sectionsJson as Array<{
          id: string;
          type: string;
          props: Record<string, unknown>;
        }>)
      : [];
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) {
      throw new NotFoundException('Section introuvable');
    }
    await this.snapshot(pageId, authorUserId);
    sections[idx] = {
      ...sections[idx]!,
      props: deepMerge(sections[idx]!.props, patch),
    };
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: {
        sectionsJson: sections as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Operations ciblées sur un champ tableau d'une section
   * (ex. `metaItems`, `items`, `cards`, `slots`).
   *
   *  - `updateSectionListItem` : merge d'un patch sur l'item[index].
   *  - `addSectionListItem` : ajoute à la fin (ou à `index`) un nouvel item.
   *  - `removeSectionListItem` : retire l'item[index].
   *  - `reorderSectionListItems` : réordonne la liste.
   *
   * Toutes ces opérations créent une révision, comme les autres mutations.
   */
  async updateSectionListItem(
    clubId: string,
    pageId: string,
    sectionId: string,
    listField: string,
    index: number,
    patch: Record<string, unknown>,
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    return this.mutateSectionList(
      clubId,
      pageId,
      sectionId,
      listField,
      authorUserId,
      (list) => {
        if (index < 0 || index >= list.length) {
          throw new BadRequestException('Index hors bornes');
        }
        const current = list[index];
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          list[index] = deepMerge(current as Record<string, unknown>, patch);
        } else {
          // Valeur primitive → remplacement complet par patch.value ou patch direct
          list[index] = (patch as { value?: unknown }).value ?? patch;
        }
      },
    );
  }

  async addSectionListItem(
    clubId: string,
    pageId: string,
    sectionId: string,
    listField: string,
    item: unknown,
    atIndex: number | null,
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    return this.mutateSectionList(
      clubId,
      pageId,
      sectionId,
      listField,
      authorUserId,
      (list) => {
        if (atIndex === null || atIndex >= list.length) {
          list.push(item);
        } else if (atIndex < 0) {
          list.unshift(item);
        } else {
          list.splice(atIndex, 0, item);
        }
      },
    );
  }

  async removeSectionListItem(
    clubId: string,
    pageId: string,
    sectionId: string,
    listField: string,
    index: number,
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    return this.mutateSectionList(
      clubId,
      pageId,
      sectionId,
      listField,
      authorUserId,
      (list) => {
        if (index < 0 || index >= list.length) {
          throw new BadRequestException('Index hors bornes');
        }
        list.splice(index, 1);
      },
    );
  }

  async reorderSectionListItems(
    clubId: string,
    pageId: string,
    sectionId: string,
    listField: string,
    newOrder: number[],
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    return this.mutateSectionList(
      clubId,
      pageId,
      sectionId,
      listField,
      authorUserId,
      (list) => {
        if (newOrder.length !== list.length) {
          throw new BadRequestException(
            'newOrder doit contenir autant d’indices que la liste.',
          );
        }
        const seen = new Set<number>();
        for (const i of newOrder) {
          if (i < 0 || i >= list.length || seen.has(i)) {
            throw new BadRequestException('newOrder invalide');
          }
          seen.add(i);
        }
        const copy = [...list];
        for (let dest = 0; dest < newOrder.length; dest += 1) {
          list[dest] = copy[newOrder[dest]!];
        }
      },
    );
  }

  private async mutateSectionList(
    clubId: string,
    pageId: string,
    sectionId: string,
    listField: string,
    authorUserId: string | null,
    mutator: (list: unknown[]) => void,
  ): Promise<VitrinePage> {
    const page = await this.getById(clubId, pageId);
    const sections = Array.isArray(page.sectionsJson)
      ? (page.sectionsJson as Array<{
          id: string;
          type: string;
          props: Record<string, unknown>;
        }>)
      : [];
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) throw new NotFoundException('Section introuvable');
    const section = sections[idx]!;
    const current = section.props[listField];
    if (!Array.isArray(current)) {
      throw new BadRequestException(
        `Le champ "${listField}" n'est pas une liste.`,
      );
    }
    const list = [...current];
    mutator(list);
    await this.snapshot(pageId, authorUserId);
    sections[idx] = {
      ...section,
      props: {
        ...section.props,
        [listField]: list,
      },
    };
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: {
        sectionsJson: sections as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async reorderSections(
    clubId: string,
    pageId: string,
    orderedIds: string[],
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    const page = await this.getById(clubId, pageId);
    const sections = Array.isArray(page.sectionsJson)
      ? (page.sectionsJson as Array<{
          id: string;
          type: string;
          props: Record<string, unknown>;
        }>)
      : [];
    const map = new Map(sections.map((s) => [s.id, s]));
    const reordered = orderedIds
      .map((id) => map.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (reordered.length !== sections.length) {
      throw new BadRequestException(
        'Liste de sections incomplète lors du réordonnancement.',
      );
    }
    await this.snapshot(pageId, authorUserId);
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: {
        sectionsJson: reordered as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSeo(
    clubId: string,
    pageId: string,
    input: {
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoOgImageId?: string | null;
    },
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    const page = await this.getById(clubId, pageId);
    await this.snapshot(page.id, authorUserId);
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: {
        seoTitle:
          input.seoTitle !== undefined ? input.seoTitle : page.seoTitle,
        seoDescription:
          input.seoDescription !== undefined
            ? input.seoDescription
            : page.seoDescription,
        seoOgImageId:
          input.seoOgImageId !== undefined
            ? input.seoOgImageId
            : page.seoOgImageId,
      },
    });
  }

  async listRevisions(
    clubId: string,
    pageId: string,
    limit = 50,
  ): Promise<VitrinePageRevision[]> {
    await this.getById(clubId, pageId); // guard ownership
    return this.prisma.vitrinePageRevision.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  async restoreRevision(
    clubId: string,
    pageId: string,
    revisionId: string,
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    await this.getById(clubId, pageId);
    const target = await this.prisma.vitrinePageRevision.findFirst({
      where: { id: revisionId, pageId },
    });
    if (!target) throw new NotFoundException('Révision introuvable');
    await this.snapshot(pageId, authorUserId);
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: {
        sectionsJson: target.sectionsJson as Prisma.InputJsonValue,
        seoTitle: target.seoTitle,
        seoDescription: target.seoDescription,
      },
    });
  }

  async setStatus(
    clubId: string,
    pageId: string,
    status: 'DRAFT' | 'PUBLISHED',
    authorUserId: string | null,
  ): Promise<VitrinePage> {
    const page = await this.getById(clubId, pageId);
    if (page.status === status) return page;
    await this.snapshot(pageId, authorUserId);
    return this.prisma.vitrinePage.update({
      where: { id: pageId },
      data: { status },
    });
  }
}
