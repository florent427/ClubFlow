import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, ShopStockMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
      return;
    }

    // Échec du premier ordre : soit la variante est en rupture, soit elle
    // n'est pas suivie. On distingue par un SECOND ORDRE CONDITIONNEL et non
    // par une lecture arbitrale — une lecture rouvrirait le check-then-act
    // qu'on vient de fermer. `updatedAt` est touché faute de pouvoir écrire
    // un `data` vide en Prisma ; l'écriture est sans effet métier.
    const untracked = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, active: true, trackStock: false },
      data: { updatedAt: new Date() },
    });
    if (untracked.count === 1) {
      // Stock illimité : rien à décompter, donc aucun mouvement à archiver.
      return;
    }

    throw new BadRequestException(
      'Article indisponible ou stock insuffisant pour cette déclinaison.',
    );
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
    if (restored.count === 0) return; // variante non suivie : rien à rendre

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
    const { clubId, variantId, qty, orderId, orderLineId } = args;

    const shipped = await tx.shopProductVariant.updateMany({
      where: { id: variantId, clubId, trackStock: true },
      data: { onHand: { decrement: qty } },
    });
    if (shipped.count === 0) return;

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
  }

  /**
   * Réception fournisseur : les deux compteurs montent ensemble.
   */
  async restock(args: {
    clubId: string;
    variantId: string;
    qty: number;
    userId?: string | null;
    reason?: string | null;
  }): Promise<void> {
    if (args.qty < 1) {
      throw new BadRequestException('La quantité reçue doit être positive.');
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shopProductVariant.updateMany({
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
      await tx.shopStockMovement.create({
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
    });
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
  async recordShrinkage(args: {
    clubId: string;
    variantId: string;
    qty: number;
    userId?: string | null;
    reason: string;
  }): Promise<void> {
    if (args.qty < 1) {
      throw new BadRequestException('La quantité perdue doit être positive.');
    }
    await this.prisma.$transaction(async (tx) => {
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
      if (removed.count !== 1) {
        throw new BadRequestException(
          'Quantité supérieure au stock détenu, ou stock non suivi.',
        );
      }
      await tx.shopStockMovement.create({
        data: {
          clubId: args.clubId,
          variantId: args.variantId,
          kind: ShopStockMovementKind.SHRINKAGE,
          onHandDelta: -args.qty,
          availableDelta: -args.qty,
          reason: args.reason,
          userId: args.userId ?? null,
        },
      });
    });
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
