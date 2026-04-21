import { Injectable } from '@nestjs/common';
import { MediaAssetsService } from '../media/media-assets.service';
import { OpenrouterService } from './openrouter.service';

export interface GenerateAndUploadInput {
  clubId: string;
  userId: string;
  apiKey: string;
  imageModel: string;
  prompt: string;
  /** Propriétaire logique (ex. 'VITRINE_ARTICLE'). */
  ownerKind?: string;
  ownerId?: string;
}

export interface GenerateAndUploadResult {
  mediaAssetId: string;
  publicUrl: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

@Injectable()
export class ImageGeneratorService {
  constructor(
    private readonly openrouter: OpenrouterService,
    private readonly media: MediaAssetsService,
  ) {}

  async generateAndUpload(
    input: GenerateAndUploadInput,
  ): Promise<GenerateAndUploadResult> {
    const gen = await this.openrouter.generateImage({
      apiKey: input.apiKey,
      model: input.imageModel,
      prompt: input.prompt,
    });
    const buffer = Buffer.from(gen.imageBase64, 'base64');
    const ext = gen.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const asset = await this.media.uploadImage(
      input.clubId,
      input.userId,
      {
        originalname: `ai-${Date.now()}.${ext}`,
        mimetype: gen.mimeType,
        size: buffer.byteLength,
        buffer,
      },
      input.ownerKind && input.ownerId
        ? { kind: input.ownerKind, id: input.ownerId }
        : null,
    );
    return {
      mediaAssetId: asset.id,
      publicUrl: asset.publicUrl,
      inputTokens: gen.inputTokens,
      outputTokens: gen.outputTokens,
      model: gen.model,
    };
  }
}
