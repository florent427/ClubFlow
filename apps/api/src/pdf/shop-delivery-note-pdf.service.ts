import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

/** Ce que le bon de livraison imprime, figé à la remise (ADR-0017). */
export interface ShopDeliveryNoteData {
  club: { name: string; siret: string | null; address: string | null };
  order: {
    /** `CMD-` + 8 premiers caractères de l'identifiant. */
    reference: string;
    createdAt: Date;
    totalCents: number;
    paid: boolean;
    paidAt: Date | null;
    lines: Array<{ quantity: number; label: string; unitPriceCents: number }>;
  };
  buyerName: string | null;
  delivery: { deliveredAt: Date; signerName: string; signaturePng: Buffer };
  /** CGV acceptées — à la commande, ou par la signature de la remise. */
  terms: { fileName: string; acceptedAt: Date } | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 18;
/** Au-delà, on change de page avant d'écrire la ligne suivante. */
const PAGE_BREAK_Y = 700;
/** Hauteur réservée au bloc attestation + signature. */
const SIGNATURE_BLOCK_HEIGHT = 190;
/**
 * Pied de page DANS la zone imprimable : pdfkit ajoute une page dès qu'un texte
 * dépasse la marge basse (cf. bordereau de remise de chèques).
 */
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 12;

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

function frDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Colonnes du tableau : x de départ et largeur. */
const COLS = {
  qty: { x: LEFT, w: 40 },
  label: { x: LEFT + 46, w: 290 },
  unit: { x: LEFT + 342, w: 76 },
  total: { x: LEFT + 422, w: RIGHT - (LEFT + 422) },
} as const;

/**
 * Bon de livraison d'une commande boutique (ADR-0017) : ce que l'adhérent a
 * retiré, quand, et sa signature.
 *
 * Produit à la demande à partir des données figées à la remise — lignes
 * figées à la commande, date, signataire, signature — il se reproduit donc à
 * l'identique, comme une facture. Noir et blanc, Helvetica.
 */
@Injectable()
export class ShopDeliveryNotePdfService {
  private readonly logger = new Logger(ShopDeliveryNotePdfService.name);

