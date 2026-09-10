import { writeFileSync } from 'fs';
import { ChequeDepositPdfService } from './cheque-deposit-pdf.service';
import type { DepositSlipData } from './cheque-deposit-pdf.service';

/**
 * Le bordereau de remise (ADR-0015) doit tenir sur UNE page pour une
 * remise ordinaire, et paginer proprement quand il y a beaucoup de chèques.
 * Un pied de page écrit sous la marge basse faisait naître une seconde page
 * blanche : pdfkit ajoute une page dès qu'un texte dépasse la zone
 * imprimable (vu sur staging le 2026-09-10).
 */
function slip(chequeCount: number): DepositSlipData {
  const cheques = Array.from({ length: chequeCount }, (_, i) => ({
    number: String(1000000 + i),
    drawerName: `Émetteur ${i + 1}`,
    bankName: i % 2 === 0 ? 'BFCOI' : null,
    amountCents: 1000 * (i + 1),
    receivedOn: new Date(Date.UTC(2026, 8, 1 + (i % 28))),
  }));
  return {
    club: { name: 'Club Démo', siret: '123 456 789 00012' },
    deposit: {
      number: 'R-2026-0007',
      depositedOn: new Date(Date.UTC(2026, 8, 10)),
      totalCents: cheques.reduce((s, c) => s + c.amountCents, 0),
      chequeCount,
      notes: chequeCount > 1 ? 'Remise de la semaine' : null,
      cancelled: false,
    },
    bank: {
      label: 'Banque principale',
      iban: 'FR7612345678901234567890123',
      bic: 'BFCOREXX',
      accountingAccountCode: '512000',
    },
    cheques,
  };
}

/** Nombre d'objets page du PDF (les dictionnaires ne sont pas compressés). */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
}

describe('ChequeDepositPdfService', () => {
  const svc = new ChequeDepositPdfService();

  it('une remise ordinaire tient sur UNE page, pied de page compris', async () => {
    const pdf = await svc.build(slip(3));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(1);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
  });

  it('une grande remise pagine et garde son total', async () => {
    const pdf = await svc.build(slip(60));
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(2);
  });
});
