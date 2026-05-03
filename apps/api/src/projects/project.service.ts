import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClubProject,
  Prisma,
  ProjectSection,
  ProjectSectionKind,
  ProjectStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Les 4 sections créées automatiquement à la création du projet. */
const BUILT_IN_SECTIONS: Array<{
  kind: ProjectSectionKind;
  label: string;
  sortOrder: number;
}> = [
  { kind: 'VOLUNTEERS', label: 'Bénévolat', sortOrder: 10 },
  { kind: 'ADMIN', label: 'Administratif', sortOrder: 20 },
  { kind: 'COMMUNICATION', label: 'Communication', sortOrder: 30 },
  { kind: 'LIVE', label: 'Live', sortOrder: 40 },
];

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base.length > 0 ? base : 'projet';
}

/**
 * CRUD haut niveau de `ClubProject` + pilotage des sections.
 *
 * À la création, quatre sections sont auto-créées (VOLUNTEERS, ADMIN,
 * COMMUNICATION, LIVE). La section ACCOUNTING n'est PAS matérialisée en
 * base — elle est calculée à la volée par les resolvers quand le module
 * compta est actif, pour afficher une vue lecture seule sans duplication
 * de source de vérité.
 */
@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Queries ----------

  /**
   * Include pour récupérer les URLs publiques de la cover et du poster
   * en une seule query — évite un round-trip supplémentaire côté Graph.
   */
  private readonly projectInclude = {
    coverImage: { select: { publicUrl: true } },
    posterAsset: { select: { publicUrl: true } },
  } as const;

  async listForClub(
    clubId: string,
    status?: ProjectStatus,
  ): Promise<Array<ClubProjectWithAssets>> {
    return this.prisma.clubProject.findMany({
      where: {
        clubId,
        ...(status ? { status } : {}),
      },
      orderBy: [
        { status: 'asc' },
        { startsAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      include: this.projectInclude,
    });
  }

  async getByIdForClub(
    clubId: string,
    id: string,
  ): Promise<ClubProjectWithAssets> {
    const row = await this.prisma.clubProject.findFirst({
      where: { id, clubId },
      include: this.projectInclude,
    });
    if (!row) throw new NotFoundException('Projet introuvable');
    return row;
  }

  async getSectionsForProject(projectId: string): Promise<ProjectSection[]> {
    return this.prisma.projectSection.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Vérifie si le module ACCOUNTING est actif sur ce club. Utilisé côté
   * resolver pour décider d'afficher la section "Comptabilité" lecture
   * seule (pas de row en base — c'est une pseudo-section virtuelle).
   */
  async isAccountingModuleEnabled(clubId: string): Promise<boolean> {
    const mod = await this.prisma.clubModule.findUnique({
      where: { clubId_moduleCode: { clubId, moduleCode: 'ACCOUNTING' } },
    });
    return Boolean(mod?.enabled);
  }

  // ---------- Mutations ----------

  async create(
    clubId: string,
    createdByUserId: string,
    input: {
      title: string;
      summary?: string | null;
      description?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      coverImageId?: string | null;
      posterAssetId?: string | null;
      budgetPlannedCents?: number | null;
      maxPhotosPerContributorPerPhase?: number;
      maxVideosPerContributorPerPhase?: number;
      maxTextsPerContributorPerPhase?: number;
    },
  ): Promise<ClubProjectWithAssets> {
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException('Le titre du projet est obligatoire.');
    }
    const baseSlug = slugify(title);
    const slug = await this.uniqueSlug(clubId, baseSlug);
    const createdId = await this.prisma.$transaction(async (tx) => {
      const project = await tx.clubProject.create({
        data: {
          clubId,
          slug,
          title,
          summary: input.summary ?? null,
          description: input.description ?? null,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          coverImageId: input.coverImageId ?? null,
          posterAssetId: input.posterAssetId ?? null,
          budgetPlannedCents: input.budgetPlannedCents ?? null,
          maxPhotosPerContributorPerPhase:
            input.maxPhotosPerContributorPerPhase ?? 10,
          maxVideosPerContributorPerPhase:
            input.maxVideosPerContributorPerPhase ?? 3,
          maxTextsPerContributorPerPhase:
            input.maxTextsPerContributorPerPhase ?? 20,
          createdByUserId,
        },
      });
      await tx.projectSection.createMany({
        data: BUILT_IN_SECTIONS.map((s) => ({
          projectId: project.id,
          kind: s.kind,
          label: s.label,
          sortOrder: s.sortOrder,
        })),
      });
      return project.id;
    });
    return this.getByIdForClub(clubId, createdId);
  }

  async update(
    clubId: string,
    id: string,
    patch: Prisma.ClubProjectUpdateInput,
  ): Promise<ClubProjectWithAssets> {
    const existing = await this.getByIdForClub(clubId, id);
    await this.prisma.clubProject.update({
      where: { id: existing.id },
      data: patch,
    });
    return this.getByIdForClub(clubId, existing.id);
  }

  async setStatus(
    clubId: string,
    id: string,
    status: ProjectStatus,
  ): Promise<ClubProjectWithAssets> {
    const existing = await this.getByIdForClub(clubId, id);
    if (existing.status === status) return existing;
    await this.prisma.clubProject.update({
      where: { id: existing.id },
      data: { status },
    });
    return this.getByIdForClub(clubId, existing.id);
  }

  async delete(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.clubProject.findFirst({
      where: { id, clubId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.clubProject.delete({ where: { id: existing.id } });
    return true;
  }

  // ---------- Sections ----------

  async renameSection(
    clubId: string,
    sectionId: string,
    label: string,
  ): Promise<ProjectSection> {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new BadRequestException(
        'Le libellé de la section ne peut pas être vide.',
      );
    }
    const section = await this.prisma.projectSection.findFirst({
      where: { id: sectionId, project: { clubId } },
    });
    if (!section) throw new NotFoundException('Section introuvable.');
    return this.prisma.projectSection.update({
      where: { id: section.id },
      data: { label: trimmed },
    });
  }

  async reorderSections(
    clubId: string,
    projectId: string,
    orderedSectionIds: string[],
  ): Promise<void> {
    if (orderedSectionIds.length === 0) return;
    await this.getByIdForClub(clubId, projectId);
    const rows = await this.prisma.projectSection.findMany({
      where: { projectId, id: { in: orderedSectionIds } },
      select: { id: true },
    });
    if (rows.length !== orderedSectionIds.length) {
      throw new BadRequestException(
        'Certaines sections ne sont pas rattachées à ce projet.',
      );
    }
    await this.prisma.$transaction(
      orderedSectionIds.map((id, i) =>
        this.prisma.projectSection.update({
          where: { id },
          data: { sortOrder: (i + 1) * 10 },
        }),
      ),
    );
  }

  async updateSectionBody(
    clubId: string,
    sectionId: string,
    bodyJson: Prisma.InputJsonValue,
  ): Promise<ProjectSection> {
    const section = await this.prisma.projectSection.findFirst({
      where: { id: sectionId, project: { clubId } },
    });
    if (!section) throw new NotFoundException('Section introuvable.');
    return this.prisma.projectSection.update({
      where: { id: section.id },
      data: { bodyJson },
    });
  }

  // ---------- Documents attachés aux sections ----------

  /**
   * Liste les MediaAsset attachés à une section via la convention
   * `ownerKind='PROJECT_SECTION'` + `ownerId=sectionId`. Inclut tous
   * les formats (PDF, images, vidéos, docs Office).
   */
  async listSectionAttachments(
    clubId: string,
    sectionId: string,
  ): Promise<
    Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      publicUrl: string | null;
      uploadedAt: Date;
    }>
  > {
    // Garde-fou : la section doit bien exister dans ce club.
    const section = await this.prisma.projectSection.findFirst({
      where: { id: sectionId, project: { clubId } },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Section introuvable.');
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        clubId,
        ownerKind: 'PROJECT_SECTION',
        ownerId: section.id,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        publicUrl: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      publicUrl: r.publicUrl,
      uploadedAt: r.createdAt,
    }));
  }

  /**
   * Rattache un MediaAsset existant à une section projet (upload fait
   * auparavant via `POST /media/upload`). L'asset doit appartenir au
   * même club que la section.
   */
  async attachDocumentToSection(
    clubId: string,
    sectionId: string,
    mediaAssetId: string,
  ): Promise<void> {
    const [section, asset] = await Promise.all([
      this.prisma.projectSection.findFirst({
        where: { id: sectionId, project: { clubId } },
        select: { id: true },
      }),
      this.prisma.mediaAsset.findFirst({
        where: { id: mediaAssetId, clubId },
        select: { id: true, ownerKind: true },
      }),
    ]);
    if (!section) throw new NotFoundException('Section introuvable.');
    if (!asset) {
      throw new NotFoundException('Media asset introuvable pour ce club.');
    }
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        ownerKind: 'PROJECT_SECTION',
        ownerId: section.id,
      },
    });
  }

  /**
   * Dissocie un MediaAsset d'une section (le fichier reste en base et
   * dans la médiathèque du club pour réutilisation — à supprimer
   * manuellement si besoin via la médiathèque).
   */
  async detachDocumentFromSection(
    clubId: string,
    sectionId: string,
    mediaAssetId: string,
  ): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        clubId,
        ownerKind: 'PROJECT_SECTION',
        ownerId: sectionId,
      },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException('Pièce jointe introuvable sur cette section.');
    }
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { ownerKind: null, ownerId: null },
    });
  }

  // ---------- Helpers ----------

  private async uniqueSlug(clubId: string, base: string): Promise<string> {
    let candidate = base;
    let attempt = 1;
    while (attempt < 50) {
      const existing = await this.prisma.clubProject.findUnique({
        where: { clubId_slug: { clubId, slug: candidate } },
        select: { id: true },
      });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
    throw new BadRequestException(
      'Impossible de générer un slug unique pour ce projet.',
    );
  }
}

/**
 * Type combiné : ligne `ClubProject` + sous-objets `coverImage` / `posterAsset`
 * pour exposer leurs `publicUrl` sans round-trip supplémentaire. Utilisé par
 * le resolver admin pour projeter vers `ClubProjectGraph.coverImageUrl`.
 */
export type ClubProjectWithAssets = ClubProject & {
  coverImage: { publicUrl: string | null } | null;
  posterAsset: { publicUrl: string | null } | null;
};

// Re-export utile pour les callers TypeScript qui veulent filtrer par enum
export { BUILT_IN_SECTIONS };