  async build(data: ShopDeliveryNoteData): Promise<Buffer> {
    const signature = await this.readableSignature(data.delivery.signaturePng);

    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Bon de livraison ${data.order.reference}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.header(doc, data);

    let y = this.tableHeader(doc, doc.y + 6);
    doc.font('Helvetica').fontSize(9).fillColor('#000');
    for (const l of data.order.lines) {
      if (y > PAGE_BREAK_Y) {
        doc.addPage();
        y = this.tableHeader(doc, MARGIN);
        doc.font('Helvetica').fontSize(9).fillColor('#000');
      }
      doc.text(String(l.quantity), COLS.qty.x, y, { width: COLS.qty.w, lineBreak: false });
      doc.text(l.label, COLS.label.x, y, { width: COLS.label.w, lineBreak: false, ellipsis: true });
      doc.text(euro.format(l.unitPriceCents / 100), COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
      doc.text(euro.format((l.unitPriceCents * l.quantity) / 100), COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
      y += ROW_HEIGHT;
    }

    doc.moveTo(LEFT, y + 2).lineTo(RIGHT, y + 2).lineWidth(0.8).strokeColor('#000').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total', LEFT, y, { width: 200, lineBreak: false });
    doc.text(euro.format(data.order.totalCents / 100), COLS.total.x - 60, y, {
      width: COLS.total.w + 60,
      align: 'right',
      lineBreak: false,
    });
    y += ROW_HEIGHT * 1.5;

    doc.font('Helvetica').fontSize(10).text(
      data.order.paid
        ? `Règlement : payé${data.order.paidAt ? ` le ${frDate(data.order.paidAt)}` : ''}.`
        : 'Règlement : à effectuer — la facture de cette commande reste à régler.',
      LEFT,
      y,
      { width: RIGHT - LEFT },
    );

    y = doc.y + 16;
    if (y + SIGNATURE_BLOCK_HEIGHT > FOOTER_Y - 8) {
      doc.addPage();
      y = MARGIN;
    }
    this.signatureBlock(doc, data, y, signature);

    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(
      `${data.club.name} — bon de livraison ${data.order.reference}`,
      LEFT,
      FOOTER_Y,
      { width: RIGHT - LEFT, align: 'center', lineBreak: false },
    );

    doc.end();
    return done;
  }

  /**
   * La signature passe par sharp AVANT d'entrer dans le PDF. pdfkit décode les
   * PNG de façon asynchrone : une erreur de données (« incorrect data check »)
   * n'y lève rien et n'émet aucun `error` — le document ne se termine jamais,
   * et la requête du bon de livraison reste pendue. Sharp décode l'image en
   * entier, donc la vérifie, et rend un PNG que pdfkit sait lire. Illisible :
   * `null`, et le bon le dit au lieu de ne jamais sortir.
   */
  private async readableSignature(png: Buffer): Promise<Buffer | null> {
    try {
      return await sharp(png).png().toBuffer();
    } catch (err) {
      this.logger.warn(
        `Signature illisible (${err instanceof Error ? err.message : String(err)})`,
      );
      return null;
    }
  }

  private header(doc: PDFKit.PDFDocument, data: ShopDeliveryNoteData): void {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000');
    doc.text(data.club.name, LEFT, MARGIN, { width: RIGHT - LEFT });
    doc.font('Helvetica').fontSize(9);
    if (data.club.address) doc.text(data.club.address, { width: RIGHT - LEFT });
    if (data.club.siret) doc.text(`SIRET ${data.club.siret}`);
    doc.moveDown(1.2);

    doc.font('Helvetica-Bold').fontSize(16).text('Bon de livraison');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Commande ${data.order.reference} du ${frDate(data.order.createdAt)}`);
    doc.text(`Remise le ${frDate(data.delivery.deliveredAt)}`);
    doc.text(`Acheteur : ${data.buyerName ?? '—'}`);
    doc.moveDown(0.8);
  }

  private tableHeader(doc: PDFKit.PDFDocument, y: number): number {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text('Qté', COLS.qty.x, y, { width: COLS.qty.w, lineBreak: false });
    doc.text('Article', COLS.label.x, y, { width: COLS.label.w, lineBreak: false });
    doc.text('Prix unitaire', COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
    doc.text('Montant', COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
    doc.moveTo(LEFT, y + 13).lineTo(RIGHT, y + 13).lineWidth(0.8).strokeColor('#000').stroke();
    return y + ROW_HEIGHT;
  }

  private signatureBlock(
    doc: PDFKit.PDFDocument,
    data: ShopDeliveryNoteData,
    y: number,
    signature: Buffer | null,
  ): void {
    const signer = data.delivery.signerName || '—';
    const attestation = data.terms
      ? `Je soussigné(e) ${signer} reconnais avoir reçu les articles ci-dessus, et avoir accepté le ${frDate(
          data.terms.acceptedAt,
        )} les conditions générales de vente de la boutique (${data.terms.fileName}).`
      : `Je soussigné(e) ${signer} reconnais avoir reçu les articles ci-dessus.`;
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    doc.text(attestation, LEFT, y, { width: RIGHT - LEFT });

    const boxY = doc.y + 10;
    doc.rect(LEFT, boxY, 240, 110).lineWidth(0.8).strokeColor('#000').stroke();
    if (signature) {
      doc.image(signature, LEFT + 8, boxY + 8, {
        fit: [224, 94],
        align: 'center',
        valign: 'center',
      });
    } else {
      // Une signature enregistrée mais illisible ne doit pas empêcher de
      // produire le bon : la date et le signataire restent, et c'est dit.
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text('(signature illisible)', LEFT + 8, boxY + 48, { width: 224, align: 'center' });
    }
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(`Signature — ${signer}`, LEFT, boxY + 114, { width: 240, lineBreak: false });
  }
}
