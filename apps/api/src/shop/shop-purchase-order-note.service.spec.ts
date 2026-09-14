import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShopPurchaseOrderStatus } from '@prisma/client';
import type { TransactionalMailService } from '../mail/transactional-mail.service';
import type {
  ShopPurchaseOrderPdfData,
  ShopPurchaseOrderPdfService,
} from '../pdf/shop-purchase-order-pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ShopPurchaseOrderSendMode } from './dto/send-shop-purchase-order.input';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopPurchaseOrderNoteService } from './shop-purchase-order-note.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';

/**
 * Le bon de commande part APRÈS la transition (ADR-0021 §5) : l'encours est une
 * garantie, l'e-mail un accessoire (cf. pitfalls/garantie-derriere-effet-de-bord.md).
 * Chaque échec possible est FORCÉ — adresse absente, relais qui refuse, preuve
 * qui ne s'écrit pas — et l'on regarde ce qui reste.
 *
 * Le double de Prisma applique exactement le `where` et la `select` du service
 * et lève sur ce qu'il ne sait pas lire (cf.
 * pitfalls/double-ignore-une-clause-du-where.md).
 */

const CLUB = 'club-1';
const { DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED } = ShopPurchaseOrderStatus;

type Row = Record<string, any>;
type OrderRow = {
  id: string;
  clubId: string;
  supplierId: string;
  reference: string;
  status: ShopPurchaseOrderStatus;
  orderedAt: Date | null;
  expectedAt: Date | null;
  notes: string | null;
  emailedAt: Date | null;
  emailedTo: string | null;
};

function commande(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'po-1',
    clubId: CLUB,
    supplierId: 'sup-1',
    reference: 'CF-2026-004',
    status: DRAFT,
    orderedAt: null,
    expectedAt: new Date('2026-09-21T10:00:00Z'),
    notes: null,
    emailedAt: null,
    emailedTo: null,
    ...over,
  };
}

/** Égalité et `in`, clause par clause ; toute autre forme lève. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, clause]) => {
    if (!(key in row)) throw new Error(`Clause non simulée : ${key}`);
    if (clause !== null && typeof clause === 'object' && !(clause instanceof Date)) {
      if (Object.keys(clause).join() !== 'in') throw new Error(`Opérateur non simulé : ${key}`);
      return (clause.in as unknown[]).includes(row[key]);
    }
    return row[key] === clause;
  });
}

/** La `select` telle que Prisma la rendrait ; une relation inconnue lève. */
function pick(row: Row, select: Row, relations: Record<string, (row: Row, arg: Row) => unknown> = {}): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      if (!(key in row)) throw new Error(`Champ non simulé : ${key}`);
      out[key] = row[key];
    } else if (relations[key]) {
      out[key] = relations[key](row, value as Row);
    } else {
      throw new Error(`Relation non simulée : ${key}`);
    }
  }
  return out;
}

function onlyKeys(arg: Row, allowed: string[]) {
  for (const key of Object.keys(arg)) {
    if (!allowed.includes(key)) throw new Error(`Argument non simulé : ${key}`);
  }
}

