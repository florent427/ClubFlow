import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Traite les pièces jointes envoyées avec un message à l'agent :
 *  - Images → chargées en base64 pour envoi multimodal au LLM
 *  - PDF → texte extrait via pdf-parse
 *  - DOCX → texte extrait via mammoth
 *  - TXT → lu directement
 *
 * Retourne une structure normalisée stockée dans `AgentMessage.attachmentsJson`
 * et utilisée pour construire le content array multimodal envoyé à OpenRouter.
 */

export type AttachmentKind = 'IMAGE' | 'DOCUMENT';

export interface ProcessedAttachment {
  mediaAssetId: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  publicUrl: string;
  /** Pour DOCUMENT : texte extrait. Pour IMAGE : null. */
  extractedText: string | null;
  /** Pour IMAGE : data URL base64 inline. Null pour DOCUMENT. */
  imageDataUrl: string | null;
}

const MAX_EXTRACTED_CHARS = 50_000;
const SUPPORTED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const SUPPORTED_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

@Injectable()
export class AgentAttachmentProcessorService {
  private readonly logger = new Logger(AgentAttachmentProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Charge les MediaAssets + fichier disque + extrait le texte si applicable.
   * Valide que chaque asset appartient au club du message.
   */
  async processAttachments(
    clubId: string,
    mediaAssetIds: string[],
  ): Promise<ProcessedAttachment[]> {
    if (mediaAssetIds.length === 0) return [];
    if (mediaAssetIds.length > 5) {
      throw new BadRequestException('Maximum 5 pièces jointes par message.');
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: mediaAssetIds }, clubId },
    });
    if (assets.length !== mediaAssetIds.length) {
      throw new BadRequestException(
        'Pièce jointe introuvable ou refusée (cross-club).',
      );
    }

    const uploadsDir = process.env.UPLOADS_DIR ?? './uploads';
    const results: ProcessedAttachment[] = [];

    for (const asset of assets) {
      const absPath = join(uploadsDir, asset.storagePath);
      if (!existsSync(absPath)) {
        this.logger.warn(`Fichier manquant : ${absPath}`);
        continue;
      }

      const isImage = SUPPORTED_IMAGE_MIMES.has(asset.mimeType.toLowerCase());
      const isDoc = SUPPORTED_DOC_MIMES.has(asset.mimeType.toLowerCase());

      if (!isImage && !isDoc) {
        this.logger.warn(
          `MIME non supporté pour l'agent : ${asset.mimeType} (${asset.fileName})`,
        );
        continue;
      }

      if (isImage) {
        const buffer = readFileSync(absPath);
        const dataUrl = `data:${asset.mimeType};base64,${buffer.toString('base64')}`;
        results.push({
          mediaAssetId: asset.id,
          kind: 'IMAGE',
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          publicUrl: asset.publicUrl,
          extractedText: null,
          imageDataUrl: dataUrl,
        });
      } else {
        const text = await this.extractText(absPath, asset.mimeType);
        const truncated =
          text.length > MAX_EXTRACTED_CHARS
            ? text.slice(0, MAX_EXTRACTED_CHARS) +
              `\n\n...[${text.length - MAX_EXTRACTED_CHARS} caractères tronqués]`
            : text;
        results.push({
          mediaAssetId: asset.id,
          kind: 'DOCUMENT',
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          publicUrl: asset.publicUrl,
          extractedText: truncated,
          imageDataUrl: null,
        });
      }
    }
    return results;
  }

  private async extractText(
    filePath: string,
    mimeType: string,
  ): Promise<string> {
    const m = mimeType.toLowerCase();
    try {
      if (m === 'application/pdf') {
        // pdf-parse v2 : API class-based.
        const { PDFParse } = await import('pdf-parse');
        const buf = readFileSync(filePath);
        const parser = new PDFParse({ data: new Uint8Array(buf) });
        try {
          const text = await parser.getText();
          // TextResult concatène le texte de toutes les pages.
          return (text as unknown as { text?: string }).text ?? '';
        } finally {
          await parser.destroy();
        }
      }
      if (
        m ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        m === 'application/msword'
      ) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value ?? '';
      }
      if (m === 'text/plain' || m === 'text/markdown' || m === 'text/csv') {
        return readFileSync(filePath, 'utf-8');
      }
    } catch (err) {
      this.logger.error(
        `Extraction text failed (${mimeType}) : ${err instanceof Error ? err.message : err}`,
      );
      return `[Extraction échouée pour ${mimeType}]`;
    }
    return '';
  }
}
