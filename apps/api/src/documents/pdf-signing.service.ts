import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ClubDocumentField } from '@prisma/client';
import { ClubDocumentFieldType } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Valeur saisie par l'utilisateur pour un champ donné, normalisée pour le
 * rendu PDF. Voir `SignClubDocumentFieldValueInput` côté GraphQL.
 */
export interface FieldValue {
  type: ClubDocumentFieldType;
  /** PNG (dataURL ou base64 brut) — requis pour SIGNATURE. */
  valuePngBase64?: string | null;
  /** Texte — requis pour TEXT, optionnel pour DATE. */
  text?: string | null;
  /** Booléen — requis pour CHECKBOX. */
  bool?: boolean | null;
}

/**
 * Service dédié au rendu PDF signé via `pdf-lib`.
 *
 * Reçoit le PDF source + la liste des fields (positionnés en %) + les valeurs
 * saisies, dépose les overlays (image signature, texte, date, checkmark) et
 * renvoie un buffer PDF prêt à être stocké et hashé.
 *
 * Repère coordonnées :
 *  - Côté ClubFlow on stocke x/y/width/height en % (0..1) avec origine en
 *    HAUT-GAUCHE de la page (UX naturelle dans l'éditeur).
 *  - pdf-lib utilise un repère mathématique avec origine en BAS-GAUCHE.
 *  - On flippe Y au moment du rendu : `pdfY = pageHeight * (1 - y - height)`.
 */
@Injectable()
export class PdfSigningService {
  private readonly logger = new Logger(PdfSigningService.name);

  async render(
    sourcePdfBuffer: Buffer,
    fields: ClubDocumentField[],
    fieldValues: Map<string, FieldValue>,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(sourcePdfBuffer);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const field of fields) {
      const value = fieldValues.get(field.id);
      if (!value) continue;

      const pageIndex = field.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) {
        this.logger.warn(
          `Field ${field.id} référence la page ${field.page} qui n'existe pas (PDF a ${pages.length} pages).`,
        );
        continue;
      }
      const page = pages[pageIndex];
      if (!page) continue;
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const xPx = pageWidth * field.x;
      // Flip Y : top-gauche → bas-gauche.
      const yPx = pageHeight * (1 - field.y - field.height);
      const widthPx = pageWidth * field.width;
      const heightPx = pageHeight * field.height;

      switch (field.fieldType) {
        case ClubDocumentFieldType.SIGNATURE: {
          if (!value.valuePngBase64) {
            // Champ requis vide : la validation côté service amont a déjà
            // rejeté ; ici on se contente de skip pour ne pas crasher si
            // le champ était facultatif.
            continue;
          }
          try {
            const bytes = base64ToBytes(value.valuePngBase64);
            const image = await pdfDoc.embedPng(bytes);
            page.drawImage(image, {
              x: xPx,
              y: yPx,
              width: widthPx,
              height: heightPx,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new BadRequestException(
              `Signature PNG invalide pour le champ ${field.id} : ${msg}`,
            );
          }
          break;
        }
        case ClubDocumentFieldType.TEXT: {
          const text = value.text ?? '';
          if (!text) continue;
          const size = Math.min(heightPx, 14);
          page.drawText(text, {
            x: xPx,
            // Pour drawText, y est la baseline ; on remonte un peu pour
            // centrer verticalement dans la zone.
            y: yPx + (heightPx - size) / 2,
            size,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          break;
        }
        case ClubDocumentFieldType.DATE: {
          const text =
            value.text && value.text.length > 0
              ? value.text
              : new Date().toLocaleDateString('fr-FR');
          const size = Math.min(heightPx, 14);
          page.drawText(text, {
            x: xPx,
            y: yPx + (heightPx - size) / 2,
            size,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          break;
        }
        case ClubDocumentFieldType.CHECKBOX: {
          if (value.bool !== true) continue;
          const size = heightPx * 0.8;
          page.drawText('✓', {
            x: xPx,
            y: yPx + (heightPx - size) / 2,
            size,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          break;
        }
        default:
          // Couvre l'exhaustivité de l'enum sans crasher.
          this.logger.warn(`Type de champ inconnu : ${String(field.fieldType)}`);
      }
    }

    const out = await pdfDoc.save();
    return Buffer.from(out);
  }
}

/**
 * Décode un PNG fourni soit en dataURL (`data:image/png;base64,XXXX`) soit
 * en base64 brut.
 */
function base64ToBytes(b64: string): Uint8Array {
  const trimmed = b64.trim();
  const commaIdx = trimmed.indexOf(',');
  const payload =
    trimmed.startsWith('data:') && commaIdx !== -1
      ? trimmed.slice(commaIdx + 1)
      : trimmed;
  return new Uint8Array(Buffer.from(payload, 'base64'));
}
