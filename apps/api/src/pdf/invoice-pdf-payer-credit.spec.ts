import { inflateSync } from 'zlib';
import { ClubPaymentMethod, InvoicePurpose, InvoiceStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { InvoicePdfService } from './invoice-pdf.service';

/**
 * Le reçu d'avance (ADR-0022) se lit : ce qui compte est le texte du PDF.
 * Lecture directe des flux de contenu, comme pour le bon de commande (cf.
 * shop-purchase-order-pdf.service.spec.ts, et pitfall pdf-parse-v2-conflict).
 */
function lire(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const runs: string[] = [];
  const streams = /stream\r?\n/g;
  let found: RegExpExecArray | null;
  while ((found = streams.exec(raw))) {
    const start = found.index + found[0].length;
    let end = raw.indexOf('endstream', start);
    if (raw[end - 1] === '\n') end -= 1;
    if (raw[end - 1] === '\r') end -= 1;
    let content: string;
    try {
      content = inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      content = raw.slice(start, end);
    }
    for (const block of content.match(/BT[\s\S]*?ET/g) ?? []) {
      const hex = [...block.matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join('');
      runs.push(new TextDecoder('windows-1252').decode(Buffer.from(hex, 'hex')));
    }
  }
  return runs.join(' ').replace(/\s+/g, ' ');
}

function document(purpose: InvoicePurpose) {
  const deposit = purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT;
  return {
    id: 'aaaabbbb-0000-0000-0000-000000000000',
    clubId: 'club-1',
    // Libellé sans le nom : il ne peut venir que de la personne créditée.
    label: deposit ? 'Avance au guichet' : 'Cotisation 2026',
    baseAmountCents: 5000,
    amountCents: 5000,
    status: InvoiceStatus.PAID,
    isCreditNote: false,
    creditNoteReason: null,
    purpose,
    dueAt: null,
    createdAt: new Date('2026-09-15T10:00:00Z'),
    club: {
      name: 'Dojo Test',
      address: '1 rue du Dojo',
      siret: null,
      contactPhone: null,
      contactEmail: 'tresorier@dojo.test',
      logoUrl: null,
      legalMentions: null,
    },
    lines: [],
    payments: [
      {
        createdAt: new Date('2026-09-15T10:00:00Z'),
        amountCents: 5000,
        method: ClubPaymentMethod.MANUAL_CASH,
        // Payeur non renseigné : le nom ne peut venir que de la personne créditée.
        paidByMember: null,
        paidByContact: null,
      },
    ],
    family: null,
    householdGroup: null,
    clubSeason: null,
    parentInvoice: null,
    payerCreditMember: deposit
      ? { firstName: 'Camille', lastName: 'Titulaire', email: 'camille@exemple.fr', phone: null }
      : null,
    payerCreditContact: null,
  };
}

function service(purpose: InvoicePurpose) {
  const prisma = {
    invoice: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; clubId: string } }) =>
        where.id === 'aaaabbbb-0000-0000-0000-000000000000' && where.clubId === 'club-1'
          ? document(purpose)
          : null,
      ),
    },
  };
  return new InvoicePdfService(prisma as unknown as PrismaService);
}

describe('InvoicePdfService — reçu d’avance', () => {
  it('s’intitule « Reçu d’avance », au nom de la personne, sans total à payer ni tampon', async () => {
    const texte = lire(
      await service(InvoicePurpose.PAYER_CREDIT_DEPOSIT).buildInvoicePdf(
        'club-1',
        'aaaabbbb-0000-0000-0000-000000000000',
      ),
    );

    expect(texte).toContain('REÇU D’AVANCE');
    expect(texte).toContain('Versé par');
    expect(texte).toContain('Camille Titulaire');
    expect(texte).toContain('crédit utilisable sur les prochaines factures du club');
    expect(texte).toContain('Montant versé');
    expect(texte).not.toContain('FACTURE');
    expect(texte).not.toContain('Total à payer');
    expect(texte).not.toContain('ACQUITTÉE');
  });

  it('une facture ordinaire payée garde son titre et son tampon', async () => {
    const texte = lire(
      await service(InvoicePurpose.CHARGE).buildInvoicePdf(
        'club-1',
        'aaaabbbb-0000-0000-0000-000000000000',
      ),
    );

    // Témoin : sans lui, un lecteur aveugle au tampon rendrait le premier test
    // vert pour une mauvaise raison.
    expect(texte).toContain('FACTURE');
    expect(texte).toContain('ACQUITTÉE');
    expect(texte).not.toContain('REÇU D’AVANCE');
  });
});
