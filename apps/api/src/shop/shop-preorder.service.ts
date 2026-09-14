import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Commandes dont les unités en attente peuvent encore être servies. Une
 * commande annulée n'en fait pas partie — son attente est d'ailleurs remise à
 * zéro à l'annulation.
 */
const OPEN_ORDER: ShopOrderStatus[] = [
  ShopOrderStatus.PENDING,
  ShopOrderStatus.PAID,
];

/**
 * Précommande : servir les unités en attente d'arrivage (ADR-0018).
 *
 * Une commande passée sur un article épuisé mais commandable réserve ce qui
 * reste, et note le manque sur sa ligne (`awaitingStockQty`). Quand du stock
 * redevient vendable — réception fournisseur, entrée ou correction de stock,
 * commande annulée —, ce service l'attribue aux lignes en attente, de la plus
 * ancienne commande à la plus récente.
 *
 * ORDRE DES VERROUS
 *
 * L'attribution verrouille les COMMANDES servies avant de toucher au stock :
 * commande, puis déclinaison — le même ordre que le règlement, l'annulation et
 * la remise. Ce verrou est ce qui la rend sûre face au règlement : sans lui, un
 * paiement simultané sortirait du stock sur la foi de lignes pas encore
 * servies, pendant que l'attribution servirait sans sortir, et ces unités
 * resteraient comptées dans le placard pour toujours.
 *
 * D'où SA PROPRE TRANSACTION, ouverte après le commit de l'événement : une
 * réception tient déjà le verrou de la déclinaison, et y prendre ensuite celui
 * des commandes inverserait l'ordre — un paiement simultané pourrait
 * interbloquer les deux. Le prix de ce choix : pendant les quelques
 * millisecondes qui séparent les deux transactions, un nouvel acheteur peut
 * prendre l'arrivage avant une précommande plus ancienne. Aucune garantie de
 * stock n'en dépend.
 */
@Injectable()
export class ShopPreorderService {
  private readonly logger = new Logger(ShopPreorderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: ShopStockService,
  ) {}

