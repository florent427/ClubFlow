import { ShopStockSweepService } from './shop-stock-sweep.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import type { ShopLowStockNotifierService } from './shop-low-stock-notifier.service';

/**
 * Le balayage des seuils — ADR-0012 §7.
 *
 * Comme pour le moteur de stock, le double SIMULE PostgreSQL : `updateMany`
 * n'écrit que sur les lignes satisfaisant TOUTES les conditions et renvoie le
 * `count` réel. C'est indispensable ici — l'anti-spam n'existe QUE dans le
 * prédicat `lowStockAlertedAt: null`. Un double qui laisserait seulement
 * inspecter la forme du `where` resterait vert alors même que le filtre ne
 * mord sur rien (cf. pitfalls/test-verifie-la-forme-pas-le-comportement.md).
 */

type VariantRow = {
  id: string;
  clubId: string;
  productId: string;
  label: string | null;
  sku: string | null;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  reorderThreshold: number | null;
  reorderTargetQty: number | null;
  lowStockAlertedAt: Date | null;
  productName: string;
  productActive: boolean;
};

const VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: 'club-1',
  productId: 'p-1',
  label: 'L / Rouge',
  sku: 'TS-L-R',
  active: true,
  trackStock: true,
  onHand: 2,
  available: 2,
  reorderThreshold: 5,
  reorderTargetQty: 20,
  lowStockAlertedAt: null,
  productName: 'T-shirt',
  productActive: true,
  ...over,
});

function makeHarness(rows: VariantRow[], sendResult: boolean | (() => boolean) = true) {
  const matches = (r: VariantRow, where: Record<string, any>): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.active !== undefined && r.active !== where.active) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock) {
      return false;
    }
    if (where.available?.lte !== undefined && !(r.available <= where.available.lte)) {
      return false;
    }
    if (where.reorderThreshold?.not === null && r.reorderThreshold === null) {
      return false;
    }
    if ('lowStockAlertedAt' in where) {
      const cond = where.lowStockAlertedAt;
      if (cond === null && r.lowStockAlertedAt !== null) return false;
      if (cond?.not === null && r.lowStockAlertedAt === null) return false;
    }
    if (where.product?.active !== undefined && r.productActive !== where.product.active) {
      return false;
    }
    return true;
  };

  const variantApi = {
    findMany: jest.fn(async ({ where }: { where: any }) =>
      rows
        .filter((r) => matches(r, where))
        // Copie : le service ne doit jamais dépendre d'une lecture qui suivrait
        // les écritures faites après elle.
        .map((r) => ({ ...r, product: { name: r.productName } })),
    ),
    updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => {
        if ('lowStockAlertedAt' in data) r.lowStockAlertedAt = data.lowStockAlertedAt;
      });
      return { count: hit.length };
    }),
  };

  const sent: Array<{ clubId: string; items: unknown[] }> = [];
  const notifier = {
    notifyLowStock: jest.fn(async (clubId: string, items: unknown[]) => {
      sent.push({ clubId, items });
      return typeof sendResult === 'function' ? sendResult() : sendResult;
    }),
  };

  // Le verrou laisse passer : ces tests portent sur la garantie tenue par la
  // BASE, pas sur celle tenue par le verrou. C'est justement ce qu'on veut
  // éprouver — le verrou évite la course, il ne la rend pas inoffensive.
  const lock = {
    withLock: jest.fn(async (_k: string, _ms: number, fn: () => Promise<unknown>) =>
      fn(),
    ),
  };

  const prisma = { shopProductVariant: variantApi };

  const svc = new ShopStockSweepService(
    prisma as unknown as PrismaService,
    notifier as unknown as ShopLowStockNotifierService,
    lock as unknown as SchedulerLockService,
  );
  return { svc, rows, notifier, sent, lock };
}

