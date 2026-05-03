import { BadRequestException, Injectable } from '@nestjs/common';
import type { Club } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Paramètres globaux du site vitrine par club :
 *  - `customDomain` : domaine personnalisé (unique) — CNAME chez le client
 *  - `vitrinePublished` : flag global on/off
 *
 * Plus la génération du JWT d'édition qui établit le pont admin → vitrine.
 */
@Injectable()
export class VitrineSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async getSettings(clubId: string): Promise<{
    customDomain: string | null;
    vitrinePublished: boolean;
  }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { customDomain: true, vitrinePublished: true },
    });
    if (!club) throw new BadRequestException('Club introuvable');
    return {
      customDomain: club.customDomain,
      vitrinePublished: club.vitrinePublished,
    };
  }

  async getBranding(clubId: string): Promise<{
    clubName: string;
    logoUrl: string | null;
    kanjiTagline: string | null;
    footerJson: string | null;
    paletteJson: string | null;
    fontsJson: string | null;
  }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        name: true,
        logoUrl: true,
        vitrineKanjiTagline: true,
        vitrineFooterJson: true,
        vitrinePaletteJson: true,
        vitrineFontsJson: true,
      },
    });
    if (!club) throw new BadRequestException('Club introuvable');
    return {
      clubName: club.name,
      logoUrl: club.logoUrl,
      kanjiTagline: club.vitrineKanjiTagline,
      footerJson: club.vitrineFooterJson
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

  async updateBranding(
    clubId: string,
    input: {
      kanjiTagline?: string | null;
      footerJson?: string | null;
      paletteJson?: string | null;
      fontsJson?: string | null;
    },
  ): Promise<{
    kanjiTagline: string | null;
    footerJson: string | null;
    paletteJson: string | null;
    fontsJson: string | null;
  }> {
    const data: Record<string, unknown> = {};
    if (input.kanjiTagline !== undefined) {
      data.vitrineKanjiTagline = input.kanjiTagline?.trim() || null;
    }
    const parseJsonField = (
      raw: string | null | undefined,
      field: string,
    ): unknown => {
      if (raw === undefined) return undefined;
      if (raw === null || raw.trim() === '') return null;
      try {
        return JSON.parse(raw);
      } catch {
        throw new BadRequestException(`${field} invalide (JSON attendu)`);
      }
    };
    const footer = parseJsonField(input.footerJson, 'footerJson');
    if (footer !== undefined) data.vitrineFooterJson = footer;
    const palette = parseJsonField(input.paletteJson, 'paletteJson');
    if (palette !== undefined) {
      if (palette !== null) this.validatePalette(palette);
      data.vitrinePaletteJson = palette;
    }
    const fonts = parseJsonField(input.fontsJson, 'fontsJson');
    if (fonts !== undefined) {
      if (fonts !== null) this.validateFonts(fonts);
      data.vitrineFontsJson = fonts;
    }
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data,
      select: {
        vitrineKanjiTagline: true,
        vitrineFooterJson: true,
        vitrinePaletteJson: true,
        vitrineFontsJson: true,
      },
    });
    return {
      kanjiTagline: club.vitrineKanjiTagline,
      footerJson: club.vitrineFooterJson
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

  private validatePalette(palette: unknown): void {
    if (!palette || typeof palette !== 'object') {
      throw new BadRequestException('paletteJson : objet attendu');
    }
    const allowed = [
      'ink',
      'ink2',
      'paper',
      'accent',
      'goldBright',
      'vermillion',
      'line',
      'muted',
      'bg',
      'bg2',
      'fg',
    ];
    const hex =
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    for (const [k, v] of Object.entries(palette as Record<string, unknown>)) {
      if (!allowed.includes(k)) {
        throw new BadRequestException(`paletteJson : clé inconnue "${k}"`);
      }
      if (typeof v !== 'string' || !hex.test(v)) {
        throw new BadRequestException(
          `paletteJson : "${k}" doit être une couleur hex (#rgb / #rrggbb / #rrggbbaa)`,
        );
      }
    }
  }

  private validateFonts(fonts: unknown): void {
    if (!fonts || typeof fonts !== 'object') {
      throw new BadRequestException('fontsJson : objet attendu');
    }
    const allowed = ['serif', 'sans', 'jp'];
    for (const [k, v] of Object.entries(fonts as Record<string, unknown>)) {
      if (!allowed.includes(k)) {
        throw new BadRequestException(`fontsJson : clé inconnue "${k}"`);
      }
      if (typeof v !== 'string' || v.trim().length === 0 || v.length > 80) {
        throw new BadRequestException(
          `fontsJson : "${k}" doit être un nom de police (1–80 caractères)`,
        );
      }
    }
  }

  async updateSettings(
    clubId: string,
    input: { customDomain?: string | null; vitrinePublished?: boolean },
  ): Promise<{
    customDomain: string | null;
    vitrinePublished: boolean;
  }> {
    const data: Partial<Pick<Club, 'customDomain' | 'vitrinePublished'>> = {};
    if (input.customDomain !== undefined) {
      const raw = (input.customDomain ?? '').trim().toLowerCase();
      if (raw.length > 0) {
        if (!/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/.test(raw)) {
          throw new BadRequestException(
            'Domaine invalide (ex. www.mondojo.fr).',
          );
        }
        // Vérifier non-collision avec un autre club
        const clash = await this.prisma.club.findFirst({
          where: { customDomain: raw, NOT: { id: clubId } },
          select: { id: true },
        });
        if (clash) {
          throw new BadRequestException(
            'Ce domaine est déjà utilisé par un autre club.',
          );
        }
        data.customDomain = raw;
      } else {
        data.customDomain = null;
      }
    }
    if (input.vitrinePublished !== undefined) {
      data.vitrinePublished = input.vitrinePublished;
    }
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data,
      select: { customDomain: true, vitrinePublished: true },
    });
    return club;
  }

  /**
   * Émet un JWT court (30 min) qui autorise l'admin à éditer la vitrine.
   * Le JWT est posé en cookie httpOnly côté Next.js via `/api/edit/enter`.
   *
   * Payload compatible avec `JwtStrategy` :
   *   { sub: userId, email, clubId, kind: 'vitrine-edit' }
   */
  async issueEditToken(clubId: string, userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new BadRequestException('User introuvable');
    return this.jwtService.signAsync(
      {
        sub: userId,
        email: user.email,
        clubId,
        kind: 'vitrine-edit',
      },
      {
        expiresIn: '30m',
      },
    );
  }
}
