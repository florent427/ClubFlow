import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  ClubDocumentCategory,
  type Club,
  type ClubDocument,
  type ClubDocumentField,
} from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { MediaAssetsService } from '../media/media-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsCronService } from './documents-cron.service';
import { DocumentsSeedService } from './documents-seed.service';
import { DocumentsService } from './documents.service';
import { ClubDocumentFieldInput } from './dto/club-document-field.input';
import { CreateClubDocumentInput } from './dto/create-club-document.input';
import { UpdateClubDocumentInput } from './dto/update-club-document.input';
import {
  ClubDocumentFieldGraph,
  ClubDocumentGraph,
} from './models/club-document.model';
import { ClubSignedDocumentGraph } from './models/club-signed-document.model';
import { DocumentRemindersResultGraph } from './models/document-reminders-result.model';
import { DocumentSignatureStatsGraph } from './models/document-signature-stats.model';
import { DocumentYearlyResetResultGraph } from './models/document-yearly-reset-result.model';

type DocumentRow = ClubDocument & { fields: ClubDocumentField[] };

function fieldToGraph(f: ClubDocumentField): ClubDocumentFieldGraph {
  return {
    id: f.id,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    fieldType: f.fieldType,
    required: f.required,
    label: f.label,
    sortOrder: f.sortOrder,
  };
}

