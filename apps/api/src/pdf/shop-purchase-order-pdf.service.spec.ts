import { inflateSync } from 'zlib';
import {
  ShopPurchaseOrderPdfService,
  type ShopPurchaseOrderPdfData,
} from './shop-purchase-order-pdf.service';

/**
 * Le bon de commande part chez un fournisseur : ce qui compte est ce qu'il y
 * LIT. Les assertions portent donc sur le texte du PDF.
 *
 * Pas de lecteur PDF pour l'extraire : celui de `pdf-parse` 1.1.1 (pdf.js 1.10)
 * refuse certains fichiers VALIDES — « bad XRef entry » selon la disposition
 * des octets, constaté le 2026-09-14 sur un simple titre en gras, table xref
 * de pdfkit vérifiée exacte entrée par entrée. On lit donc directement les flux
 * de contenu : décompressés, puis les chaînes des opérateurs de texte décodées
 * en WinAnsi, l'encodage des polices standard du PDF.
 */
function lire(pdf: Buffer): { text: string; pages: number } {
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
  return {
    text: runs.join(' ').replace(/[\s\u00a0\u202f]+/g, ' '),
    // Objets page (`/Type /Page`, pas `/Type /Pages`) : non compressés.
    pages: (raw.match(/\/Type \/Page\b(?!s)/g) ?? []).length,
  };
}

function data(
  order: Partial<ShopPurchaseOrderPdfData['order']> = {},
): ShopPurchaseOrderPdfData {
  return {
    club: {
      name: 'Dojo Test',
      siret: '123 456 789 00012',
      address: '1 rue du Dojo\n97410 Saint-Pierre',
      contactEmail: 'tresorier@dojo.test',
      contactPhone: '0262 00 00 00',
    },
    supplier: {
      name: 'Textiles Pro',
      contactName: 'Mme Martin',
      email: 'commandes@textiles.test',
      phone: null,
      accountRef: 'CLI-0042',
    },
    order: {
      reference: 'CF-2026-004',
      orderedAt: new Date('2026-09-14T10:00:00Z'),
      expectedAt: new Date('2026-09-21T10:00:00Z'),
      notes: 'Livraison au dojo, entrée côté parking.',
      lines: [
        { supplierRef: 'TP-SW-01', label: 'Sweat — M', quantity: 20, unitCostCents: 1500 },
        { supplierRef: null, label: 'Casquette', quantity: 10, unitCostCents: 0 },
      ],
      ...order,
    },
  };
}

describe('ShopPurchaseOrderPdfService — ce que le fournisseur lit', () => {
  const service = new ShopPurchaseOrderPdfService();

  it('le club, le fournisseur, la commande et ses lignes, sur une page', async () => {
    const pdf = await service.build(data());
    const { text, pages } = lire(pdf);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pages).toBe(1);
    for (const attendu of [
      'Dojo Test',
      'SIRET 123 456 789 00012',
      '97410 Saint-Pierre',
      'Contact : tresorier@dojo.test · 0262 00 00 00',
      'Référence CF-2026-004',
      'Commande du 14/09/2026',
      'Livraison souhaitée le 21/09/2026',
      'Fournisseur : Textiles Pro',
      'À l’attention de Mme Martin',
      'commandes@textiles.test',
      'Notre numéro client : CLI-0042',
      'TP-SW-01 Sweat — M 20 15,00 € 300,00 €',
      'Livraison au dojo, entrée côté parking.',
      'Dojo Test — bon de commande CF-2026-004',
    ]) {
      expect(text).toContain(attendu);
    }
    expect(text).not.toContain('brouillon');
  });

  it('un prix non renseigné se lit « à confirmer », jamais 0 €, et sort du total', async () => {
    const { text } = lire(await service.build(data()));

    expect(text).toContain('— Casquette 10 à confirmer —');
    expect(text).toContain('Total HT, hors prix à confirmer 300,00 €');
    expect(text).not.toMatch(/(^|[^\d ])0,00 €/);
  });

  it('sans prix inconnu, le total se dit sans réserve, milliers lisibles', async () => {
    const { text } = lire(
      await service.build(
        data({ lines: [{ supplierRef: 'TP-SW-01', label: 'Sweat — M', quantity: 2, unitCostCents: 125_000 }] }),
      ),
    );

    expect(text).not.toContain('à confirmer');
    // L'espace fine d'Intl entre les milliers devient une espace imprimable.
    expect(text).toContain('Sweat — M 2 1 250,00 € 2 500,00 €');
    expect(text).toContain('Total HT 2 500,00 €');
  });

  it('un brouillon le dit, sans date de commande', async () => {
    const { text } = lire(await service.build(data({ orderedAt: null })));

    expect(text).toContain('Bon de commande — brouillon');
    expect(text).toContain('Pas encore envoyée au fournisseur');
    expect(text).not.toContain('Commande du');
  });

  it('une longue commande passe à la page suivante sans perdre une ligne', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({
      supplierRef: `REF-${i + 1}`,
      label: `Article n°${i + 1}`,
      quantity: 1,
      unitCostCents: 100,
    }));
    const { text, pages } = lire(await service.build(data({ lines })));

    expect(pages).toBeGreaterThanOrEqual(2);
    expect(text).toContain('REF-1 Article n°1 1 1,00 €');
    expect(text).toContain('REF-60 Article n°60 1 1,00 €');
    // L'en-tête du tableau se répète sur chaque page.
    expect(text.split('Désignation').length - 1).toBe(pages);
    expect(text).toContain('Total HT 60,00 €');
  });
});
