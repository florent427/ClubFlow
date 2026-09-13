import sharp from 'sharp';
import {
  ShopDeliveryNotePdfService,
  type ShopDeliveryNoteData,
} from './shop-delivery-note-pdf.service';

/**
 * Le bon de livraison doit SORTIR, quoi que contienne la signature enregistrée.
 *
 * Constaté en écrivant ce test : un PNG corrompu passé tel quel à pdfkit ne lève
 * rien — pdfkit le décode de façon asynchrone, le document ne se termine jamais
 * et la génération reste pendue. D'où les deux cas ci-dessous : une vraie image
 * est dessinée, une image abîmée est signalée, et dans les deux cas le PDF sort.
 */

let signature: Buffer;

beforeAll(async () => {
  // Une VRAIE image, produite par sharp — une image « tapée de mémoire » en
  // base64 s'est révélée corrompue, et c'est elle qui a fait trouver le défaut.
  signature = await sharp({
    create: {
      width: 120,
      height: 48,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
});

const DATA = (over: Partial<ShopDeliveryNoteData> = {}): ShopDeliveryNoteData => ({
  club: {
    name: 'Dojo Test',
    siret: '123 456 789 00012',
    address: '1 rue du Dojo, 97410 Saint-Pierre',
  },
  order: {
    reference: 'CMD-ABCDEF12',
    createdAt: new Date('2026-09-12T10:00:00Z'),
    totalCents: 2500,
    paid: false,
    paidAt: null,
    lines: [{ quantity: 1, label: 'Adidas Evolution — 120/130', unitPriceCents: 2500 }],
  },
  buyerName: 'Camillah ABDILLAH',
  delivery: {
    deliveredAt: new Date('2026-09-13T15:00:00Z'),
    signerName: 'Maman de Camillah',
    signaturePng: signature,
  },
  terms: { fileName: 'cgv.pdf', acceptedAt: new Date('2026-09-13T15:00:00Z') },
  ...over,
});

/** Objets page du PDF (`/Type /Page`, pas `/Type /Pages`) : non compressés. */
const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

/** Une image embarquée apparaît comme XObject, dictionnaire non compressé. */
const embedsImage = (pdf: Buffer) =>
  pdf.toString('latin1').includes('/Subtype /Image');

describe('ShopDeliveryNotePdfService', () => {
  it('produit un PDF d’une seule page, signature dessinée', async () => {
    const pdf = await new ShopDeliveryNotePdfService().build(DATA());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(true);
  });

  it('une signature corrompue n’empêche pas le bon de sortir', async () => {
    // Un vrai PNG dont on abîme les données compressées : l'en-tête reste
    // valide, c'est exactement le cas qui faisait pendre pdfkit.
    const abimee = Buffer.from(signature);
    for (let i = 40; i < abimee.length - 12; i += 1) abimee[i] = 0xff - abimee[i];

    const pdf = await new ShopDeliveryNotePdfService().build(
      DATA({
        delivery: {
          deliveredAt: new Date('2026-09-13T15:00:00Z'),
          signerName: 'X',
          signaturePng: abimee,
        },
      }),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(false);
  });

  it('un contenu qui n’est pas une image non plus', async () => {
    const pdf = await new ShopDeliveryNotePdfService().build(
      DATA({
        delivery: {
          deliveredAt: new Date('2026-09-13T15:00:00Z'),
          signerName: 'X',
          signaturePng: Buffer.from('pas une image'),
        },
      }),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(false);
  });

  it('beaucoup d’articles : la suite passe sur une page, sans page blanche', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      quantity: 1,
      label: `Article ${i + 1}`,
      unitPriceCents: 1000,
    }));
    const base = DATA();

    const pdf = await new ShopDeliveryNotePdfService().build(
      DATA({ order: { ...base.order, lines, totalCents: 40_000 } }),
    );

    expect(pageCount(pdf)).toBe(2);
  });
});
