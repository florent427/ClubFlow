import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import type { Request } from 'express';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { SignClubDocumentInput } from './dto/sign-club-document.input';
import { signedDocumentToGraph } from './documents.resolver';
import { ClubDocumentGraph } from './models/club-document.model';
import { ClubSignedDocumentGraph } from './models/club-signed-document.model';

@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.DOCUMENTS)
export class ViewerDocumentsResolver {
  constructor(
    private readonly documents: DocumentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => [ClubDocumentGraph], { name: 'viewerDocumentsToSign' })
  async viewerDocumentsToSign(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID, nullable: true })
    memberId?: string | null,
  ): Promise<ClubDocumentGraph[]> {
    const targetMemberId =
      memberId ?? user.activeProfileMemberId ?? null;

    // **Restriction adulte** : la signature engage juridiquement et
    // ne peut être accomplie que par un adulte responsable. Les profils
    // mineurs (membres < 18 ans) renvoient une liste vide — le parent
    // doit basculer sur SON profil pour signer pour lui-même, ou rester
    // payeur du foyer pour les autorisations parentales (qu'il signe au
    // nom des enfants depuis son propre profil).
    //
    // Si le profil actif n'a pas de date de naissance renseignée, on
    // affiche par défaut (évite de cacher la fonctionnalité par erreur).
    if (targetMemberId) {
      const member = await this.prisma.member.findUnique({
        where: { id: targetMemberId },
        select: { birthDate: true },
      });
      if (member?.birthDate && isMinor(member.birthDate)) {
        return [];
      }
    }

    const rows = await this.documents.listToSignForViewer(
      club.id,
      user.userId,
      targetMemberId,
    );

    // Pour les viewers, on n'expose pas signedCount (c'est une stat admin) ;
    // on remplit à 0 pour respecter le schéma.
    const out: ClubDocumentGraph[] = [];
    for (const doc of rows) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: doc.mediaAssetId },
        select: { publicUrl: true },
      });
      out.push({
        id: doc.id,
        clubId: doc.clubId,
        category: doc.category,
        name: doc.name,
        description: doc.description,
        mediaAssetId: doc.mediaAssetId,
        mediaAssetUrl: asset?.publicUrl ?? null,
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
        fields: doc.fields.map((f) => ({
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
        })),
        signedCount: 0,
      });
    }
    return out;
  }

  @Query(() => ClubSignedDocumentGraph, {
    name: 'viewerSignedDocument',
    nullable: true,
  })
  async viewerSignedDocument(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubSignedDocumentGraph | null> {
    const row = await this.documents.getSignedDocument(club.id, id);
    if (!row) return null;
    if (row.userId !== user.userId) {
      // Confidentialité : on ne révèle pas l'existence d'une signature
      // appartenant à un autre user (même message qu'un not-found pour ne pas
      // donner d'oracle, mais on lève un Forbidden pour la sémantique HTTP).
      throw new ForbiddenException();
    }
    return signedDocumentToGraph(this.prisma, row);
  }

  @Mutation(() => ClubSignedDocumentGraph, {
    name: 'viewerSignClubDocument',
  })
  async viewerSignClubDocument(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Context() ctx: { req?: Request },
    @Args('input') input: SignClubDocumentInput,
  ): Promise<ClubSignedDocumentGraph> {
    const audit = extractAuditContext(ctx?.req);
    // Symétrie avec viewerDocumentsToSign : si l'input ne fournit pas
    // memberId, on retombe sur activeProfileMemberId. Sinon la signature
    // est stockée avec memberId=null mais la query liste avec
    // memberId=activeProfileMemberId → mismatch et la bannière reste
    // affichée après signature.
    const targetMemberId =
      input.memberId ?? user.activeProfileMemberId ?? null;
    const row = await this.documents.signDocument(
      club.id,
      user.userId,
      {
        documentId: input.documentId,
        memberId: targetMemberId,
        fieldValues: input.fieldValues.map((v) => ({
          fieldId: v.fieldId,
          type: v.type,
          valuePngBase64: v.valuePngBase64 ?? null,
          text: v.text ?? null,
          bool: v.bool ?? null,
        })),
      },
      audit,
    );
    return signedDocumentToGraph(this.prisma, row);
  }
}

/**
 * True si la personne est strictement mineure (< 18 ans à la date du
 * jour, calcul UTC pour éviter les sauts de jour selon le fuseau).
 */
function isMinor(birthDate: Date): boolean {
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age < 18;
}

/**
 * Extrait l'IP et le user-agent depuis la requête pour l'audit trail.
 * Tolérant aux proxys (X-Forwarded-For).
 */
function extractAuditContext(
  req: Request | undefined,
): { ip: string | null; userAgent: string | null } {
  if (!req) return { ip: null, userAgent: null };
  const xff = req.headers['x-forwarded-for'];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  const ip =
    (typeof xffStr === 'string' && xffStr.split(',')[0]?.trim()) ||
    req.socket?.remoteAddress ||
    null;
  const ua = req.headers['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : null;
  return { ip, userAgent };
}
