import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, ShopStockMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Relectures de `reserveUpTo` avant de laisser la ligne attendre l'arrivage.
 * Chaque échec est une vente concurrente réellement passée entre la lecture et
 * l'écriture : trois d'affilée sur la même déclinaison ne se voient pas dans un
 * club.
 */
const RESERVE_UP_TO_ATTEMPTS = 3;

/** Une pièce d'un pack, telle que la ligne de commande l'a figée (ADR-0024). */
type BundlePart = { variantId: string; unitQty: number };

/**
 * Le SEUL point d'écriture du stock (ADR-0012).
 *
 * Aucune autre méthode du dépôt ne doit toucher `onHand` ni `available` :
 * concentrer les écritures ici est ce qui rend la garantie anti-survente
 * auditable — il y a une seule ligne à relire, pas six.
 *
 * DEUX COMPTEURS, DEUX SENS
 *
 *   onHand    ce qui est physiquement dans le placard
 *   available ce qui est encore vendable  (= onHand − réservé)
 *
 * Une commande RÉSERVE : `available` baisse, `onHand` ne bouge pas — le
 * t-shirt est toujours là. Le paiement REMET la marchandise : `onHand` baisse,
 * `available` ne bouge pas, il avait déjà été décompté. Une annulation LIBÈRE :
 * `available` remonte. Les trois mouvements sont donc disjoints, et c'est ce
 * qui permet à un inventaire physique de tomber juste.
 *
 * LA GARANTIE
 *
 * `prisma db push` (ADR-0003) interdit tout CHECK et tout trigger. Le prédicat
 * `available: { gte: qty }` d'un `updateMany` conditionnel est donc le SEUL
 * mécanisme disponible contre la survente — d'où l'exigence que `available`
 * soit non nullable et que l'illimité soit un booléen dédié.
 *
 * LES PACKS (ADR-0024)
 *
 * Un pack se vend mais ne se stocke pas : ses compteurs restent à zéro, et
 * chaque mouvement d'une ligne de pack s'applique à ses PIÈCES, multiplié par
 * leur quantité. La réservation fige la composition sur la ligne
 * (`ShopOrderLineComponent`) ; la libération, la sortie, le retour et la perte
 * relisent cet instantané, jamais le catalogue. Le pack n'est reconnu QUE
 * lorsque l'écriture directe n'a rien touché : sur une déclinaison stockée, le
 * chemin reste exactement celui d'avant, sans une requête de plus.
 */
@Injectable()
export class ShopStockService {
  private readonly logger = new Logger(ShopStockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Réserve `qty` unités. Lève si la variante ne peut pas les fournir.
   *
   * À appeler DANS une transaction : le mouvement et le compteur sont écrits
   * ensemble, sans quoi l'archive pourrait manquer sans annuler l'écriture
   * qu'elle documente.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<void> {
    const claim = await this.claim(tx, args);
    if (claim !== 'refused') return;

    // Ni stockée ni illimitée : un pack, ou rien de vendable. Les pièces sont
    // réservées une à une avec la MÊME garantie ; la première qui manque lève,
    // et la transaction de l'appelant annule les pièces déjà prises.
    const parts = await this.snapshotBundle(tx, args);
    if (parts) {
      for (const part of parts) {
        const partClaim = await this.claim(tx, {
          ...args,
          variantId: part.variantId,
          qty: args.qty * part.unitQty,
        });
        if (partClaim === 'refused') {
          throw new BadRequestException(
            'Pack indisponible : une de ses pièces manque en stock.',
          );
        }
      }
      return;
    }

    throw new BadRequestException(
      'Article indisponible ou stock insuffisant pour cette déclinaison.',
    );
  }

