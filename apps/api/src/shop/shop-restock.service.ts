import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildRestockPlan, effectiveTerms } from './restock-plan';
import type { RestockPlan } from './restock-plan';
import { ShopPreorderService } from './shop-preorder.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';

/**
 * Le plan de réapprovisionnement du club (ADR-0021 §3-4).
 *
 * Ce service LIT — déclinaisons, fournisseurs et compteurs — puis laisse
 * `buildRestockPlan` décider. Aucune règle de besoin ici : une seconde copie de
 * la règle finirait par dire autre chose que la première.
 */
@Injectable()
export class ShopRestockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: ShopPurchaseOrdersService,
    private readonly preorders: ShopPreorderService,
  ) {}

  async plan(clubId: string): Promise<RestockPlan> {
    // Suivies, en vente, d'un produit en vente : une déclinaison non suivie a
    // un stock illimité, une déclinaison retirée ne se recommande pas.
    const variants = await this.prisma.shopProductVariant.findMany({
      where: {
        clubId,
        trackStock: true,
        active: true,
        product: { active: true },
      },
      select: {
        id: true,
        productId: true,
        label: true,
        sku: true,
        available: true,
        onHand: true,
        reorderThreshold: true,
        reorderTargetQty: true,
        lowStockAlertedAt: true,
        product: {
          select: {
            name: true,
            preferredSupplierId: true,
            supplierOffers: {
              select: {
                supplierId: true,
                supplierRef: true,
                unitCostCents: true,
                packSize: true,
                supplier: { select: { name: true, active: true } },
                variantOverrides: {
                  select: { variantId: true, supplierRef: true, unitCostCents: true },
                },
              },
            },
          },
        },
      },
    });

    const ids = variants.map((v) => v.id);
    const [onOrder, preordered, inDraft] = await Promise.all([
      this.purchases.onOrderByVariant(clubId, ids),
      this.preorders.preorderedByVariant(clubId, ids),
      this.purchases.draftQtyByVariant(clubId, ids),
    ]);

    return buildRestockPlan(
      variants.map((v) => ({
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        label: v.label,
        sku: v.sku,
        available: v.available,
        onHand: v.onHand,
        reorderThreshold: v.reorderThreshold,
        reorderTargetQty: v.reorderTargetQty,
        alertedAt: v.lowStockAlertedAt,
        onOrder: onOrder.get(v.id) ?? 0,
        preordered: preordered.get(v.id) ?? 0,
        inDraft: inDraft.get(v.id) ?? 0,
        preferredSupplierId: v.product.preferredSupplierId,
        offers: v.product.supplierOffers.map((o) => ({
          supplierId: o.supplierId,
          supplierName: o.supplier.name,
          supplierActive: o.supplier.active,
          packSize: o.packSize,
          ...effectiveTerms(
            o,
            o.variantOverrides.find((x) => x.variantId === v.id),
          ),
        })),
      })),
    );
  }
}
