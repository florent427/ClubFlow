import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import type { ShopStockService } from './shop-stock.service';
import { ShopService } from './shop.service';

/**
 * Vente au comptoir.
 *
 * Sans ce chemin, une vente faite au dojo n'entrait pas dans les livres : seul
 * le portail savait créer une commande, et « régler sur place » ne produit ni
 * facture ni écriture. Ce qui se joue ici tient à trois champs de la facture,
 * et chacun a une conséquence visible :
 *
 *  - `shopOrderId` : c'est LUI qui fait comptabiliser la recette en 708000
 *    plutôt qu'en 706100. Sans lui, un kimono passe en cotisations.
 *  - `lockedPaymentMethod` : figé sur la carte comme le fait le portail, il
 *    interdirait de saisir le chèque réellement reçu.
 *  - `familyId` : sans lui, la facture n'apparaît sous aucun payeur.
 *
 * Et l'acheteur est DÉSIGNÉ par l'admin, pas déduit d'un jeton : son
 * appartenance au club doit être vérifiée ici, `placeOrderInTx` ne contrôlant
 * que les articles.
 */

const CLUB = 'club-1';
const AUTRE_CLUB = 'club-2';

type InvoiceData = {
  clubId: string;
  familyId: string | null;
  label: string;
  amountCents: number;
  baseAmountCents: number;
  status: InvoiceStatus;
  shopOrderId: string;
  lockedPaymentMethod?: unknown;
  installmentsCount: number;
};

function makeHarness() {
  const invoices: InvoiceData[] = [];
  const orders: Array<Record<string, unknown>> = [];
  const reserved: Array<{ variantId: string; qty: number }> = [];

  const membres = [
    { id: 'm-1', clubId: CLUB, firstName: 'Camillah', lastName: 'ABDILLAH' },
    // Même identifiant côté client, autre club : c'est ce que le contrôle
    // d'appartenance doit refuser.
    { id: 'm-etranger', clubId: AUTRE_CLUB, firstName: 'Autre', lastName: 'Club' },
  ];
  const contacts = [
    { id: 'c-1', clubId: CLUB, firstName: 'Mevajoro', lastName: 'ECHA' },
  ];
  const familles = [
    { memberId: 'm-1', familyId: 'fam-1', clubId: CLUB },
    // Un foyer dans l'AUTRE club : sans lui, « ne pas le rattacher » serait
    // vrai par absence de candidat, et le test ne dirait rien.
    { memberId: 'm-etranger', familyId: 'fam-autre', clubId: AUTRE_CLUB },
  ];
  const variantes = [
    {
      id: 'v-120',
      clubId: CLUB,
      productId: 'p-1',
      priceCents: null as number | null,
      label: '120/130',
      active: true,
      product: { id: 'p-1', name: 'Adidas Evolution', priceCents: 2500, active: true },
    },
    {
      id: 'v-180',
      clubId: CLUB,
      productId: 'p-1',
      priceCents: 3000,
      label: '180/190',
      active: true,
      product: { id: 'p-1', name: 'Adidas Evolution', priceCents: 2500, active: true },
    },
  ];

  // Doubles écrits EN FACE des requêtes : Prisma n'applique QUE les clauses
  // présentes. Un double qui EXIGERAIT `clubId` serait plus strict que la
  // réalité : retirer le scope du service ferait alors tomber tous les tests,
  // y compris ceux qui n'ont rien à dire sur le cloisonnement — un faux
  // positif qui masque ce que la mutation démontre vraiment.
  //
  // Montés sur `prisma` ET sur `tx` : la garde d'appartenance s'exécute hors
  // transaction, le libellé de la facture dedans.
  const lookups = {
    member: {
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; clubId?: string } }) =>
          membres.find(
            (m) =>
              (where.id === undefined || m.id === where.id) &&
              (where.clubId === undefined || m.clubId === where.clubId),
          ) ?? null,
      ),
    },
    contact: {
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; clubId?: string } }) =>
          contacts.find(
            (c) =>
              (where.id === undefined || c.id === where.id) &&
              (where.clubId === undefined || c.clubId === where.clubId),
          ) ?? null,
      ),
    },
    familyMember: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { memberId?: string; family?: { clubId?: string } };
        }) =>
          familles.find(
            (f) =>
              (where.memberId === undefined || f.memberId === where.memberId) &&
              (where.family?.clubId === undefined ||
                f.clubId === where.family.clubId),
          ) ?? null,
      ),
    },
  };

  const tx = {
    ...lookups,
    shopProductVariant: {
      // Double écrit EN FACE de la requête : Prisma n'applique que les clauses
      // présentes, et toutes celles présentes.
      findMany: jest.fn(
        async ({ where }: { where: Record<string, any> }) =>
          variantes.filter(
            (v) =>
              (where.id?.in === undefined || where.id.in.includes(v.id)) &&
              (where.clubId === undefined || v.clubId === where.clubId) &&
              (where.active === undefined || v.active === where.active) &&
              (where.product?.active === undefined ||
                v.product.active === where.product.active),
          ),
      ),
    },
    shopOrder: {
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const lines = (data.lines?.create ?? []).map(
          (l: Record<string, unknown>, i: number) => ({
            id: `ol-${i}`,
            orderId: 'ord-1',
            ...l,
          }),
        );
        const row = { id: 'ord-1', ...data, lines };
        orders.push(row);
        return row;
      }),
    },
    invoice: {
      create: jest.fn(async ({ data }: { data: InvoiceData }) => {
        invoices.push(data);
        return { id: 'inv-1' };
      }),
    },
  };

  const prisma = {
    ...lookups,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const stock = {
    reserve: jest.fn(
      async (_tx: unknown, args: { variantId: string; qty: number }) => {
        reserved.push({ variantId: args.variantId, qty: args.qty });
      },
    ),
  } as unknown as ShopStockService;

  const svc = new ShopService(
    prisma as unknown as PrismaService,
    stock,
    {} as unknown as ShopPurchaseOrdersService,
  );

  return { svc, invoices, orders, reserved, tx };
}

