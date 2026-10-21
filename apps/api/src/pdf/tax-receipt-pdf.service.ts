import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { centsToFrenchWords } from './french-amount';

/**
 * Ce que le reçu imprime, figé à l'émission (`TaxReceipt.snapshot`) : un
 * reçu fiscal ne change plus une fois remis, même si le club déménage ou si
 * le donateur corrige son adresse.
 */
export interface TaxReceiptSnapshot {
  donor: {
    firstName: string;
    lastName: string;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
  };
  club: {
    name: string;
    address: string | null;
    rnaNumber: string | null;
    siret: string | null;
    purpose: string | null;
    organismType: 'PUBLIC_UTILITY' | 'GENERAL_INTEREST' | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
  };
  /** Les notes de frais abandonnées que couvre le reçu. */
  claims: Array<{
    id: string;
    title: string;
    meters: number;
    amountCents: number;
    firstDate: string;
    lastDate: string;
  }>;
  firstDate: string;
  lastDate: string;
}

export interface TaxReceiptPdfData {
  number: string;
  year: number;
  amountCents: number;
  issuedOn: Date;
  cancelled: boolean;
  snapshot: TaxReceiptSnapshot;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const WIDTH = RIGHT - LEFT;
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 12;

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function frIso(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function frDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/**
 * Reçu au titre des dons (modèle Cerfa 11580) pour les abandons de frais
 * kilométriques d'un bénévole. Reprend les rubriques du modèle officiel —
 * bénéficiaire, donateur, somme en chiffres et en lettres, article du CGI,
 * forme, nature — suivies du détail des notes. Noir et blanc, Helvetica.
 */
@Injectable()
export class TaxReceiptPdfService {
  async build(data: TaxReceiptPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Reçu fiscal ${data.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const s = data.snapshot;
    doc.fillColor('#000');

    // En-tête
    doc.font('Helvetica-Bold').fontSize(13).text(
      'Reçu au titre des dons à certains organismes d’intérêt général',
      LEFT,
      MARGIN,
      { width: WIDTH, align: 'center' },
    );
    doc.font('Helvetica').fontSize(8.5).text(
      'Articles 200, 238 bis et 978 du code général des impôts (CGI) — modèle Cerfa n° 11580',
      { width: WIDTH, align: 'center' },
    );
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(10).text(`Numéro d’ordre du reçu : ${data.number}`, {
      width: WIDTH,
      align: 'right',
    });
    if (data.cancelled) {
      doc.font('Helvetica-Bold').fontSize(12).text('REÇU ANNULÉ', { width: WIDTH, align: 'center' });
    }

    // Bénéficiaire
    this.section(doc, 'Bénéficiaire des versements');
    this.field(doc, 'Nom ou dénomination', s.club.name);
    this.field(doc, 'Adresse', (s.club.address ?? '').split('\n').filter(Boolean).join(', ') || '—');
    if (s.club.rnaNumber) this.field(doc, 'N° RNA', s.club.rnaNumber);
    if (s.club.siret) this.field(doc, 'SIRET', s.club.siret);
    this.field(doc, 'Objet', s.club.purpose ?? '—');
    doc.moveDown(0.3);
    this.check(doc, s.club.organismType === 'PUBLIC_UTILITY', 'Association ou fondation reconnue d’utilité publique');
    this.check(doc, s.club.organismType === 'GENERAL_INTEREST', 'Œuvre ou organisme d’intérêt général');

    // Donateur
    this.section(doc, 'Donateur');
    this.field(doc, 'Nom, prénoms', `${s.donor.lastName.toUpperCase()} ${s.donor.firstName}`);
    const donorAddress = [s.donor.addressLine, [s.donor.postalCode, s.donor.city].filter(Boolean).join(' ')]
      .filter((x) => x && x.trim())
      .join(', ');
    this.field(doc, 'Adresse', donorAddress || '—');

    // Versement
    this.section(doc, 'Don');
    doc.font('Helvetica').fontSize(10).text(
      'Le bénéficiaire reconnaît avoir reçu au titre des dons et versements ouvrant droit à réduction d’impôt la somme de :',
      LEFT,
      doc.y,
      { width: WIDTH },
    );
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).text(`*** ${euro.format(data.amountCents / 100)} ***`, { width: WIDTH, align: 'center' });
    doc.font('Helvetica').fontSize(10).text(`Somme en toutes lettres : ${centsToFrenchWords(data.amountCents)}`, { width: WIDTH });
    doc.moveDown(0.3);
    const period =
      s.firstDate === s.lastDate
        ? `le ${frIso(s.firstDate)}`
        : `du ${frIso(s.firstDate)} au ${frIso(s.lastDate)}`;
    this.field(doc, 'Date des dons', `frais engagés ${period} (année ${data.year})`);
    doc.moveDown(0.3);
    doc.text(
      'Le bénéficiaire certifie sur l’honneur que les dons et versements qu’il reçoit ouvrent droit à la réduction d’impôt prévue à l’article :',
      { width: WIDTH },
    );
    this.check(doc, true, '200 du CGI');
    this.check(doc, false, '238 bis du CGI');
    this.check(doc, false, '978 du CGI');
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Forme du don', LEFT, doc.y);
    this.check(doc, false, 'Acte authentique');
    this.check(doc, false, 'Acte sous seing privé');
    this.check(doc, false, 'Déclaration de don manuel');
    this.check(doc, true, 'Autres : renonciation au remboursement de frais engagés par un bénévole');
    doc.font('Helvetica-Bold').text('Nature du don', LEFT, doc.y);
    this.check(doc, true, 'Numéraire');
    this.check(doc, false, 'Titres de sociétés cotés');
    this.check(doc, false, 'Autres');

    // Signature
    doc.moveDown(0.8);
    const sigY = doc.y;
    doc.font('Helvetica').fontSize(10).text(`Date : ${frDate(data.issuedOn)}`, LEFT, sigY);
    const who = [s.club.signatoryName, s.club.signatoryTitle].filter(Boolean).join(', ');
    doc.text(`Signature${who ? ` (${who})` : ''} :`, LEFT + WIDTH / 2, sigY, { width: WIDTH / 2 });
    doc.rect(LEFT + WIDTH / 2, sigY + 16, WIDTH / 2, 50).lineWidth(0.6).strokeColor('#000').stroke();
    doc.y = sigY + 76;

    // Détail
    this.section(doc, 'Détail des frais abandonnés');
    doc.font('Helvetica').fontSize(9);
    for (const c of s.claims) {
      if (doc.y > FOOTER_Y - 40) doc.addPage();
      const y = doc.y;
      const km = (c.meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
      const dates = c.firstDate === c.lastDate ? frIso(c.firstDate) : `${frIso(c.firstDate)} – ${frIso(c.lastDate)}`;
      doc.text(c.title, LEFT, y, { width: 220, lineBreak: false, ellipsis: true });
      doc.text(dates, LEFT + 224, y, { width: 130, lineBreak: false });
      doc.text(`${km} km`, LEFT + 358, y, { width: 60, align: 'right', lineBreak: false });
      doc.text(euro.format(c.amountCents / 100), LEFT + 422, y, { width: RIGHT - (LEFT + 422), align: 'right', lineBreak: false });
      doc.y = y + 14;
    }
    doc.font('Helvetica').fontSize(7.5).text(
      'Frais kilométriques évalués au barème fiscal. Reçu à conserver : il justifie la réduction d’impôt sur le revenu.',
      LEFT,
      FOOTER_Y,
      { width: WIDTH, align: 'center', lineBreak: false },
    );

    doc.end();
    return done;
  }

  private section(doc: PDFKit.PDFDocument, title: string) {
    doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(LEFT, y, WIDTH, 16).fillColor('#e6e6e6').fill();
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text(title, LEFT + 6, y + 4, { width: WIDTH - 12 });
    doc.x = LEFT;
    doc.y = y + 22;
  }

  private field(doc: PDFKit.PDFDocument, label: string, value: string) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(`${label} :`, LEFT, y, { width: 130 });
    doc.font('Helvetica').text(value, LEFT + 134, y, { width: WIDTH - 134 });
    doc.y = Math.max(doc.y, y + 14);
    // Sans ce retour, le texte suivant sans x explicite part de la colonne valeur.
    doc.x = LEFT;
  }

  private check(doc: PDFKit.PDFDocument, checked: boolean, label: string) {
    const y = doc.y + 1;
    doc.rect(LEFT + 4, y, 8, 8).lineWidth(0.6).strokeColor('#000').stroke();
    if (checked) {
      doc.moveTo(LEFT + 5, y + 4).lineTo(LEFT + 7.5, y + 7).lineTo(LEFT + 11.5, y + 1).lineWidth(1).stroke();
    }
    doc.font('Helvetica').fontSize(10).text(label, LEFT + 18, y - 1, { width: WIDTH - 18 });
    doc.x = LEFT;
  }
}