  /**
   * La réservation d'UNE déclinaison stockée, sans jamais suivre un pack : la
   * garantie elle-même. `refused` couvre la rupture, la déclinaison retirée
   * de la vente et le pack — à l'appelant de distinguer.
   */
  private async claim(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<'claimed' | 'untracked' | 'refused'> {
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    // LA garantie. Le SQL émis :
    //   UPDATE "ShopProductVariant" SET "available" = "available" - $1
    //    WHERE "id"=$2 AND "clubId"=$3 AND "active" AND "trackStock"
    //      AND "available" >= $1;
    //
    // Sous READ COMMITTED, PostgreSQL verrouille la ligne puis RÉÉVALUE le
    // prédicat sur la version committée. Deux transactions sur le dernier
    // article : la seconde attend, retrouve available = 0, et son rowCount
    // vaut 0. Il n'existe aucune fenêtre entre la lecture et l'écriture —
    // parce qu'il n'y a pas de lecture.
    //
    // Le clubId est DANS l'écriture : la frontière multi-tenant est tenue par
    // la même requête que la garantie de stock, pas par un findFirst préalable.
    const claimed = await tx.shopProductVariant.updateMany({
      where: {
        id: variantId,
        clubId,
        active: true,
        trackStock: true,
        available: { gte: qty },
      },
      data: { available: { decrement: qty } },
    });

    if (claimed.count === 1) {
      await tx.shopStockMovement.create({
        data: {
          clubId,
          variantId,
          kind: ShopStockMovementKind.RESERVE,
          onHandDelta: 0,
          availableDelta: -qty,
          orderId,
          orderLineId,
        },
      });
      return 'claimed';
    }

    // Échec du premier ordre : soit la variante est en rupture, soit elle
    // n'est pas suivie. On distingue par un SECOND ORDRE CONDITIONNEL et non
    // par une lecture arbitrale — une lecture rouvrirait le check-then-act
    // qu'on vient de fermer. `updatedAt` est touché faute de pouvoir écrire
    // un `data` vide en Prisma ; l'écriture est sans effet métier.
    //
    // `isBundle: false` est LA clause des packs : un pack a `trackStock` à
    // faux, et sans elle il passerait ici pour un stock illimité.
    const untracked = await tx.shopProductVariant.updateMany({
      where: {
        id: variantId,
        clubId,
        active: true,
        trackStock: false,
        isBundle: false,
      },
      data: { updatedAt: new Date() },
    });
    // Stock illimité : rien à décompter, donc aucun mouvement à archiver.
    return untracked.count === 1 ? 'untracked' : 'refused';
  }

  /**
   * Fige sur la ligne la composition d'un pack EN VENTE, et la renvoie triée
   * par identifiant (ordre des verrous). `null` si la déclinaison n'est pas un
   * pack vendable — ou un pack sans pièce, qui n'a rien à vendre.
   */
  private async snapshotBundle(
    tx: Prisma.TransactionClient,
    args: { clubId: string; variantId: string; orderLineId: string },
  ): Promise<BundlePart[] | null> {
    const bundle = await tx.shopProductVariant.findFirst({
      where: {
        id: args.variantId,
        clubId: args.clubId,
        active: true,
        isBundle: true,
      },
      select: {
        bundleComponents: {
          select: { componentVariantId: true, quantity: true },
        },
      },
    });
    if (!bundle || bundle.bundleComponents.length === 0) return null;

    const parts = bundle.bundleComponents
      .map((c) => ({ variantId: c.componentVariantId, unitQty: c.quantity }))
      .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
    await tx.shopOrderLineComponent.createMany({
      data: parts.map((p) => ({
        clubId: args.clubId,
        orderLineId: args.orderLineId,
        variantId: p.variantId,
        unitQty: p.unitQty,
      })),
    });
    return parts;
  }

  /** Pièces figées d'une ligne de pack, triées ; vide hors pack. */
  private async partsOfLine(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderLineId: string,
  ): Promise<BundlePart[]> {
    return tx.shopOrderLineComponent.findMany({
      where: { clubId, orderLineId },
      select: { variantId: true, unitQty: true },
      orderBy: { variantId: 'asc' },
    });
  }

  /**
   * Déclinaisons STOCKÉES qu'une ligne fait bouger : ses pièces pour un pack,
   * sa déclinaison sinon. Sert à l'attribution des précommandes après une
   * libération : ce sont les gants qui remontent, pas le pack.
   */
  async stockedVariantIdsOfLine(
    tx: Prisma.TransactionClient,
    clubId: string,
    line: { id: string; variantId: string },
  ): Promise<string[]> {
    const parts = await this.partsOfLine(tx, clubId, line.id);
    return parts.length > 0 ? parts.map((p) => p.variantId) : [line.variantId];
  }

  /**
   * Verrouille, par identifiant CROISSANT, toutes les déclinaisons stockées
   * qu'une commande va toucher — pièces des packs comprises.
   *
   * Le tri des lignes ne suffit plus dès qu'un pack s'y trouve : un panier
   * [pack(gants, pieds), pieds seuls] et un autre [gants seuls, pack]
   * prendraient gants et pieds en ordre inverse et s'interbloqueraient. Ces
   * écritures sans effet prennent les verrous dans un ordre unique ; les
   * réservations qui suivent les trouvent déjà acquis.
   */
  async lockForOrder(
    tx: Prisma.TransactionClient,
    clubId: string,
    variantIds: string[],
  ): Promise<void> {
    const parts = await tx.shopBundleComponent.findMany({
      where: { clubId, bundleVariantId: { in: variantIds } },
      select: { bundleVariantId: true, componentVariantId: true },
    });
    const packs = new Set(parts.map((p) => p.bundleVariantId));
    const ids = new Set(variantIds.filter((id) => !packs.has(id)));
    for (const p of parts) ids.add(p.componentVariantId);
    for (const id of [...ids].sort()) {
      await tx.shopProductVariant.updateMany({
        where: { id, clubId },
        data: { updatedAt: new Date() },
      });
    }
  }

  /**
   * Réserve AU PLUS `qty` unités et renvoie le nombre réellement réservé : la
   * précommande (ADR-0018), où ce qui manque attend l'arrivage au lieu de faire
   * échouer la commande.
   *
   * La garantie est celle de `reserve`, tenue par le même moyen : l'écriture
   * reste conditionnelle sur `available: { gte: take }`, donc `available` ne
   * descend jamais sous zéro. La lecture qui la précède ne fait que CHOISIR
   * `take`, elle n'arbitre rien. Si une vente concurrente prend des unités
   * entre les deux, `count` vaut 0 et l'on relit. Après quelques courses
   * perdues d'affilée, on réserve zéro : faire attendre l'arrivage est toujours
   * permis, survendre jamais.
   *
   * Ne filtre PAS sur `active`, à la différence de `reserve` : le passage de
   * commande l'a vérifié dans sa transaction, et l'attribution d'un arrivage
   * doit pouvoir servir une précommande acceptée sur une déclinaison retirée
   * de la vente depuis.
   *
   * Stock non suivi : tout est servi, rien n'est décompté — confirmé par un
   * ordre conditionnel, comme dans `reserve`.
   */
  async reserveUpTo(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<number> {
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    for (let attempt = 1; ; attempt++) {
      const current = await tx.shopProductVariant.findFirst({
        where: { id: variantId, clubId, trackStock: true },
        select: { available: true },
      });
      if (!current) {
        // Un pack ne se précommande pas (ADR-0024) : `isBundle: false` le
        // refuse ici au lieu de le servir comme un stock illimité.
        const untracked = await tx.shopProductVariant.updateMany({
          where: { id: variantId, clubId, trackStock: false, isBundle: false },
          data: { updatedAt: new Date() },
        });
        if (untracked.count === 1) return qty;
        throw new BadRequestException(
          'Article indisponible ou stock insuffisant pour cette déclinaison.',
        );
      }

      const take = Math.min(qty, current.available);
      if (take <= 0) return 0;

      const claimed = await tx.shopProductVariant.updateMany({
        where: {
          id: variantId,
          clubId,
          trackStock: true,
          available: { gte: take },
        },
        data: { available: { decrement: take } },
      });
      if (claimed.count === 1) {
        await tx.shopStockMovement.create({
          data: {
            clubId,
            variantId,
            kind: ShopStockMovementKind.RESERVE,
            onHandDelta: 0,
            availableDelta: -take,
            orderId,
            orderLineId,
          },
        });
        return take;
      }

      // Course perdue : une vente concurrente est passée entre la lecture et
      // l'écriture.
      if (attempt >= RESERVE_UP_TO_ATTEMPTS) {
        this.logger.warn(
          `[boutique] réservation perdue ${attempt} fois sur ${variantId} : ` +
            'la ligne attendra l’arrivage.',
        );
        return 0;
      }
    }
  }

  /**
   * Rend `qty` unités réservées : annulation d'une commande non payée.
   *
   * Volontairement SANS garde de quantité — on ne peut pas « trop rendre » ce
   * qui a été pris, et l'idempotence est assurée en amont par la machine à
   * états, qui n'autorise qu'une seule transition PENDING → CANCELLED.
   */
  async release(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<void> {
    if (await this.releaseOne(tx, args)) return;
    // Rien de suivi sous cet identifiant : une ligne de pack rend ses pièces.
    for (const part of await this.partsOfLine(tx, args.clubId, args.orderLineId)) {
      await this.releaseOne(tx, {
        ...args,
        variantId: part.variantId,
        qty: args.qty * part.unitQty,
      });
    }
  }

  private async releaseOne(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<boolean> {
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    const restored = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, trackStock: true },
      data: {
        available: { increment: qty },
        // Réarmement de l'alerte : le stock vient de remonter, un futur
        // passage sous le seuil doit pouvoir alerter de nouveau. Sans cette
        // remise à zéro, la première alerte masquerait toutes les suivantes.
        lowStockAlertedAt: null,
      },
    });
    if (restored.count === 0) return false; // variante non suivie : rien à rendre

    await tx.shopStockMovement.create({
      data: {
        clubId,
        variantId,
        kind: ShopStockMovementKind.RELEASE,
        onHandDelta: 0,
        availableDelta: qty,
        orderId,
        orderLineId,
      },
    });
    return true;
  }

  /**
   * Sortie physique au paiement : la marchandise quitte le placard.
   *
   * `available` n'est PAS touché — il avait déjà baissé à la réservation. Le
   * confondre ici décompterait deux fois la même vente.
   */
  async fulfill(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<void> {
    if (await this.fulfillOne(tx, args)) return;
    // Une ligne de pack : ce sont ses pièces qui quittent le placard.
    for (const part of await this.partsOfLine(tx, args.clubId, args.orderLineId)) {
      await this.fulfillOne(tx, {
        ...args,
        variantId: part.variantId,
        qty: args.qty * part.unitQty,
      });
    }
  }

  private async fulfillOne(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
    },
  ): Promise<boolean> {
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    const shipped = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, trackStock: true },
      data: { onHand: { decrement: qty } },
    });
    if (shipped.count === 0) return false;

    await tx.shopStockMovement.create({
      data: {
        clubId,
        variantId,
        kind: ShopStockMovementKind.FULFILL,
        onHandDelta: -qty,
        availableDelta: 0,
        orderId,
        orderLineId,
      },
    });
    return true;
  }

  /**
   * Retour client (ADR-0019) : un article déjà sorti du stock revient au club
   * à l'annulation de sa commande. Les deux compteurs remontent — il est de
   * nouveau dans le placard, et vendable.
   *
   * Renvoie `false` pour une déclinaison non suivie : rien à remonter, donc
   * rien à archiver, ni retour ni perte derrière lui. Un pack rendu remonte
   * ses pièces, et renvoie `true` si l'une d'elles est suivie.
   */
  async returnToStock(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
      userId?: string | null;
      reason?: string | null;
    },
  ): Promise<boolean> {
    if (args.qty < 1) {
      throw new BadRequestException('La quantité rendue doit être positive.');
    }
    if (await this.returnOne(tx, args)) return true;
    let tracked = false;
    for (const part of await this.partsOfLine(tx, args.clubId, args.orderLineId)) {
      const back = await this.returnOne(tx, {
        ...args,
        variantId: part.variantId,
        qty: args.qty * part.unitQty,
      });
      tracked = tracked || back;
    }
    return tracked;
  }

  private async returnOne(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      orderId: string;
      orderLineId: string;
      userId?: string | null;
      reason?: string | null;
    },
  ): Promise<boolean> {
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    const restored = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, trackStock: true },
      data: {
        onHand: { increment: qty },
        available: { increment: qty },
        // Réarmement, comme à toute remontée du stock.
        lowStockAlertedAt: null,
      },
    });
    if (restored.count === 0) return false;

    await tx.shopStockMovement.create({
      data: {
        clubId,
        variantId,
        kind: ShopStockMovementKind.RETURN,
        onHandDelta: qty,
        availableDelta: qty,
        orderId,
        orderLineId,
        reason: args.reason ?? null,
        userId: args.userId ?? null,
      },
    });
    return true;
  }

  /**
   * Réception fournisseur : les deux compteurs montent ensemble.
   *
   * PARAMÈTRE `tx` OPTIONNEL — ajouté pour la réception de commande
   * fournisseur (ADR-0013 §5), et voici pourquoi ce choix plutôt qu'une
   * extraction de la logique vers l'appelant :
   *
   *  - la réception écrit sa ligne, son mouvement et le cumul reçu dans UNE
   *    transaction. Laisser `restock` ouvrir la sienne casserait cette
   *    atomicité : un mouvement committé survivrait à l'annulation de la
   *    réception qui le justifie, et le journal cesserait de se réconcilier ;
   *  - extraire la logique ferait du moteur de stock un endroit de plus où
   *    l'on écrit `onHand` / `available`, ce que l'ADR-0012 existe précisément
   *    pour interdire — il doit y avoir UNE ligne à relire, pas deux.
   *
   * Le comportement à un seul argument est INCHANGÉ : sans `tx`, la méthode
   * ouvre sa propre transaction exactement comme avant.
   *
   * Renvoie l'identifiant du mouvement archivé, pour que la ligne de réception
   * puisse s'y rattacher. C'est CE rattachement qui rend le journal précis :
   * « +17 reçu sur commande CF-2026-004 » au lieu de « +17 ».
   */
  async restock(
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      userId?: string | null;
      reason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ movementId: string }> {
    if (args.qty < 1) {
      throw new BadRequestException('La quantité reçue doit être positive.');
    }
    const run = async (t: Prisma.TransactionClient) => {
      const updated = await t.shopProductVariant.updateMany({
        where: { id: args.variantId, clubId: args.clubId, trackStock: true },
        data: {
          onHand: { increment: args.qty },
          available: { increment: args.qty },
          lowStockAlertedAt: null, // réarmement
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Déclinaison introuvable ou stock non suivi.',
        );
      }
      const movement = await t.shopStockMovement.create({
        data: {
          clubId: args.clubId,
          variantId: args.variantId,
          kind: ShopStockMovementKind.RESTOCK,
          onHandDelta: args.qty,
          availableDelta: args.qty,
          reason: args.reason ?? null,
          userId: args.userId ?? null,
        },
      });
      return { movementId: movement.id };
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Correction après comptage physique : l'admin déclare ce qu'il a VU.
   *
   * Le delta est calculé par différence, et les deux compteurs bougent du même
   * écart — corriger `onHand` sans `available` ferait diverger le vendable du
   * détenu, ce qu'aucun inventaire ne pourrait plus expliquer.
   *
   * La lecture préalable est ici LÉGITIME et ne rouvre pas de check-then-act :
   * une correction d'inventaire est un geste humain, séquentiel, et le pire
   * cas d'une course est une seconde correction annulant la première — pas une
   * survente. Le mouvement archivé garde la trace des deux.
   */
  async adjust(args: {
    clubId: string;
    variantId: string;
    countedOnHand: number;
    userId?: string | null;
    reason?: string | null;
  }): Promise<void> {
    if (args.countedOnHand < 0) {
      throw new BadRequestException('Un stock compté ne peut pas être négatif.');
    }
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shopProductVariant.findFirst({
        where: { id: args.variantId, clubId: args.clubId, trackStock: true },
        select: { onHand: true, available: true },
      });
      if (!current) {
        throw new BadRequestException(
          'Déclinaison introuvable ou stock non suivi.',
        );
      }
      const delta = args.countedOnHand - current.onHand;
      if (delta === 0) return;

      // `available` ne descend jamais sous zéro : si l'écart est plus grand
      // que le vendable restant, c'est que des unités réservées ont disparu —
      // le manque est réel, mais on ne peut pas « dé-réserver » une commande
      // déjà passée.
      const nextAvailable = Math.max(0, current.available + delta);

      await tx.shopProductVariant.update({
        where: { id: args.variantId },
        data: {
          onHand: args.countedOnHand,
          available: nextAvailable,
          ...(delta > 0 ? { lowStockAlertedAt: null } : {}),
        },
      });
      await tx.shopStockMovement.create({
        data: {
          clubId: args.clubId,
          variantId: args.variantId,
          kind: ShopStockMovementKind.ADJUSTMENT,
          onHandDelta: delta,
          availableDelta: nextAvailable - current.available,
          reason: args.reason ?? null,
          userId: args.userId ?? null,
        },
      });
    });
  }

  /**
   * Perte, casse, vol : les deux compteurs descendent.
   */
  async recordShrinkage(
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      userId?: string | null;
      reason: string;
      /** Commande dont l'article rendu est déclaré perdu (ADR-0019). */
      orderId?: string | null;
      orderLineId?: string | null;
    },
    /**
     * Transaction de l'appelant : l'annulation d'une commande déclare la perte
     * d'un article rendu dans SA transaction, avec le retour qui la précède.
     * Sans elle, la méthode ouvre la sienne, exactement comme avant.
     */
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (args.qty < 1) {
      throw new BadRequestException('La quantité perdue doit être positive.');
    }
    const refused = () =>
      new BadRequestException(
        'Quantité supérieure au stock détenu, ou stock non suivi.',
      );
    const run = async (tx: Prisma.TransactionClient) => {
      if (await this.shrinkOne(tx, args)) return;
      // Un pack rendu puis déclaré perdu : la perte porte sur ses pièces,
      // figées sur la ligne. Sans ligne, rien ne dit de quel pack il s'agit.
      const parts = args.orderLineId
        ? await this.partsOfLine(tx, args.clubId, args.orderLineId)
        : [];
      if (parts.length === 0) throw refused();
      for (const part of parts) {
        const shrunk = await this.shrinkOne(tx, {
          ...args,
          variantId: part.variantId,
          qty: args.qty * part.unitQty,
        });
        if (!shrunk) throw refused();
      }
    };
    await (tx ? run(tx) : this.prisma.$transaction(run));
  }

  private async shrinkOne(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      userId?: string | null;
      reason: string;
      orderId?: string | null;
      orderLineId?: string | null;
    },
  ): Promise<boolean> {
    // Conditionnel : on ne déclare pas plus de pertes qu'il n'y a de
    // marchandise. Même forme que la réservation.
    const removed = await tx.shopProductVariant.updateMany({
      where: {
        id: args.variantId,
        clubId: args.clubId,
        trackStock: true,
        onHand: { gte: args.qty },
      },
      data: {
        onHand: { decrement: args.qty },
        available: { decrement: args.qty },
      },
    });
    if (removed.count !== 1) return false;
    await tx.shopStockMovement.create({
      data: {
        clubId: args.clubId,
        variantId: args.variantId,
        kind: ShopStockMovementKind.SHRINKAGE,
        onHandDelta: -args.qty,
        availableDelta: -args.qty,
        reason: args.reason,
        userId: args.userId ?? null,
        orderId: args.orderId ?? null,
        orderLineId: args.orderLineId ?? null,
      },
    });
    return true;
  }

  /**
   * OUVERTURE d'une variante : pose ses compteurs à `qty` ET archive le
   * mouvement correspondant.
   *
   * Sans elle, une variante naissait avec `onHand = available = 12` sans
   * qu'aucun mouvement ne le justifie : `SUM(availableDelta)` sur le journal
   * ne pouvait alors JAMAIS se réconcilier avec le compteur, l'écart valant
   * exactement le stock initial. La réconciliation promise par l'ADR-0012 §4
   * était donc impossible pour tout produit, dès sa création — et « pourquoi
   * il manque trois t-shirts ? » redevenait sans réponse.
   *
   * Sert aussi à remettre une variante à zéro avant de rebasculer son suivi :
   * la discontinuité apparaît dans le journal au lieu d'être escamotée.
   */
  async open(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      qty: number;
      trackStock: boolean;
      userId?: string | null;
      reason?: string | null;
    },
  ): Promise<void> {
    const { clubId, variantId, qty, trackStock } = args;

    // Jamais sur un pack (ADR-0024) : il ne se stocke pas, l'ouvrir lui
    // donnerait un stock propre que rien ne décompterait.
    const opened = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, isBundle: false },
      data: {
        trackStock,
        onHand: qty,
        available: qty,
        lowStockAlertedAt: null,
      },
    });
    if (opened.count === 0) return;

    // Une ouverture à zéro sur une variante non suivie n'a rien à archiver :
    // il ne s'est rien passé de comptable.
    if (!trackStock && qty === 0) return;

    await tx.shopStockMovement.create({
      data: {
        clubId,
        variantId,
        kind: ShopStockMovementKind.ADJUSTMENT,
        onHandDelta: qty,
        availableDelta: qty,
        reason: args.reason ?? 'Stock initial',
        userId: args.userId ?? null,
      },
    });
  }

  /**
   * REPRISE du suivi d'une déclinaison qui n'était pas suivie.
   *
   * Tant que le stock n'est pas suivi, rien ne touche aux compteurs : ni les
   * réservations des commandes passées, ni les sorties de leurs règlements.
   * L'écart `onHand − available` qu'ils portent encore ne désigne donc plus
   * aucune réservation réelle. La reprise l'efface (`available = onHand`) et
   * l'archive ; l'appelant réserve de nouveau les commandes en cours, dans la
   * même transaction (`ShopPreorderService.resumeTrackingInTx`).
   *
   * Conditionnelle sur l'état lu : renvoie `false` si la déclinaison est déjà
   * suivie, introuvable, ou vient de changer.
   */
  async resumeTracking(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      userId?: string | null;
      reason: string;
    },
  ): Promise<boolean> {
    const { clubId, variantId } = args;
    const current = await tx.shopProductVariant.findFirst({
      where: { id: variantId, clubId, trackStock: false, isBundle: false },
      select: { onHand: true, available: true },
    });
    if (!current) return false;

    const resumed = await tx.shopProductVariant.updateMany({
      where: {
        id: variantId,
        clubId,
        trackStock: false,
        isBundle: false,
        onHand: current.onHand,
        available: current.available,
      },
      data: {
        trackStock: true,
        available: current.onHand,
        lowStockAlertedAt: null,
      },
    });
    if (resumed.count !== 1) return false;

    await tx.shopStockMovement.create({
      data: {
        clubId,
        variantId,
        kind: ShopStockMovementKind.ADJUSTMENT,
        onHandDelta: 0,
        availableDelta: current.onHand - current.available,
        reason: args.reason,
        userId: args.userId ?? null,
      },
    });
    return true;
  }

  /** Journal d'une variante, du plus récent au plus ancien. */
  async listMovements(
    clubId: string,
    args: { variantId?: string; take?: number; skip?: number },
  ) {
    return this.prisma.shopStockMovement.findMany({
      where: { clubId, ...(args.variantId ? { variantId: args.variantId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(args.take ?? 50, 200),
      skip: args.skip ?? 0,
    });
  }
}