function makeWorld(seed: { orders?: OrderRow[]; supplierEmail?: string | null } = {}) {
  const clubs = [
    { id: CLUB, name: 'Dojo Test', siret: '123 456 789 00012', address: '1 rue du Dojo', contactEmail: 'tresorier@dojo.test', contactPhone: null },
    { id: 'club-2', name: 'Autre club', siret: null, address: null, contactEmail: null, contactPhone: null },
  ];
  const suppliers = [
    {
      id: 'sup-1',
      clubId: CLUB,
      name: 'Textiles Pro',
      contactName: null,
      email: seed.supplierEmail === undefined ? 'commandes@textiles.test' : seed.supplierEmail,
      phone: null,
      accountRef: 'CLI-42',
    },
    { id: 'sup-2', clubId: CLUB, name: 'Sport Import', contactName: null, email: 'ventes@sport.test', phone: null, accountRef: null },
  ];
  const products = [
    { id: 'p-1', name: 'Sweat' },
    { id: 'p-2', name: 'Casquette' },
  ];
  const variants = [
    { id: 'v-m', productId: 'p-1', label: 'M' },
    { id: 'v-xxl', productId: 'p-1', label: 'XXL' },
    { id: 'v-cap', productId: 'p-2', label: null },
  ];
  const orders = seed.orders ?? [commande()];
  const lines = [
    { id: 'l-3', clubId: CLUB, orderId: 'po-1', variantId: 'v-cap', orderedQty: 10, unitCostCents: 0, createdAt: new Date('2026-09-14T10:02:00Z') },
    { id: 'l-1', clubId: CLUB, orderId: 'po-1', variantId: 'v-m', orderedQty: 20, unitCostCents: 1500, createdAt: new Date('2026-09-14T10:00:00Z') },
    { id: 'l-2', clubId: CLUB, orderId: 'po-1', variantId: 'v-xxl', orderedQty: 5, unitCostCents: 1700, createdAt: new Date('2026-09-14T10:01:00Z') },
  ];
  const offers = [
    { id: 'off-1', clubId: CLUB, productId: 'p-1', supplierId: 'sup-1', supplierRef: 'TP-SW', unitCostCents: 1500 },
    // Le même produit chez un AUTRE fournisseur : sa référence ne sort jamais.
    { id: 'off-2', clubId: CLUB, productId: 'p-1', supplierId: 'sup-2', supplierRef: 'SI-SW', unitCostCents: 1800 },
    { id: 'off-3', clubId: CLUB, productId: 'p-2', supplierId: 'sup-2', supplierRef: 'SI-CAP', unitCostCents: null },
    // Même fournisseur, même produit, AUTRE club : impossible en base, exclu par `clubId`.
    { id: 'off-9', clubId: 'club-2', productId: 'p-2', supplierId: 'sup-1', supplierRef: 'AUTRE-CLUB', unitCostCents: 1 },
  ];
  const overrides = [
    { id: 'ovr-1', clubId: CLUB, offerId: 'off-1', variantId: 'v-xxl', supplierRef: 'TP-SW-XXL', unitCostCents: 1700 },
    { id: 'ovr-2', clubId: CLUB, offerId: 'off-2', variantId: 'v-m', supplierRef: 'SI-SW-M', unitCostCents: 1800 },
  ];

  const orderRelations = {
    club: (o: Row, arg: Row) => {
      onlyKeys(arg, ['select']);
      return pick(clubs.find((c) => c.id === o.clubId)!, arg.select);
    },
    supplier: (o: Row, arg: Row) => {
      onlyKeys(arg, ['select']);
      return pick(suppliers.find((s) => s.id === o.supplierId)!, arg.select);
    },
    lines: (o: Row, arg: Row) => {
      onlyKeys(arg, ['orderBy', 'select']);
      const own = lines.filter((l) => l.orderId === o.id);
      if (arg.orderBy) {
        if (JSON.stringify(arg.orderBy) !== '{"createdAt":"asc"}') throw new Error('Tri non simulé');
        own.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return own.map((l) =>
        pick(l, arg.select, {
          variant: (line: Row, varg: Row) => {
            onlyKeys(varg, ['select']);
            return pick(variants.find((v) => v.id === line.variantId)!, varg.select, {
              product: (v: Row, parg: Row) => {
                onlyKeys(parg, ['select']);
                return pick(products.find((p) => p.id === v.productId)!, parg.select);
              },
            });
          },
        }),
      );
    },
  };

  const prisma = {
    shopPurchaseOrder: {
      findFirst: jest.fn(async (args: Row) => {
        onlyKeys(args, ['where', 'select']);
        const row = orders.find((o) => matches(o, args.where));
        return row ? pick(row, args.select, orderRelations) : null;
      }),
      updateMany: jest.fn(async (args: Row) => {
        onlyKeys(args, ['where', 'data']);
        const hits = orders.filter((o) => matches(o, args.where));
        hits.forEach((o) => Object.assign(o, args.data));
        return { count: hits.length };
      }),
    },
    shopProductSupplier: {
      findMany: jest.fn(async (args: Row) => {
        onlyKeys(args, ['where', 'select']);
        return offers
          .filter((o) => matches(o, args.where))
          .map((o) =>
            pick(o, args.select, {
              variantOverrides: (offer: Row, varg: Row) => {
                onlyKeys(varg, ['where', 'select']);
                return overrides
                  .filter((x) => x.offerId === offer.id && matches(x, varg.where ?? {}))
                  .map((x) => pick(x, varg.select));
              },
            }),
          );
      }),
    },
  };

  const purchases = {
    sendOrder: jest.fn(async (clubId: string, orderId: string) => {
      const o = orders.find((x) => x.id === orderId && x.clubId === clubId);
      if (!o) throw new NotFoundException('Commande fournisseur introuvable.');
      if (o.status !== DRAFT) {
        throw new BadRequestException('Impossible d’envoyer cette commande : elle est déjà envoyée.');
      }
      o.status = ORDERED;
      o.orderedAt = new Date();
      return { ...o };
    }),
    getOrder: jest.fn(async (clubId: string, orderId: string) => {
      const o = orders.find((x) => x.id === orderId && x.clubId === clubId);
      if (!o) throw new NotFoundException('Commande fournisseur introuvable.');
      return { ...o };
    }),
  };

  const sent: Array<{ clubId: string; to: string; options: Row; statusAtSend: ShopPurchaseOrderStatus }> = [];
  const mail = {
    sendShopPurchaseOrder: jest.fn(async (clubId: string, to: string, options: Row) => {
      sent.push({ clubId, to, options, statusAtSend: orders[0].status });
    }),
  };
  const built: ShopPurchaseOrderPdfData[] = [];
  const pdf = {
    build: jest.fn(async (doc: ShopPurchaseOrderPdfData) => {
      built.push(doc);
      return Buffer.from('%PDF-bon');
    }),
  };
  const links = new ShopDeliveryNoteLinkService();
  const svc = new ShopPurchaseOrderNoteService(
    prisma as unknown as PrismaService,
    purchases as unknown as ShopPurchaseOrdersService,
    pdf as unknown as ShopPurchaseOrderPdfService,
    mail as unknown as TransactionalMailService,
    links,
  );
  return { svc, orders, sent, built, prisma, purchases, mail, links };
}

describe('document — ce que le bon de commande imprime', () => {
  it('les références chez LE fournisseur de la commande, exception comprise, aux prix de la commande', async () => {
    const w = makeWorld();

    const doc = await w.svc.document(CLUB, 'po-1');

    expect(doc?.club).toEqual({
      name: 'Dojo Test',
      siret: '123 456 789 00012',
      address: '1 rue du Dojo',
      contactEmail: 'tresorier@dojo.test',
      contactPhone: null,
    });
    expect(doc?.supplier).toEqual({
      name: 'Textiles Pro',
      contactName: null,
      email: 'commandes@textiles.test',
      phone: null,
      accountRef: 'CLI-42',
    });
    expect(doc?.order).toMatchObject({ reference: 'CF-2026-004', orderedAt: null });
    expect(doc?.order.lines).toEqual([
      { supplierRef: 'TP-SW', label: 'Sweat — M', quantity: 20, unitCostCents: 1500 },
      { supplierRef: 'TP-SW-XXL', label: 'Sweat — XXL', quantity: 5, unitCostCents: 1700 },
      // La casquette ne se fournit que chez Sport Import : aucune référence ici.
      { supplierRef: null, label: 'Casquette', quantity: 10, unitCostCents: 0 },
    ]);
  });

  it('la commande d’un autre club n’existe pas, ni pour le bon ni pour son lien', async () => {
    const w = makeWorld({ orders: [commande({ clubId: 'club-2' })] });

    expect(await w.svc.document(CLUB, 'po-1')).toBeNull();
    await expect(w.svc.link(CLUB, 'po-1')).rejects.toThrow(NotFoundException);
  });

  it('le lien ouvre le bon de CETTE commande, pour CE club', async () => {
    const w = makeWorld();

    const url = new URL(await w.svc.link(CLUB, 'po-1'));

    expect(url.pathname).toBe('/shop/purchase-orders/po-1/purchase-order/signed.pdf');
    expect(
      w.links.verifyPurchaseOrder(
        url.searchParams.get('club') ?? undefined,
        'po-1',
        url.searchParams.get('exp') ?? undefined,
        url.searchParams.get('sig') ?? undefined,
      ),
    ).toBe(true);
  });
});

describe('send — EMAIL : la transition, PUIS le bon de commande', () => {
  it('le bon part chez le fournisseur une fois la commande envoyée, et la preuve suit', async () => {
    const w = makeWorld();

    const res = await w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL);

    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toMatchObject({ clubId: CLUB, to: 'commandes@textiles.test', statusAtSend: ORDERED });
    expect(w.sent[0].options).toMatchObject({
      clubName: 'Dojo Test',
      clubContactEmail: 'tresorier@dojo.test',
      orderReference: 'CF-2026-004',
      expectedAt: new Date('2026-09-21T10:00:00Z'),
    });
    expect((w.sent[0].options.pdf as Buffer).toString()).toBe('%PDF-bon');
    // Le bon imprimé porte la date d'envoi : il est produit après la transition.
    expect(w.built[0].order.orderedAt).toBeInstanceOf(Date);
    expect(res.emailError).toBeNull();
    expect(res.order).toMatchObject({ status: ORDERED, emailedTo: 'commandes@textiles.test' });
    expect(res.order.emailedAt).toBeInstanceOf(Date);
  });

  it('un relais qui refuse : la commande reste envoyée, sans preuve, et l’écran reçoit le message', async () => {
    const w = makeWorld();
    w.mail.sendShopPurchaseOrder.mockRejectedValueOnce(new Error('550 boîte inconnue'));

    const res = await w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL);

    expect(res.order.status).toBe(ORDERED);
    expect(res.order.emailedAt).toBeNull();
    expect(res.order.emailedTo).toBeNull();
    expect(res.emailError).toBe('Le bon de commande n’est pas parti : 550 boîte inconnue');
  });

  it('une preuve qui ne s’écrit pas : l’écran apprend que le bon est parti quand même', async () => {
    const w = makeWorld();
    w.prisma.shopPurchaseOrder.updateMany.mockRejectedValueOnce(new Error('connexion perdue'));

    const res = await w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL);

    expect(w.sent).toHaveLength(1);
    expect(res.order.status).toBe(ORDERED);
    expect(res.order.emailedAt).toBeNull();
    expect(res.emailError).toBe(
      'Le bon de commande est parti chez commandes@textiles.test, mais la date d’envoi n’a pas pu être enregistrée : connexion perdue',
    );
  });

  it('un fournisseur sans adresse valide : refus AVANT la transition, rien ne part', async () => {
    for (const email of [null, '   ', 'commandes@textiles']) {
      const w = makeWorld({ supplierEmail: email });

      await expect(w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL)).rejects.toThrow(
        'n’a pas d’adresse e-mail valide',
      );
      expect(w.orders[0].status).toBe(DRAFT);
      expect(w.purchases.sendOrder).not.toHaveBeenCalled();
      expect(w.sent).toHaveLength(0);
    }
  });

  it('l’adresse part nettoyée de ses blancs', async () => {
    const w = makeWorld({ supplierEmail: '  commandes@textiles.test ' });

    const res = await w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL);

    expect(w.sent[0].to).toBe('commandes@textiles.test');
    expect(res.order.emailedTo).toBe('commandes@textiles.test');
  });

  it('une transition refusée n’envoie rien', async () => {
    const w = makeWorld({ orders: [commande({ status: ORDERED, orderedAt: new Date() })] });

    await expect(w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL)).rejects.toThrow(
      BadRequestException,
    );
    expect(w.sent).toHaveLength(0);
    expect(w.orders[0].emailedAt).toBeNull();
  });

  it('la commande d’un autre club : introuvable, rien ne transite', async () => {
    const w = makeWorld({ orders: [commande({ clubId: 'club-2' })] });

    await expect(w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.EMAIL)).rejects.toThrow(
      NotFoundException,
    );
    expect(w.purchases.sendOrder).not.toHaveBeenCalled();
  });
});