async function documentToGraph(
  prisma: PrismaService,
  mediaAssets: MediaAssetsService,
  doc: DocumentRow,
): Promise<ClubDocumentGraph> {
  const [asset, signedCount] = await Promise.all([
    prisma.mediaAsset.findUnique({
      where: { id: doc.mediaAssetId },
      select: { publicUrl: true },
    }),
    prisma.clubSignedDocument.count({
      where: {
        documentId: doc.id,
        version: doc.version,
        invalidatedAt: null,
      },
    }),
  ]);
  return {
    id: doc.id,
    clubId: doc.clubId,
    category: doc.category,
    name: doc.name,
    description: doc.description,
    mediaAssetId: doc.mediaAssetId,
    // resolvePublicUrl rewrite `http://localhost:3000/media/...` (legacy
    // uploads faits sans API_PUBLIC_URL configuré) vers l'URL publique
    // courante. Sans rewrite, ces uploads cassent l'éditeur PDF.js côté
    // admin (failed to fetch).
    mediaAssetUrl: mediaAssets.resolvePublicUrl(asset?.publicUrl),
    version: doc.version,
    fileSha256: doc.fileSha256,
    isRequired: doc.isRequired,
    isActive: doc.isActive,
    validFrom: doc.validFrom,
    validTo: doc.validTo,
    minorsOnly: doc.minorsOnly,
    resetAnnually: doc.resetAnnually,
    targetSystemRoles: doc.targetSystemRoles,
    targetCustomRoleIds: doc.targetCustomRoleIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    fields: doc.fields.map(fieldToGraph),
    signedCount,
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.DOCUMENTS)
export class DocumentsResolver {
  constructor(
    private readonly documents: DocumentsService,
    private readonly seed: DocumentsSeedService,
    private readonly cron: DocumentsCronService,
    private readonly prisma: PrismaService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  // ----------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------

  @Query(() => [ClubDocumentGraph], { name: 'clubDocuments' })
  async clubDocuments(
    @CurrentClub() club: Club,
  ): Promise<ClubDocumentGraph[]> {
    const rows = await this.documents.listDocuments(club.id);
    return Promise.all(rows.map((r) => documentToGraph(this.prisma, this.mediaAssets, r)));
  }

  @Query(() => ClubDocumentGraph, { name: 'clubDocument', nullable: true })
  async clubDocument(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubDocumentGraph | null> {
    const row = await this.documents.getDocument(club.id, id);
    return row ? documentToGraph(this.prisma, this.mediaAssets, row) : null;
  }

  @Query(() => [ClubSignedDocumentGraph], { name: 'clubDocumentSignatures' })
  async clubDocumentSignatures(
    @CurrentClub() club: Club,
    @Args('documentId', { type: () => ID }) documentId: string,
  ): Promise<ClubSignedDocumentGraph[]> {
    const rows = await this.documents.listSignaturesForDocument(
      club.id,
      documentId,
    );
    return Promise.all(rows.map((r) => signedDocumentToGraph(this.prisma, r)));
  }

  @Query(() => DocumentSignatureStatsGraph, {
    name: 'clubDocumentSignatureStats',
  })
  clubDocumentSignatureStats(
    @CurrentClub() club: Club,
    @Args('documentId', { type: () => ID }) documentId: string,
  ): Promise<DocumentSignatureStatsGraph> {
    return this.documents.getSignatureStats(club.id, documentId);
  }

  // ----------------------------------------------------------------
  // Mutations — CRUD documents
  // ----------------------------------------------------------------

  @Mutation(() => ClubDocumentGraph, { name: 'createClubDocument' })
  async createClubDocument(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubDocumentInput,
  ): Promise<ClubDocumentGraph> {
    const row = await this.documents.createDocument(club.id, {
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      mediaAssetId: input.mediaAssetId,
      isRequired: input.isRequired,
      isActive: input.isActive,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      minorsOnly: input.minorsOnly,
      resetAnnually: input.resetAnnually,
      targetSystemRoles: input.targetSystemRoles,
      targetCustomRoleIds: input.targetCustomRoleIds,
    });
    return documentToGraph(this.prisma, this.mediaAssets, row);
  }

  @Mutation(() => ClubDocumentGraph, { name: 'updateClubDocument' })
  async updateClubDocument(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubDocumentInput,
  ): Promise<ClubDocumentGraph> {
    const row = await this.documents.updateDocument(club.id, input.id, {
      name: input.name,
      description: input.description,
      category: input.category,
      mediaAssetId: input.mediaAssetId,
      isRequired: input.isRequired,
      isActive: input.isActive,
      validFrom: input.validFrom,
      validTo: input.validTo,
      minorsOnly: input.minorsOnly,
      resetAnnually: input.resetAnnually,
      targetSystemRoles: input.targetSystemRoles,
      targetCustomRoleIds: input.targetCustomRoleIds,
    });
    return documentToGraph(this.prisma, this.mediaAssets, row);
  }

  @Mutation(() => ClubDocumentGraph, { name: 'archiveClubDocument' })
  async archiveClubDocument(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubDocumentGraph> {
    const row = await this.documents.archiveDocument(club.id, id);
    return documentToGraph(this.prisma, this.mediaAssets, row);
  }

  @Mutation(() => Boolean, { name: 'deleteClubDocument' })
  deleteClubDocument(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.documents.deleteDocument(club.id, id);
  }

  // ----------------------------------------------------------------
  // Mutations — fields positionnés
  // ----------------------------------------------------------------

  @Mutation(() => [ClubDocumentFieldGraph], {
    name: 'upsertClubDocumentFields',
  })
  async upsertClubDocumentFields(
    @CurrentClub() club: Club,
    @Args('documentId', { type: () => ID }) documentId: string,
    @Args('fields', { type: () => [ClubDocumentFieldInput] })
    fields: ClubDocumentFieldInput[],
  ): Promise<ClubDocumentFieldGraph[]> {
    const rows = await this.documents.upsertFields(
      club.id,
      documentId,
      fields.map((f) => ({
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldType: f.fieldType,
        required: f.required,
        label: f.label ?? null,
        sortOrder: f.sortOrder,
      })),
    );
    return rows.map(fieldToGraph);
  }

  // ----------------------------------------------------------------
  // Mutations — relances + templates
  // ----------------------------------------------------------------

  @Mutation(() => DocumentRemindersResultGraph, {
    name: 'triggerClubDocumentReminders',
    description:
      'Envoie un email de relance à chaque membre actif ayant au moins un document requis non signé pour la version courante.',
  })
  triggerClubDocumentReminders(
    @CurrentClub() club: Club,
  ): Promise<DocumentRemindersResultGraph> {
    return this.documents.sendSignatureReminders(club.id);
  }

  @Mutation(() => ClubDocumentGraph, {
    name: 'createClubDocumentFromTemplate',
    description:
      'Crée un document pré-rempli (PDF généré) pour une catégorie donnée. L\'admin pourra ensuite remplacer le PDF source.',
  })
  async createClubDocumentFromTemplate(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('category', { type: () => ClubDocumentCategory })
    category: ClubDocumentCategory,
  ): Promise<ClubDocumentGraph> {
    const row = await this.seed.createDocumentFromTemplate(
      club.id,
      user.userId,
      category,
    );
    return documentToGraph(this.prisma, this.mediaAssets, row);
  }

  @Mutation(() => DocumentYearlyResetResultGraph, {
    name: 'triggerClubYearlyDocumentReset',
    description:
      "Déclenche manuellement le reset annuel pour le club courant : bump de version + invalidation des signatures pour tous les documents resetAnnually=true. À appeler aussi depuis un cron annuel (1er septembre 06h UTC).",
  })
  triggerClubYearlyDocumentReset(
    @CurrentClub() club: Club,
  ): Promise<DocumentYearlyResetResultGraph> {
    return this.cron.resetYearlySignatures(club.id);
  }
}

// ============================================================================
// Helper local — exporté pour réutilisation depuis le viewer resolver.
// ============================================================================

export async function signedDocumentToGraph(
  prisma: PrismaService,
  s: {
    id: string;
    documentId: string;
    version: number;
    userId: string;
    memberId: string | null;
    signedAssetId: string;
    signedSha256: string;
    sourceSha256: string;
    ipAddress: string | null;
    userAgent: string | null;
    signedAt: Date;
    invalidatedAt: Date | null;
  },
): Promise<ClubSignedDocumentGraph> {
  const [asset, member, user] = await Promise.all([
    prisma.mediaAsset.findUnique({
      where: { id: s.signedAssetId },
      select: { publicUrl: true },
    }),
    s.memberId
      ? prisma.member.findUnique({
          where: { id: s.memberId },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: s.userId },
      select: { displayName: true },
    }),
  ]);
  const signerDisplayName = member
    ? `${member.firstName} ${member.lastName}`
    : (user?.displayName ?? null);
  return {
    id: s.id,
    documentId: s.documentId,
    version: s.version,
    userId: s.userId,
    memberId: s.memberId,
    signedAssetId: s.signedAssetId,
    signedAssetUrl: asset?.publicUrl ?? null,
    signedSha256: s.signedSha256,
    sourceSha256: s.sourceSha256,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    signedAt: s.signedAt,
    invalidatedAt: s.invalidatedAt,
    signerDisplayName,
  };
}
