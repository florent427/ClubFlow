import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import {
  ClubBrandingGql,
  ClubBrandingPaletteGql,
} from './models/club-branding.model';
import { ClubGraphModel } from './models/club.model';
import { ClubMembershipGraphModel } from './models/club-membership.model';
import { UpdateClubBrandingInput } from './dto/update-club-branding.input';

/**
 * Extrait une palette typée depuis un Json Prisma (clés vitrine
 * standardisées). Filtre les valeurs non-string pour éviter d'envoyer
 * autre chose qu'un hex valide au client.
 */
function extractPalette(json: unknown): ClubBrandingPaletteGql | null {
  if (!json || typeof json !== 'object') return null;
  const src = json as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const v = src[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  return {
    ink: pick('ink'),
    ink2: pick('ink2'),
    paper: pick('paper'),
    accent: pick('accent'),
    goldBright: pick('goldBright'),
    vermillion: pick('vermillion'),
    line: pick('line'),
    muted: pick('muted'),
  };
}

function toClubGraph(
  row: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    siret?: string | null;
    address?: string | null;
    legalMentions?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  },
  extras: { requiresMedicalCertificate: boolean },
): ClubGraphModel {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl ?? null,
    siret: row.siret ?? null,
    address: row.address ?? null,
    legalMentions: row.legalMentions ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    requiresMedicalCertificate: extras.requiresMedicalCertificate,
  };
}

@Resolver()
export class ClubsResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lit la config catalogue pour savoir si le certificat médical est
   * requis. Retourne `false` par défaut (ex. catalogue jamais initialisé,
   * ou ligne MEDICAL_CERT_EXPIRES_AT absente).
   */
  private async getRequiresMedicalCertificate(clubId: string): Promise<boolean> {
    const row = await this.prisma.clubMemberFieldCatalogSetting.findUnique({
      where: {
        clubId_fieldKey: {
          clubId,
          fieldKey: 'MEDICAL_CERT_EXPIRES_AT',
        },
      },
      select: { required: true },
    });
    return row?.required === true;
  }

  @Query(() => ClubGraphModel)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async club(@CurrentClub() club: Club): Promise<ClubGraphModel> {
    // club from @CurrentClub ne contient que les champs du middleware;
    // on relit pour s'assurer d'avoir les champs ajoutés récemment (logoUrl…).
    const fresh = await this.prisma.club.findUnique({ where: { id: club.id } });
    const requiresMedicalCertificate = await this.getRequiresMedicalCertificate(
      club.id,
    );
    return toClubGraph(fresh ?? club, { requiresMedicalCertificate });
  }

  /**
   * Identité visuelle du club exposée à tout user authentifié sur le
   * club courant (membre, contact, admin). Utilisé par le mobile pour
   * styliser dynamiquement les couleurs selon le club.
   */
  @Query(() => ClubBrandingGql, { name: 'clubBranding' })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async clubBranding(@CurrentClub() club: Club): Promise<ClubBrandingGql> {
    const fresh = await this.prisma.club.findUnique({
      where: { id: club.id },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        vitrineKanjiTagline: true,
        vitrinePaletteJson: true,
      },
    });
    const row = fresh ?? club;
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl ?? null,
      tagline:
        'vitrineKanjiTagline' in row
          ? (row.vitrineKanjiTagline ?? null)
          : null,
      palette: extractPalette(
        'vitrinePaletteJson' in row ? row.vitrinePaletteJson : null,
      ),
    };
  }

  @Query(() => ClubMembershipGraphModel, { nullable: true })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async myMembership(
    @CurrentUser() user: RequestUser | undefined,
    @CurrentClub() club: Club,
  ): Promise<ClubMembershipGraphModel | null> {
    if (!user?.userId) {
      return null;
    }
    const row = await this.prisma.clubMembership.findUnique({
      where: {
        userId_clubId: { userId: user.userId, clubId: club.id },
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      clubId: row.clubId,
      role: row.role,
    };
  }

  @Mutation(() => ClubGraphModel)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  async updateClubBranding(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubBrandingInput,
  ): Promise<ClubGraphModel> {
    if (!club?.id) {
      throw new ForbiddenException('Club introuvable.');
    }
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length === 0) {
        throw new ForbiddenException('Le nom du club ne peut pas être vide.');
      }
      data.name = trimmed;
    }
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.siret !== undefined) data.siret = input.siret;
    if (input.address !== undefined) data.address = input.address;
    if (input.legalMentions !== undefined)
      data.legalMentions = input.legalMentions;
    if (input.contactPhone !== undefined)
      data.contactPhone = input.contactPhone;
    if (input.contactEmail !== undefined)
      data.contactEmail = input.contactEmail;
    const updated = await this.prisma.club.update({
      where: { id: club.id },
      data,
    });
    const requiresMedicalCertificate = await this.getRequiresMedicalCertificate(
      club.id,
    );
    return toClubGraph(updated, { requiresMedicalCertificate });
  }
}