describe('ShopStockSweepService — anti-spam tenu par la base', () => {
  it('alerte une déclinaison passée sous son seuil', async () => {
    const h = makeHarness([VARIANT({ available: 2, reorderThreshold: 5 })]);

    const report = await h.svc.sweep();

    expect(report).toEqual({ examined: 1, alerted: 1, rearmed: 0, failed: 0 });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.items).toEqual([
      expect.objectContaining({
        productName: 'T-shirt',
        label: 'L / Rouge',
        available: 2,
        reorderThreshold: 5,
        reorderTargetQty: 20,
      }),
    ]);
  });

  it('DEUX PASSAGES CONCURRENTS n’alertent qu’une seule fois', async () => {
    // Le cœur du lot B. Le second passage — cron et rejeu manuel tombant à la
    // même seconde — retrouve `lowStockAlertedAt` déjà posé, son updateMany
    // renvoie count = 0, et il sort sans envoyer. Aucun `if` applicatif n'est
    // consulté : c'est le prédicat qui arbitre.
    const h = makeHarness([VARIANT({ available: 1, reorderThreshold: 5 })]);

    const first = await h.svc.sweep();
    const second = await h.svc.sweep();

    expect(first.alerted).toBe(1);
    expect(second.alerted).toBe(0);
    // L'assertion qui mord : un seul courrier, pas deux.
    expect(h.notifier.notifyLowStock).toHaveBeenCalledTimes(1);
  });

  it('marque AVANT d’envoyer : un envoi raté perd l’alerte, il ne la rejoue pas', async () => {
    // Arbitrage assumé (ADR-0012 §7). L'ordre inverse — envoyer puis marquer —
    // transformerait une panne SMTP intermittente en boucle de courriers.
    const h = makeHarness([VARIANT({ available: 0, reorderThreshold: 3 })], false);

    const first = await h.svc.sweep();
    expect(first).toMatchObject({ alerted: 0, failed: 1 });
    // Le marqueur est resté posé malgré l'échec.
    expect(h.rows[0]!.lowStockAlertedAt).not.toBeNull();

    // Et le passage suivant ne réessaie pas : l'alerte est bien perdue.
    const second = await h.svc.sweep();
    expect(second).toMatchObject({ alerted: 0, failed: 0 });
    expect(h.notifier.notifyLowStock).toHaveBeenCalledTimes(1);
  });

  it('RÉARME quand le stock est remonté, et peut alerter de nouveau ensuite', async () => {
    const h = makeHarness([
      VARIANT({
        available: 9,
        reorderThreshold: 5,
        lowStockAlertedAt: new Date('2026-07-01'),
      }),
    ]);

    const rearm = await h.svc.sweep();
    expect(rearm).toMatchObject({ rearmed: 1, alerted: 0 });
    expect(h.rows[0]!.lowStockAlertedAt).toBeNull();

    // Le stock redescend : sans le réarmement, plus AUCUNE alerte n'aurait
    // jamais pu repartir sur cette déclinaison.
    h.rows[0]!.available = 1;
    const again = await h.svc.sweep();
    expect(again.alerted).toBe(1);
  });

  it('réarme une déclinaison dont le suivi de stock a été coupé', async () => {
    // Elle n'est plus candidate à l'alerte, donc son marqueur ne veut plus
    // rien dire : le laisser en place empêcherait toute alerte future si le
    // suivi était réactivé.
    const h = makeHarness([
      VARIANT({
        trackStock: false,
        available: 0,
        lowStockAlertedAt: new Date('2026-07-01'),
      }),
    ]);

    const report = await h.svc.sweep();

    expect(report.rearmed).toBe(1);
    expect(h.rows[0]!.lowStockAlertedAt).toBeNull();
  });

  it('n’alerte ni au-dessus du seuil, ni sans seuil, ni sur une déclinaison inactive', async () => {
    const h = makeHarness([
      VARIANT({ id: 'v-au-dessus', available: 9, reorderThreshold: 5 }),
      VARIANT({ id: 'v-sans-seuil', available: 0, reorderThreshold: null }),
      VARIANT({ id: 'v-inactive', available: 0, active: false }),
      VARIANT({ id: 'v-illimitee', available: 0, trackStock: false }),
      VARIANT({ id: 'v-produit-off', available: 0, productActive: false }),
    ]);

    const report = await h.svc.sweep();

    expect(report.alerted).toBe(0);
    expect(h.notifier.notifyLowStock).not.toHaveBeenCalled();
  });

  it('alerte au seuil EXACT — le seuil est un plancher atteint, pas franchi', async () => {
    const h = makeHarness([VARIANT({ available: 5, reorderThreshold: 5 })]);

    expect((await h.svc.sweep()).alerted).toBe(1);
  });

  it('UN SEUL courrier groupé par club, et un club en échec n’en prive pas un autre', async () => {
    // Vingt messages le jour de l'inventaire de rentrée finiraient en
    // indésirables avant d'être lus.
    const h = makeHarness(
      [
        VARIANT({ id: 'a1', clubId: 'club-1', available: 0 }),
        VARIANT({ id: 'a2', clubId: 'club-1', available: 1, label: 'M / Bleu' }),
        VARIANT({ id: 'b1', clubId: 'club-2', available: 0 }),
      ],
      // Le club-1 n'a pas de domaine d'envoi vérifié : son envoi échoue.
      (() => {
        let call = 0;
        return () => ++call !== 1;
      })(),
    );

    const report = await h.svc.sweep();

    expect(h.notifier.notifyLowStock).toHaveBeenCalledTimes(2); // un par club
    expect(h.sent[0]!.items).toHaveLength(2); // groupé
    expect(report).toMatchObject({ examined: 3, failed: 2, alerted: 1 });
  });

  it('scopé à un club : le rejeu manuel n’alerte jamais un autre tenant', async () => {
    const h = makeHarness([
      VARIANT({ id: 'mien', clubId: 'club-1', available: 0 }),
      VARIANT({ id: 'autre', clubId: 'club-2', available: 0 }),
    ]);

    const report = await h.svc.triggerForClub('club-1');

    expect(report).not.toBeNull();
    expect(report!.alerted).toBe(1);
    expect(h.sent.map((s) => s.clubId)).toEqual(['club-1']);
    expect(h.rows.find((r) => r.id === 'autre')!.lowStockAlertedAt).toBeNull();
  });

  it('rend NULL quand le verrou est tenu — pas un rapport à zéro', async () => {
    // Ce test affirmait auparavant l'inverse : il exigeait un rapport vide, et
    // FIGEAIT donc le défaut au lieu de le démasquer. Un rapport à zéro est
    // indistinguable d'un passage qui n'a rien trouvé, et l'écran affichait un
    // message vert « 0 déclinaison examinée » à un trésorier dont le catalogue
    // était en rupture.
    const h = makeHarness([VARIANT({ available: 0 })]);
    // `withLock` renvoie null quand le bail est pris ; `fn` n'est pas appelée.
    h.lock.withLock.mockResolvedValueOnce(null as never);

    const report = await h.svc.triggerForClub('club-1');

    expect(report).toBeNull();
    expect(h.notifier.notifyLowStock).not.toHaveBeenCalled();
  });

  it('un passage RÉEL qui ne trouve rien rend un rapport, pas null', async () => {
    // Le pendant du test précédent : sans lui, renvoyer null en toutes
    // circonstances passerait aussi, et l'admin ne verrait plus jamais de
    // rapport.
    const h = makeHarness([VARIANT({ available: 50, reorderThreshold: 5 })]);

    const report = await h.svc.triggerForClub('club-1');

    expect(report).not.toBeNull();
    expect(report!.alerted).toBe(0);
  });
});

describe('ShopStockSweepService — kill-switch', () => {
  afterEach(() => {
    delete process.env.SHOP_STOCK_SWEEP_DISABLED;
  });

  it('coupe le balayage ET le JOURNALISE en warn', async () => {
    // Un interrupteur oublié ne se signale par rien d'autre : sans ce warn,
    // tous les clubs cessent d'être alertés en silence.
    process.env.SHOP_STOCK_SWEEP_DISABLED = 'true';
    const h = makeHarness([VARIANT({ available: 0, reorderThreshold: 5 })]);
    const warn = jest
      .spyOn((h.svc as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await h.svc.dailySweep();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('SHOP_STOCK_SWEEP_DISABLED'),
    );
    // Et rien n'a été balayé : aucun marqueur posé, aucun courrier.
    expect(h.rows[0]!.lowStockAlertedAt).toBeNull();
    expect(h.notifier.notifyLowStock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('balaye normalement quand l’interrupteur est absent', async () => {
    const h = makeHarness([VARIANT({ available: 0, reorderThreshold: 5 })]);

    await h.svc.dailySweep();

    expect(h.notifier.notifyLowStock).toHaveBeenCalledTimes(1);
  });
});