describe('send — MARK_ONLY : la transition seule', () => {
  it('commande envoyée, sans e-mail ni preuve, même chez un fournisseur sans adresse', async () => {
    const w = makeWorld({ supplierEmail: null });

    const res = await w.svc.send(CLUB, 'po-1', ShopPurchaseOrderSendMode.MARK_ONLY);

    expect(res.order.status).toBe(ORDERED);
    expect(res.order.emailedAt).toBeNull();
    expect(res.emailError).toBeNull();
    expect(w.sent).toHaveLength(0);
  });
});

describe('resend — renvoyer le bon d’une commande partie', () => {
  const avant = new Date('2026-09-10T08:00:00Z');

  it('commande envoyée ou partiellement reçue : le bon repart, la preuve est mise à jour', async () => {
    for (const status of [ORDERED, PARTIALLY_RECEIVED]) {
      const w = makeWorld({
        orders: [commande({ status, orderedAt: avant, emailedAt: avant, emailedTo: 'ancien@textiles.test' })],
      });

      const order = await w.svc.resend(CLUB, 'po-1');

      expect(w.sent.map((s) => s.to)).toEqual(['commandes@textiles.test']);
      expect(order.emailedTo).toBe('commandes@textiles.test');
      expect(order.emailedAt!.getTime()).toBeGreaterThan(avant.getTime());
    }
  });

  it('un brouillon, une commande reçue ou annulée ne se renvoient pas', async () => {
    for (const status of [DRAFT, RECEIVED, CANCELLED]) {
      const w = makeWorld({ orders: [commande({ status })] });

      await expect(w.svc.resend(CLUB, 'po-1')).rejects.toThrow('se renvoie au fournisseur');
      expect(w.sent).toHaveLength(0);
    }
  });

  it('un échec d’envoi lève, et la preuve précédente reste telle quelle', async () => {
    const w = makeWorld({
      orders: [commande({ status: ORDERED, orderedAt: avant, emailedAt: avant, emailedTo: 'ancien@textiles.test' })],
    });
    w.mail.sendShopPurchaseOrder.mockRejectedValueOnce(new Error('relais indisponible'));

    await expect(w.svc.resend(CLUB, 'po-1')).rejects.toThrow(
      'Le bon de commande n’est pas parti : relais indisponible',
    );
    expect(w.orders[0].emailedAt).toBe(avant);
    expect(w.orders[0].emailedTo).toBe('ancien@textiles.test');
  });

  it('un fournisseur sans adresse valide est refusé, sans rien envoyer', async () => {
    const w = makeWorld({ orders: [commande({ status: ORDERED, orderedAt: avant })], supplierEmail: null });

    await expect(w.svc.resend(CLUB, 'po-1')).rejects.toThrow('n’a pas d’adresse e-mail valide');
    expect(w.sent).toHaveLength(0);
  });

  it('la commande d’un autre club : introuvable', async () => {
    const w = makeWorld({ orders: [commande({ clubId: 'club-2', status: ORDERED })] });

    await expect(w.svc.resend(CLUB, 'po-1')).rejects.toThrow(NotFoundException);
    expect(w.sent).toHaveLength(0);
  });
});
