import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AiUsageFeature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, maskSecret } from '../common/crypto.util';

export const DEFAULT_TEXT_MODEL = 'anthropic/claude-sonnet-4-5';
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image-preview';

/** Liste de modèles suggérés (affichée dans l'UI admin). */
export const CURATED_TEXT_MODELS = [
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-pro',
  'meta-llama/llama-3.3-70b-instruct',
  'mistralai/mistral-large-2411',
] as const;

export const CURATED_IMAGE_MODELS = [
  'google/gemini-2.5-flash-image-preview',
  'openai/dall-e-3',
  'black-forest-labs/flux-1.1-pro',
] as const;

export interface AiSettings {
  /** Clé API masquée (jamais la valeur complète). */
  apiKeyMasked: string | null;
  /** True si une clé API est configurée. */
  hasApiKey: boolean;
  textModel: string;
  imageModel: string;
  tokensInputUsed: number;
  tokensOutputUsed: number;
  imagesGenerated: number;
}

export interface AiSettingsUpdate {
  /** Valeur en clair (chiffrée avant stockage). Null = ne pas toucher. */
  apiKey?: string | null;
  /** Si true, efface la clé existante. */
  clearApiKey?: boolean;
  textModel?: string | null;
  imageModel?: string | null;
}

@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(clubId: string): Promise<AiSettings> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        aiOpenrouterApiKeyEnc: true,
        aiTextModel: true,
        aiImageModel: true,
        aiTokensInputUsed: true,
        aiTokensOutputUsed: true,
        aiImagesGenerated: true,
      },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    let apiKeyMasked: string | null = null;
    if (club.aiOpenrouterApiKeyEnc) {
      try {
        apiKeyMasked = maskSecret(decryptSecret(club.aiOpenrouterApiKeyEnc));
      } catch {
        apiKeyMasked = '***invalide***';
      }
    }
    return {
      apiKeyMasked,
      hasApiKey: !!club.aiOpenrouterApiKeyEnc,
      textModel: club.aiTextModel ?? DEFAULT_TEXT_MODEL,
      imageModel: club.aiImageModel ?? DEFAULT_IMAGE_MODEL,
      tokensInputUsed: Number(club.aiTokensInputUsed),
      tokensOutputUsed: Number(club.aiTokensOutputUsed),
      imagesGenerated: club.aiImagesGenerated,
    };
  }

  async update(clubId: string, patch: AiSettingsUpdate): Promise<AiSettings> {
    const data: Record<string, unknown> = {};
    if (patch.clearApiKey) {
      data.aiOpenrouterApiKeyEnc = null;
    } else if (patch.apiKey !== undefined && patch.apiKey !== null) {
      const trimmed = patch.apiKey.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('sk-or-')) {
        // Acceptation souple — juste un warning implicite si format inattendu.
      }
      if (trimmed.length === 0) {
        data.aiOpenrouterApiKeyEnc = null;
      } else if (trimmed.length > 4000) {
        throw new BadRequestException('Clé API trop longue.');
      } else {
        data.aiOpenrouterApiKeyEnc = encryptSecret(trimmed);
      }
    }
    if (patch.textModel !== undefined) {
      data.aiTextModel = patch.textModel?.trim() || null;
    }
    if (patch.imageModel !== undefined) {
      data.aiImageModel = patch.imageModel?.trim() || null;
    }
    await this.prisma.club.update({ where: { id: clubId }, data });
    return this.get(clubId);
  }

  /** Retourne la clé API en clair pour un usage interne. */
  async getDecryptedApiKey(clubId: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { aiOpenrouterApiKeyEnc: true },
    });
    if (!club?.aiOpenrouterApiKeyEnc) {
      throw new BadRequestException(
        "Clé API OpenRouter non configurée. Aller dans Paramètres → IA.",
      );
    }
    try {
      return decryptSecret(club.aiOpenrouterApiKeyEnc);
    } catch {
      throw new BadRequestException(
        'Clé API chiffrée invalide — la reconfigurer dans Paramètres → IA.',
      );
    }
  }

  async getModels(clubId: string): Promise<{ textModel: string; imageModel: string }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { aiTextModel: true, aiImageModel: true },
    });
    return {
      textModel: club?.aiTextModel ?? DEFAULT_TEXT_MODEL,
      imageModel: club?.aiImageModel ?? DEFAULT_IMAGE_MODEL,
    };
  }

  /** Incrémente les compteurs + écrit une ligne d'historique. */
  async logUsage(params: {
    clubId: string;
    userId?: string | null;
    feature: AiUsageFeature;
    model: string;
    inputTokens: number;
    outputTokens: number;
    imagesGenerated: number;
    costCents?: number;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiUsageLog.create({
        data: {
          clubId: params.clubId,
          userId: params.userId ?? null,
          feature: params.feature,
          model: params.model,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          imagesGenerated: params.imagesGenerated,
          costCents: params.costCents ?? null,
        },
      }),
      this.prisma.club.update({
        where: { id: params.clubId },
        data: {
          aiTokensInputUsed: { increment: BigInt(params.inputTokens) },
          aiTokensOutputUsed: { increment: BigInt(params.outputTokens) },
          aiImagesGenerated: { increment: params.imagesGenerated },
        },
      }),
    ]);
  }

  /** Historique d'utilisation paginé. */
  async listUsage(
    clubId: string,
    limit = 50,
  ): Promise<
    Array<{
      id: string;
      createdAt: Date;
      feature: AiUsageFeature;
      model: string;
      inputTokens: number;
      outputTokens: number;
      imagesGenerated: number;
      costCents: number | null;
    }>
  > {
    const rows = await this.prisma.aiUsageLog.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      feature: r.feature,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      imagesGenerated: r.imagesGenerated,
      costCents: r.costCents,
    }));
  }
}
