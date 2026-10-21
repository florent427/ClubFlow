import { TaxReceiptPdfService, type TaxReceiptPdfData } from './tax-receipt-pdf.service';

function receipt(claimCount: number): TaxReceiptPdfData {
  const claims = Array.from({ length: claimCount }, (_, i) => ({
    id: `c${i}`,
    title: `Note ${i + 1}`,
    meters: 120_000,
    amountCents: 7_632,
    firstDate: '2026-03-01',
    lastDate: '2026-03-28',
  }));
  return {
    number: '2026-0001',
    year: 2026,
    amountCents: claims.reduce((s, c) => s + c.amountCents, 0),
    issuedOn: new Date(Date.UTC(2027, 0, 15)),
    cancelled: false,
    snapshot: {
      donor: { firstName: 'Léa', lastName: 'Payet', addressLine: '12 rue des Lilas', postalCode: '97400', city: 'Saint-Denis' },
      club: {
        name: 'Club Démo',
        address: '1 allée du Stade\n97400 Saint-Denis',
        rnaNumber: 'W9R1234567',
        siret: null,
        purpose: 'Pratique et enseignement du karaté',
        organismType: 'GENERAL_INTEREST',
        signatoryName: 'Jean Hoarau',
        signatoryTitle: 'Président',
      },
      claims,
      firstDate: '2026-03-01',
      lastDate: '2026-03-28',
    },
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('reçu fiscal PDF', () => {
  it('tient sur une page pour un bénévole ordinaire', async () => {
    const pdf = await new TaxReceiptPdfService().build(receipt(3));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('pagine un détail long sans page blanche', async () => {
    const pdf = await new TaxReceiptPdfService().build(receipt(60));
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(pageCount(pdf)).toBeLessThanOrEqual(3);
  });
});