  /**
   * Sert les unités en attente d'une déclinaison sur son stock vendable, et
   * renvoie le nombre d'unités servies.
   */
  async allocate(clubId: string, variantId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const waiting = await tx.shopOrderLine.findMany({
        where: {
          variantId,
          awaitingStockQty: { gt: 0 },
          order: { clubId, status: { in: OPEN_ORDER } },
        },
        select: { orderId: true },
      });
      if (waiting.length === 0) return 0;

      const variant = await tx.shopProductVariant.findFirst({
        where: { id: variantId, clubId },
        select: { trackStock: true, available: true },
      });
      // Rien de vendable : inutile de verrouiller des commandes.
      if (!variant || (variant.trackStock && variant.available <= 0)) return 0;

      // Verrou des commandes, par identifiant croissant : deux attributions
      // concurrentes les prennent dans le même ordre et ne s'interbloquent pas.
      // `updatedAt` est touché faute de pouvoir écrire un `data` vide.
      const orderIds = [...new Set(waiting.map((w) => w.orderId))].sort();
      for (const id of orderIds) {
        await tx.shopOrder.updateMany({
          where: { id, clubId, status: { in: OPEN_ORDER } },
          data: { updatedAt: new Date() },
        });
      }

      // Relecture SOUS VERROU : une commande annulée entre-temps n'y figure
      // plus. Première commande passée, première servie.
      const lines = await tx.shopOrderLine.findMany({
        where: {
          variantId,
          awaitingStockQty: { gt: 0 },
          orderId: { in: orderIds },
          order: { clubId, status: { in: OPEN_ORDER } },
        },
        include: {
          order: {
            select: { status: true, fulfilledAt: true, createdAt: true },
          },
        },
        orderBy: [{ order: { createdAt: 'asc' } }, { id: 'asc' }],
      });

      let served = 0;
      for (const line of lines) {
        const reserved = await this.stock.reserveUpTo(tx, {
          clubId,
          variantId,
          qty: line.awaitingStockQty,
          orderId: line.orderId,
          orderLineId: line.id,
        });
        if (reserved === 0) break;

        const taken = await tx.shopOrderLine.updateMany({
          where: { id: line.id, awaitingStockQty: { gte: reserved } },
          data: { awaitingStockQty: { decrement: reserved } },
        });
        if (taken.count !== 1) {
          // Impossible sous le verrou de la commande. Lever annule tout, y
          // compris la réservation qui vient d'être faite.
          throw new Error(
            `Ligne ${line.id} modifiée pendant l'attribution de son arrivage.`,
          );
        }

        // Commande déjà SORTIE du stock (ADR-0017 : payée, ou `fulfilledAt`
        // posé) : ces unités sortent à leur arrivée. Sinon, elles sortiront au
        // règlement ou à la remise, avec le reste de la commande.
        if (
          line.order.status === ShopOrderStatus.PAID ||
          line.order.fulfilledAt !== null
        ) {
          await this.stock.fulfill(tx, {
            clubId,
            variantId,
            qty: reserved,
            orderId: line.orderId,
            orderLineId: line.id,
          });
        }

        served += reserved;
        if (reserved < line.awaitingStockQty) break; // plus rien de vendable
      }
      return served;
    });
  }

  /**
   * À appeler APRÈS le commit d'un événement qui a pu rendre du stock vendable.
   *
   * N'échoue jamais pour l'appelant : son événement est déjà enregistré, et le
   * lui faire remonter en erreur ferait croire à l'admin que sa réception n'a
   * pas eu lieu. Une attribution manquée est journalisée, puis rattrapée par le
   * balayage quotidien (`allocatePending`).
   */
  async allocateQuietly(
    clubId: string,
    variantIds: Iterable<string>,
  ): Promise<void> {
    for (const variantId of new Set(variantIds)) {
      try {
        await this.allocate(clubId, variantId);
      } catch (err) {
        this.logger.error(
          `[boutique] précommandes non servies (club ${clubId}, déclinaison ${variantId}) : ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }

  /**
   * Filet de sécurité du balayage quotidien : sert tout ce qui peut l'être.
   * `clubId` absent = tous les clubs. Renvoie le nombre d'unités servies.
   */
  async allocatePending(clubId?: string): Promise<number> {
    const waiting = await this.prisma.shopOrderLine.findMany({
      where: {
        awaitingStockQty: { gt: 0 },
        order: { ...(clubId ? { clubId } : {}), status: { in: OPEN_ORDER } },
      },
      select: { variantId: true, order: { select: { clubId: true } } },
    });

    const pairs = new Map<string, { clubId: string; variantId: string }>();
    for (const w of waiting) {
      if (!w.variantId) continue;
      pairs.set(`${w.order.clubId}|${w.variantId}`, {
        clubId: w.order.clubId,
        variantId: w.variantId,
      });
    }

    let served = 0;
    for (const key of [...pairs.keys()].sort()) {
      const pair = pairs.get(key)!;
      try {
        served += await this.allocate(pair.clubId, pair.variantId);
      } catch (err) {
        this.logger.error(
          `[boutique] précommandes non servies au balayage (club ${pair.clubId}, déclinaison ${pair.variantId}) : ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
    return served;
  }

  /**
   * Reprise du suivi du stock d'une déclinaison qui n'était pas suivie, dans la
   * transaction de l'appelant.
   *
   * Une commande passée pendant que le stock n'était pas suivi n'a rien
   * réservé. Son règlement sortirait pourtant l'article du placard, sans qu'il
   * ait jamais quitté le vendable : un article fantôme resterait en vente
   * (constaté en prod le 2026-09-13).
   *
   * Les unités des commandes en attente, pas encore sorties du stock, passent
   * donc TOUTES en attente d'arrivage. L'attribution (`allocate`, après le
   * commit) les sert sur le stock compté, de la plus ancienne commande à la plus
   * récente, avant tout nouvel acheteur. Une réservation d'avant, s'il y en
   * avait une, a été effacée avec l'écart par le moteur
   * (`ShopStockService.resumeTracking`).
   *
   * Même ordre de verrous que l'attribution et le règlement : les commandes,
   * puis la déclinaison.
   *
   * Renvoie le nombre d'unités remises en attente, ou `null` si la déclinaison
   * était déjà suivie.
   */
  async resumeTrackingInTx(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      variantId: string;
      userId?: string | null;
      reason: string;
    },
  ): Promise<number | null> {
    const { clubId, variantId } = args;
    const untracked = await tx.shopProductVariant.findFirst({
      where: { id: variantId, clubId, trackStock: false },
      select: { id: true },
    });
    if (!untracked) return null;

    const pending = {
      clubId,
      status: ShopOrderStatus.PENDING,
      fulfilledAt: null,
    };
    const waiting = await tx.shopOrderLine.findMany({
      where: { variantId, order: pending },
      select: { orderId: true },
    });
    const orderIds = [...new Set(waiting.map((w) => w.orderId))].sort();
    for (const id of orderIds) {
      await tx.shopOrder.updateMany({
        where: { id, ...pending },
        data: { updatedAt: new Date() },
      });
    }

    if (!(await this.stock.resumeTracking(tx, args))) return null;

    // Relecture sous verrou : une commande réglée ou annulée entre-temps n'y
    // figure plus.
    const lines = await tx.shopOrderLine.findMany({
      where: { variantId, order: pending },
      select: { id: true, quantity: true, cancelledQty: true },
    });
    let held = 0;
    for (const line of lines) {
      // Les unités retirées de la commande (ADR-0020) n'attendent rien.
      const units = line.quantity - line.cancelledQty;
      if (units <= 0) continue;
      await tx.shopOrderLine.updateMany({
        where: { id: line.id },
        data: { awaitingStockQty: units },
      });
      held += units;
    }
    return held;
  }

  /**
   * Unités précommandées en attente d'arrivage, par déclinaison.
   *
   * DÉRIVÉ, pour l'administration seulement : « 3 précommandées » dit combien
   * recommander. Jamais appelé sur le chemin public — c'est une quantité.
   */
  async preorderedByVariant(
    clubId: string,
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const byVariant = new Map<string, number>();
    if (variantIds.length === 0) return byVariant;

    const lines = await this.prisma.shopOrderLine.findMany({
      where: {
        variantId: { in: variantIds },
        awaitingStockQty: { gt: 0 },
        order: { clubId, status: { in: OPEN_ORDER } },
      },
      select: { variantId: true, awaitingStockQty: true },
    });
    for (const l of lines) {
      if (!l.variantId) continue;
      byVariant.set(
        l.variantId,
        (byVariant.get(l.variantId) ?? 0) + l.awaitingStockQty,
      );
    }
    return byVariant;
  }
}
