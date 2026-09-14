import sharp from 'sharp';
import {
  ShopExchangeNotePdfService,
  type ShopExchangeNoteData,
} from './shop-exchange-note-pdf.service';

/**
 * Le bon d'échange (ADR-0020) doit SORTIR, quoi que contienne la signature
 * enregistrée — même précaution que le bon de livraison, dont pdfkit restait
 * pendu sur un PNG corrompu —, et dire en une phrase ce que la différence est
 * devenue.
 */

let signature: Buffer;

beforeAll(async () => {
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

const DATA = (
  exchange: Partial<ShopExchangeNoteData['exchange']> = {},
  over: Partial<ShopExchangeNoteData> = {},
): ShopExchangeNoteData => ({
  club: {
    name: 'Dojo Test',
    siret: '123 456 789 00012',
    address: '1 rue du Dojo, 97410 Saint-Pierre',
  },
  order: { reference: 'CMD-ABCDEF12', createdAt: new Date('2026-09-12T10:00:00Z') },
  exchange: {
    reference: 'ECH-12345678',
    at: new Date('2026-09-14T15:00:00Z'),
    reason: 'Taille trop petite',
    returned: { quantity: 1, label: 'Adidas Evolution — 120/130', unitPriceCents: 2500 },
    taken: { quantity: 1, label: 'Adidas Evolution — 140/150', unitPriceCents: 4000 },
    differenceCents: 1500,
    refundedCents: 0,
    writtenOffCents: 0,
    ...exchange,
  },
  buyerName: 'Camillah ABDILLAH',
  signature: { signerName: 'Maman de Camillah', signaturePng: signature },
  ...over,
});

/** Objets page du PDF (`/Type /Page`, pas `/Type /Pages`) : non compressés. */
const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

/** Une image embarquée apparaît comme XObject, dictionnaire non compressé. */
const embedsImage = (pdf: Buffer) =>
  pdf.toString('latin1').includes('/Subtype /Image');

const euro = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );

describe('ShopExchangeNotePdfService.build', () => {
  it('produit un PDF d’une seule page, signature dessinée', async () => {
    const pdf = await new ShopExchangeNotePdfService().build(DATA());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(true);
  });

  it('une signature corrompue n’empêche pas le bon de sortir', async () => {
    const abimee = Buffer.from(signature);
    for (let i = 40; i < abimee.length - 12; i += 1) abimee[i] = 0xff - abimee[i];

    const pdf = await new ShopExchangeNotePdfService().build(
      DATA({}, { signature: { signerName: 'X', signaturePng: abimee } }),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(false);
  });

  it('un contenu qui n’est pas une image non plus', async () => {
    const pdf = await new ShopExchangeNotePdfService().build(
      DATA({}, { signature: { signerName: '', signaturePng: Buffer.from('pas une image') } }),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(embedsImage(pdf)).toBe(false);
  });
});

describe('ShopExchangeNotePdfService.moneySentence', () => {
  const phrase = (exchange: Partial<ShopExchangeNoteData['exchange']>) =>
    new ShopExchangeNotePdfService().moneySentence(DATA(exchange));

  it('article plus cher : le reste à payer, facturé à part', () => {
    expect(phrase({ differenceCents: 1500 })).toBe(
      `Reste à payer : ${euro(1500)}, facturé à part.`,
    );
  });

  it('même prix : aucune différence', () => {
    expect(phrase({ differenceCents: 0 })).toBe('Échange sans différence de prix.');
  });

  it('article moins cher : ce qui est rendu et ce qui est retiré du reste à payer', () => {
    expect(
      phrase({ differenceCents: -1200, refundedCents: 700, writtenOffCents: 500 }),
    ).toBe(
      `En faveur de l’adhérent : ${euro(1200)} (${euro(700)} rendus, ${euro(500)} retirés du reste à payer).`,
    );
    expect(phrase({ differenceCents: -1200, refundedCents: 1200 })).toBe(
      `En faveur de l’adhérent : ${euro(1200)} (${euro(1200)} rendus).`,
    );
    expect(phrase({ differenceCents: -1200 })).toBe(
      `En faveur de l’adhérent : ${euro(1200)}.`,
    );
  });
});