describe('ShopService.recordCounterSale', () => {
  it('lie la facture à la commande — le champ qui la comptabilise en ventes', async () => {
    const h = makeHarness();

    const res = await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [{ variantId: 'v-120', quantity: 1 }],
    });

    expect(h.invoices).toHaveLength(1);
    expect(h.invoices[0].shopOrderId).toBe(res.orderId);
  });

  it('ne fige pas le mode de paiement : au comptoir on paie en chèque', async () => {
    const h = makeHarness();

    await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [{ variantId: 'v-120', quantity: 1 }],
    });

    // Ce qui compte est que le mode ne soit pas FIGÉ — absent ou null, peu
    // importe. Exiger `undefined` ferait tomber le test sur un changement
    // sans conséquence.
    expect(h.invoices[0].lockedPaymentMethod ?? null).toBeNull();
  });

  it('rattache la facture au foyer de l’acheteur', async () => {
    const h = makeHarness();

    await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [{ variantId: 'v-120', quantity: 1 }],
    });

    expect(h.invoices[0].familyId).toBe('fam-1');
    expect(h.invoices[0].label).toContain('Camillah ABDILLAH');
  });

  it('facture exactement le total de la commande, prix de déclinaison compris', async () => {
    const h = makeHarness();

    // v-120 hérite 25,00 € du produit ; v-180 surcharge à 30,00 €.
    const res = await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [
        { variantId: 'v-120', quantity: 2 },
        { variantId: 'v-180', quantity: 1 },
      ],
    });

    expect(res.totalCents).toBe(2500 * 2 + 3000);
    expect(h.invoices[0].amountCents).toBe(res.totalCents);
    expect(h.invoices[0].baseAmountCents).toBe(res.totalCents);
  });

  it('ouvre la facture, sans échéancier', async () => {
    const h = makeHarness();

    await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [{ variantId: 'v-120', quantity: 1 }],
    });

    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    expect(h.invoices[0].installmentsCount).toBe(1);
  });

  it('réserve le stock vendu', async () => {
    const h = makeHarness();

    await h.svc.recordCounterSale(CLUB, {
      memberId: 'm-1',
      lines: [{ variantId: 'v-120', quantity: 3 }],
    });

    expect(h.reserved).toEqual([{ variantId: 'v-120', qty: 3 }]);
  });

  it('refuse un adhérent qui n’est pas de ce club, sans rien facturer', async () => {
    const h = makeHarness();

    await expect(
      h.svc.recordCounterSale(CLUB, {
        memberId: 'm-etranger',
        lines: [{ variantId: 'v-120', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.invoices).toHaveLength(0);
    expect(h.orders).toHaveLength(0);
  });

  it('accepte un contact du club comme acheteur', async () => {
    const h = makeHarness();

    await h.svc.recordCounterSale(CLUB, {
      contactId: 'c-1',
      lines: [{ variantId: 'v-120', quantity: 1 }],
    });

    expect(h.invoices[0].label).toContain('Mevajoro ECHA');
    expect(h.orders[0].contactId).toBe('c-1');
  });

  /**
   * `createOrderInvoiceInTx` lit l'acheteur DANS la commande pour la nommer et
   * la rattacher à son foyer. Le scope de club y est une défense en
   * profondeur : `placeOrderInTx` ne vérifie pas l'acheteur, et sans ce
   * contrôle une facture pourrait porter le foyer d'un AUTRE club.
   */
  it('ne rattache pas le foyer d’un autre club, même si la commande le désigne', async () => {
    const h = makeHarness();

    await h.svc.createOrderInvoiceInTx(h.tx as never, CLUB, {
      id: 'ord-x',
      totalCents: 2500,
      memberId: 'm-etranger',
      contactId: null,
    });

    expect(h.invoices[0].familyId).toBeNull();
    expect(h.invoices[0].label).not.toContain('Autre Club');
  });

  it('refuse quand aucun acheteur n’est désigné', async () => {
    const h = makeHarness();

    await expect(
      h.svc.recordCounterSale(CLUB, {
        lines: [{ variantId: 'v-120', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.invoices).toHaveLength(0);
  });
});
