import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

type NoteItem = { quantity: number; label: string; unitPriceCents: number };

/** Ce que le bon d'échange imprime, figé à l'échange (ADR-0020). */
export interface ShopExchangeNoteData {
  club: { name: string; siret: string | null; address: string | null };
  order: {
    /** `CMD-` + 8 premiers caractères de l'identifiant. */
    reference: string;
    createdAt: Date;
  };
  exchange: {
    /** `ECH-` + 8 premiers caractères de l'identifiant de l'échange. */
    reference: string;
    at: Date;
    reason: string;
    returned: NoteItem;
    taken: NoteItem;
    /** Pris − rendu. */
    differenceCents: number;
    /** Rendu à l'adhérent, tous moyens confondus. */
    refundedCents: number;
    /** Reste dû éteint par avoir. */
    writtenOffCents: number;
  };
  buyerName: string | null;
  signature: { signerName: string; signaturePng: Buffer };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 18;
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

const COLS = {
  what: { x: LEFT, w: 50 },
  qty: { x: LEFT + 54, w: 32 },
  label: { x: LEFT + 90, w: 246 },
  unit: { x: LEFT + 342, w: 76 },
  total: { x: LEFT + 422, w: RIGHT - (LEFT + 422) },
} as const;

/**
 * Bon d'échange d'une commande boutique déjà remise (ADR-0020) : ce que
 * l'adhérent a rendu, ce qu'il a pris, la différence, et sa signature. Le bon
 * de livraison d'origine, lui, reste tel qu'il a été signé.
 *
 * Produit à la demande à partir des données figées à l'échange ; noir et
 * blanc, Helvetica, comme le bon de livraison.
 */
@Injectable()
export class ShopExchangeNotePdfService {
  private readonly logger = new Logger(ShopExchangeNotePdfService.name);

  async build(data: ShopExchangeNoteData): Promise<Buffer> {
    const signature = await this.readableSignature(data.signature.signaturePng);

    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Bon d'échange ${data.exchange.reference}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000');
    doc.text(data.club.name, LEFT, MARGIN, { width: RIGHT - LEFT });
    doc.font('Helvetica').fontSize(9);
    if (data.club.address) doc.text(data.club.address, { width: RIGHT - LEFT });
    if (data.club.siret) doc.text(`SIRET ${data.club.siret}`);
    doc.moveDown(1.2);

    doc.font('Helvetica-Bold').fontSize(16).text('Bon d’échange');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(
      `Échange ${data.exchange.reference} du ${frDate(data.exchange.at)}`,
    );
    doc.text(
      `Commande ${data.order.reference} du ${frDate(data.order.createdAt)}`,
    );
    doc.text(`Acheteur : ${data.buyerName ?? '—'}`);
    doc.text(`Motif : ${data.exchange.reason}`, { width: RIGHT - LEFT });
    doc.moveDown(0.8);

    let y = doc.y + 6;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('', COLS.what.x, y, { width: COLS.what.w, lineBreak: false });
    doc.text('Qté', COLS.qty.x, y, { width: COLS.qty.w, lineBreak: false });
    doc.text('Article', COLS.label.x, y, { width: COLS.label.w, lineBreak: false });
    doc.text('Prix unitaire', COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
    doc.text('Montant', COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
    doc.moveTo(LEFT, y + 13).lineTo(RIGHT, y + 13).lineWidth(0.8).strokeColor('#000').stroke();
    y += ROW_HEIGHT;

    doc.font('Helvetica').fontSize(9);
    for (const [what, item] of [
      ['Rendu', data.exchange.returned],
      ['Pris', data.exchange.taken],
    ] as const) {
      doc.text(what, COLS.what.x, y, { width: COLS.what.w, lineBreak: false });
      doc.text(String(item.quantity), COLS.qty.x, y, { width: COLS.qty.w, lineBreak: false });
      doc.text(item.label, COLS.label.x, y, { width: COLS.label.w, lineBreak: false, ellipsis: true });
      doc.text(euro.format(item.unitPriceCents / 100), COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
      doc.text(euro.format((item.unitPriceCents * item.quantity) / 100), COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
      y += ROW_HEIGHT;
    }

    doc.moveTo(LEFT, y + 2).lineTo(RIGHT, y + 2).lineWidth(0.8).strokeColor('#000').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Différence', LEFT, y, { width: 200, lineBreak: false });
    doc.text(euro.format(data.exchange.differenceCents / 100), COLS.total.x - 60, y, {
      width: COLS.total.w + 60,
      align: 'right',
      lineBreak: false,
    });
    y += ROW_HEIGHT * 1.5;

    doc.font('Helvetica').fontSize(10).text(this.moneySentence(data), LEFT, y, {
      width: RIGHT - LEFT,
    });

    y = doc.y + 16;
    const signer = data.signature.signerName || '—';
    doc.text(
      `Je soussigné(e) ${signer} reconnais avoir rendu l’article « ${data.exchange.returned.label} » et reçu l’article « ${data.exchange.taken.label} » ci-dessus.`,
      LEFT,
      y,
      { width: RIGHT - LEFT },
    );
    const boxY = doc.y + 10;
    doc.rect(LEFT, boxY, 240, 110).lineWidth(0.8).strokeColor('#000').stroke();
    if (signature) {
      doc.image(signature, LEFT + 8, boxY + 8, { fit: [224, 94], align: 'center', valign: 'center' });
    } else {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text('(signature illisible)', LEFT + 8, boxY + 48, { width: 224, align: 'center' });
    }
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(`Signature — ${signer}`, LEFT, boxY + 114, { width: 240, lineBreak: false });

    doc.text(
      `${data.club.name} — bon d’échange ${data.exchange.reference}`,
      LEFT,
      FOOTER_Y,
      { width: RIGHT - LEFT, align: 'center', lineBreak: false },
    );

    doc.end();
    return done;
  }

  /** Ce que la différence est devenue, en une phrase. */
  moneySentence(data: ShopExchangeNoteData): string {
    const { differenceCents, refundedCents, writtenOffCents } = data.exchange;
    if (differenceCents > 0) {
      return `Reste à payer : ${euro.format(differenceCents / 100)}, facturé à part.`;
    }
    if (differenceCents === 0) return 'Échange sans différence de prix.';
    const parts: string[] = [];
    if (refundedCents > 0) parts.push(`${euro.format(refundedCents / 100)} rendus`);
    if (writtenOffCents > 0) {
      parts.push(`${euro.format(writtenOffCents / 100)} retirés du reste à payer`);
    }
    return `En faveur de l’adhérent : ${euro.format(-differenceCents / 100)}${
      parts.length > 0 ? ` (${parts.join(', ')})` : ''
    }.`;
  }

  /** Même précaution que le bon de livraison : sharp vérifie l'image avant pdfkit. */
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
}
