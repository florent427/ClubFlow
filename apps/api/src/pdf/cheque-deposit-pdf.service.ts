import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface DepositSlipData {
  club: { name: string; siret: string | null };
  deposit: {
    number: string;
    depositedOn: Date;
    totalCents: number;
    chequeCount: number;
    notes: string | null;
    cancelled: boolean;
  };
  bank: {
    label: string;
    iban: string | null;
    bic: string | null;
    accountingAccountCode: string;
  };
  cheques: Array<{
    number: string | null;
    drawerName: string;
    bankName: string | null;
    amountCents: number;
    receivedOn: Date;
  }>;
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
 * Pied de page DANS la zone imprimable : pdfkit ajoute une page dès qu'un
 * texte dépasse la marge basse, et le bordereau sortait avec une seconde
 * page blanche (vu sur staging le 2026-09-10).
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

function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Colonnes du tableau : x de départ et largeur. */
const COLS = {
  number: { x: LEFT, w: 80 },
  drawer: { x: LEFT + 84, w: 170 },
  bank: { x: LEFT + 258, w: 110 },
  received: { x: LEFT + 372, w: 62 },
  amount: { x: LEFT + 438, w: RIGHT - (LEFT + 438) },
} as const;

/**
 * Bordereau de remise de chèques (ADR-0015), imprimable : ce que la banque
 * demande au guichet — numéro de remise, compte crédité, un chèque par
 * ligne, total, cadres de signature. Noir et blanc, Helvetica.
 */
@Injectable()
export class ChequeDepositPdfService {
  async build(data: DepositSlipData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Remise de chèques ${data.deposit.number}` },
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
    for (const c of data.cheques) {
      if (y > PAGE_BREAK_Y) {
        doc.addPage();
        y = this.tableHeader(doc, MARGIN);
        doc.font('Helvetica').fontSize(9).fillColor('#000');
      }
      doc.text(c.number ?? '—', COLS.number.x, y, { width: COLS.number.w, lineBreak: false });
      doc.text(c.drawerName, COLS.drawer.x, y, { width: COLS.drawer.w, lineBreak: false, ellipsis: true });
      doc.text(c.bankName ?? '—', COLS.bank.x, y, { width: COLS.bank.w, lineBreak: false, ellipsis: true });
      doc.text(frDate(c.receivedOn), COLS.received.x, y, { width: COLS.received.w, lineBreak: false });
      doc.text(euro.format(c.amountCents / 100), COLS.amount.x, y, { width: COLS.amount.w, align: 'right', lineBreak: false });
      y += ROW_HEIGHT;
    }

    // Total
    doc.moveTo(LEFT, y + 2).lineTo(RIGHT, y + 2).lineWidth(0.8).strokeColor('#000').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(
      `Total — ${data.deposit.chequeCount} chèque${data.deposit.chequeCount > 1 ? 's' : ''}`,
      LEFT,
      y,
      { width: 300, lineBreak: false },
    );
    doc.text(euro.format(data.deposit.totalCents / 100), COLS.amount.x - 60, y, {
      width: COLS.amount.w + 60,
      align: 'right',
      lineBreak: false,
    });
    y += ROW_HEIGHT * 2;

    if (data.deposit.notes) {
      doc.font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(`Notes : ${data.deposit.notes}`, LEFT, y, { width: RIGHT - LEFT });
      y = doc.y + ROW_HEIGHT;
      doc.fillColor('#000');
    }

    // Cadres de signature
    if (y > PAGE_BREAK_Y - 90) {
      doc.addPage();
      y = MARGIN;
    }
    const boxW = (RIGHT - LEFT - 20) / 2;
    const boxH = 70;
    doc.lineWidth(0.6).strokeColor('#666');
    doc.rect(LEFT, y, boxW, boxH).stroke();
    doc.rect(LEFT + boxW + 20, y, boxW, boxH).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#444');
    doc.text('Signature du déposant', LEFT + 6, y + 6, { lineBreak: false });
    doc.text('Cachet de la banque', LEFT + boxW + 26, y + 6, { lineBreak: false });
    doc.fillColor('#000');

    // Pied de page
    doc.font('Helvetica').fontSize(7).fillColor('#777');
    doc.text(
      `Généré par ClubFlow le ${frDate(new Date())}${data.deposit.cancelled ? ' — REMISE ANNULÉE' : ''}`,
      LEFT,
      FOOTER_Y,
      { width: RIGHT - LEFT, align: 'center', lineBreak: false },
    );

    doc.end();
    return done;
  }

  private header(doc: PDFKit.PDFDocument, data: DepositSlipData): void {
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000');
    doc.text('Bordereau de remise de chèques', LEFT, MARGIN, { lineBreak: false });
    if (data.deposit.cancelled) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#b00020');
      doc.text('ANNULÉE', LEFT, MARGIN + 2, { width: RIGHT - LEFT, align: 'right', lineBreak: false });
      doc.fillColor('#000');
    }
    doc.font('Helvetica').fontSize(10).fillColor('#444');
    doc.text(
      `Remise n° ${data.deposit.number} — déposée le ${frDate(data.deposit.depositedOn)}`,
      LEFT,
      MARGIN + 26,
      { lineBreak: false },
    );
    doc.fillColor('#000');

    let y = MARGIN + 52;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(data.club.name, LEFT, y, { width: RIGHT - LEFT, lineBreak: false });
    y += 16;
    doc.font('Helvetica').fontSize(10);
    if (data.club.siret) {
      doc.text(`SIRET ${data.club.siret}`, LEFT, y, { lineBreak: false });
      y += 14;
    }
    y += 6;
    doc.font('Helvetica-Bold').text('Compte crédité : ', LEFT, y, { continued: true, lineBreak: false });
    doc.font('Helvetica').text(
      `${data.bank.label} (${data.bank.accountingAccountCode})`,
      { lineBreak: false },
    );
    y += 14;
    if (data.bank.iban) {
      doc.text(
        `IBAN ${formatIban(data.bank.iban)}${data.bank.bic ? ` · BIC ${data.bank.bic}` : ''}`,
        LEFT,
        y,
        { lineBreak: false },
      );
      y += 14;
    }
    doc.y = y + 8;
  }

  /** En-tête du tableau ; rend le y de la première ligne de données. */
  private tableHeader(doc: PDFKit.PDFDocument, y: number): number {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text('N° chèque', COLS.number.x, y, { width: COLS.number.w, lineBreak: false });
    doc.text('Émetteur', COLS.drawer.x, y, { width: COLS.drawer.w, lineBreak: false });
    doc.text('Banque', COLS.bank.x, y, { width: COLS.bank.w, lineBreak: false });
    doc.text('Reçu le', COLS.received.x, y, { width: COLS.received.w, lineBreak: false });
    doc.text('Montant', COLS.amount.x, y, { width: COLS.amount.w, align: 'right', lineBreak: false });
    const lineY = y + ROW_HEIGHT - 4;
    doc.moveTo(LEFT, lineY).lineTo(RIGHT, lineY).lineWidth(0.8).strokeColor('#000').stroke();
    return y + ROW_HEIGHT + 2;
  }
}
