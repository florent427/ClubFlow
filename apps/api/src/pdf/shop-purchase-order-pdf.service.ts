import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/** Ce que le bon de commande imprime (ADR-0021 §5). */
export interface ShopPurchaseOrderPdfData {
  club: {
    name: string;
    siret: string | null;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  supplier: {
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    /** Numéro de compte client du club chez ce fournisseur. */
    accountRef: string | null;
  };
  order: {
    /** « CF-2026-004 ». */
    reference: string;
    /** Date d'envoi ; null tant que la commande est un brouillon. */
    orderedAt: Date | null;
    expectedAt: Date | null;
    notes: string | null;
    lines: Array<{
      /** Référence chez CE fournisseur : l'exception de la déclinaison, sinon l'offre. */
      supplierRef: string | null;
      label: string;
      quantity: number;
      /** Prix d'achat unitaire HT de la ligne, en centimes. 0 : non renseigné. */
      unitCostCents: number;
    }>;
  };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 18;
/** Au-delà, on change de page avant d'écrire la ligne suivante. */
const PAGE_BREAK_Y = 720;
/**
 * Pied de page DANS la zone imprimable : pdfkit ajoute une page dès qu'un texte
 * dépasse la marge basse (cf. bon de livraison).
 */
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 12;

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

/**
 * Montant en euros. L'espace fine insécable (U+202F) qu'`Intl` place entre les
 * milliers n'existe pas dans l'encodage des polices standard du PDF : elle
 * devient une espace insécable ordinaire, qui, elle, s'imprime.
 */
function euro(cents: number): string {
  return euroFormat.format(cents / 100).replace(/\u202f/g, '\u00a0');
}

function frDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Colonnes du tableau : x de départ et largeur. */
const COLS = {
  ref: { x: LEFT, w: 92 },
  label: { x: LEFT + 98, w: 200 },
  qty: { x: LEFT + 304, w: 36 },
  unit: { x: LEFT + 346, w: 70 },
  total: { x: LEFT + 422, w: RIGHT - (LEFT + 422) },
} as const;

/**
 * Bon de commande fournisseur (ADR-0021 §5) : ce que le club commande, chez
 * qui, à quelle référence et à quel prix.
 *
 * Produit à la demande à partir de la commande : il se relit à l'identique tant
 * qu'elle ne change pas. Un prix d'achat non renseigné s'imprime « à confirmer »
 * et reste hors du total — jamais 0 €, qu'un fournisseur lirait comme un prix.
 * Noir et blanc, Helvetica, comme le bon de livraison.
 */
@Injectable()
export class ShopPurchaseOrderPdfService {
  async build(data: ShopPurchaseOrderPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Bon de commande ${data.order.reference}` },
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
    let knownTotalCents = 0;
    let unknownPrices = 0;
    for (const l of data.order.lines) {
      if (y > PAGE_BREAK_Y) {
        doc.addPage();
        y = this.tableHeader(doc, MARGIN);
        doc.font('Helvetica').fontSize(9).fillColor('#000');
      }
      const priced = l.unitCostCents > 0;
      doc.text(l.supplierRef ?? '—', COLS.ref.x, y, { width: COLS.ref.w, lineBreak: false, ellipsis: true });
      doc.text(l.label, COLS.label.x, y, { width: COLS.label.w, lineBreak: false, ellipsis: true });
      doc.text(String(l.quantity), COLS.qty.x, y, { width: COLS.qty.w, align: 'right', lineBreak: false });
      doc.text(priced ? euro(l.unitCostCents) : 'à confirmer', COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
      doc.text(priced ? euro(l.unitCostCents * l.quantity) : '—', COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
      if (priced) knownTotalCents += l.unitCostCents * l.quantity;
      else unknownPrices += 1;
      y += ROW_HEIGHT;
    }

    doc.moveTo(LEFT, y + 2).lineTo(RIGHT, y + 2).lineWidth(0.8).strokeColor('#000').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(
      unknownPrices > 0 ? 'Total HT, hors prix à confirmer' : 'Total HT',
      LEFT,
      y,
      { width: 300, lineBreak: false },
    );
    doc.text(euro(knownTotalCents), COLS.total.x - 60, y, {
      width: COLS.total.w + 60,
      align: 'right',
      lineBreak: false,
    });
    y += ROW_HEIGHT * 1.5;

    if (data.order.notes) {
      if (y > PAGE_BREAK_Y) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font('Helvetica-Bold').fontSize(10).text('Notes', LEFT, y);
      doc.font('Helvetica').fontSize(10).text(data.order.notes, { width: RIGHT - LEFT });
    }

    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(
      `${data.club.name} — bon de commande ${data.order.reference}`,
      LEFT,
      FOOTER_Y,
      { width: RIGHT - LEFT, align: 'center', lineBreak: false },
    );

    doc.end();
    return done;
  }

  private header(doc: PDFKit.PDFDocument, data: ShopPurchaseOrderPdfData): void {
    const { club, supplier, order } = data;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000');
    doc.text(club.name, LEFT, MARGIN, { width: RIGHT - LEFT });
    doc.font('Helvetica').fontSize(9);
    if (club.address) doc.text(club.address, { width: RIGHT - LEFT });
    if (club.siret) doc.text(`SIRET ${club.siret}`);
    const contact = [club.contactEmail, club.contactPhone].filter(Boolean).join(' · ');
    if (contact) doc.text(`Contact : ${contact}`);
    doc.moveDown(1.2);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(order.orderedAt ? 'Bon de commande' : 'Bon de commande — brouillon');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Référence ${order.reference}`);
    doc.text(
      order.orderedAt
        ? `Commande du ${frDate(order.orderedAt)}`
        : 'Pas encore envoyée au fournisseur',
    );
    if (order.expectedAt) doc.text(`Livraison souhaitée le ${frDate(order.expectedAt)}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text(`Fournisseur : ${supplier.name}`);
    doc.font('Helvetica').fontSize(9);
    if (supplier.contactName) doc.text(`À l’attention de ${supplier.contactName}`);
    const reach = [supplier.email, supplier.phone].filter(Boolean).join(' · ');
    if (reach) doc.text(reach);
    if (supplier.accountRef) doc.text(`Notre numéro client : ${supplier.accountRef}`);
    doc.moveDown(0.8);
  }

  private tableHeader(doc: PDFKit.PDFDocument, y: number): number {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text('Réf. fournisseur', COLS.ref.x, y, { width: COLS.ref.w, lineBreak: false });
    doc.text('Désignation', COLS.label.x, y, { width: COLS.label.w, lineBreak: false });
    doc.text('Qté', COLS.qty.x, y, { width: COLS.qty.w, align: 'right', lineBreak: false });
    doc.text('Prix unit. HT', COLS.unit.x, y, { width: COLS.unit.w, align: 'right', lineBreak: false });
    doc.text('Total HT', COLS.total.x, y, { width: COLS.total.w, align: 'right', lineBreak: false });
    doc.moveTo(LEFT, y + 13).lineTo(RIGHT, y + 13).lineWidth(0.8).strokeColor('#000').stroke();
    return y + ROW_HEIGHT;
  }
}
