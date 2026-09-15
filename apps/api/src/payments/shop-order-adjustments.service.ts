import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPreorderService } from '../shop/shop-preorder.service';
import { ShopService } from '../shop/shop.service';
import { lockInvoicesInTx } from './settlement-locks';
import { planShopOrderAdjustment } from './shop-order-adjustment-plan';
import { ShopOrderMoneyService } from './shop-order-money.service';
import { ShopOrderRefundKind } from './shop-order-refund-plan';

export type ShopOrderLineAdjustmentInput = {
  orderId: string;
  lineId: string;
  quantity: number;
  newVariantId?: string | null;
  newQuantity?: number | null;
  goodsReturned?: boolean | null;
  goodsLost?: boolean | null;
};

/**
 * Ajuster une ligne de commande boutique — annuler des articles, ou les
 * échanger contre un autre (ADR-0020).
 *
 * Même architecture que l'annulation de la commande (ADR-0019) : la boutique
 * garde la commande et le stock (`ShopService.adjustLineInTx`), l'argent passe
 * par `ShopOrderMoneyService`, et un plan pur (`planShopOrderAdjustment`) est
 * montré à l'admin avant d'être exécuté tel quel.
 *
 * UNE transaction : l'ajustement, le stock, la nouvelle ligne, les rendus et
 * leurs avoirs, les avoirs d'extinction, la facture du reste à payer, les
 * factures soldées ou annulées, la commande réglée. Après le commit :
 * contre-passations, remboursements carte, échéanciers et sessions,
 * attribution des précommandes.
 */
@Injectable()
export class ShopOrderAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly money: ShopOrderMoneyService,
    private readonly preorders: ShopPreorderService,
  ) {}

  /** Ce que ferait l'ajustement, sans rien écrire. */
  async preview(clubId: string, input: ShopOrderLineAdjustmentInput) {
    const { plan } = await this.load(clubId, input);
    return {
      blockers: plan.blockers,
      delivered: plan.delivered,
      exited: plan.exited,
      signatureRequired: plan.signatureRequired,
      removedCents: plan.removedCents,
      addedCents: plan.addedCents,
      differenceCents: plan.differenceCents,
      fromAwaiting: plan.goods.fromAwaiting,
      releaseUnits: plan.goods.releaseUnits,
      returnUnits: plan.goods.returnUnits,
      newItemLabel: plan.newItem?.label ?? null,
      newItemUnitPriceCents: plan.newItem?.unitPriceCents ?? null,
      newItemAwaitingUnits: plan.newItem?.awaitingUnits ?? null,
      supplementCents: plan.supplementCents,
      refunds: plan.refunds.map((r) => ({
        kind: r.kind,
        paymentId: r.paymentId,
        amountCents: r.amountCents,
        chequeNumber: r.chequeNumber,
      })),
      refundCents: plan.refundCents,
      writeOffCents: plan.writeOffCents,
      invoiceVoided: plan.voidInvoiceIds.length > 0,
      settlesOrder: plan.settlesOrder,
    };
  }

  async adjust(
    clubId: string,
    userId: string,
    input: ShopOrderLineAdjustmentInput & {
      reason: string;
      signerName?: string | null;
      signaturePng?: string | null;
    },
  ) {
    const reason = input.reason.trim();
    if (!reason) {
      throw new BadRequestException(
        'Indique le motif : il figure sur les avoirs.',
      );
    }
    const { order, line, money, plan, exchange } = await this.load(clubId, input);
    if (plan.blockers.length > 0) {
      throw new BadRequestException(plan.blockers.join(' '));
    }
    if (
      plan.signatureRequired &&
      !(input.signerName?.trim() && input.signaturePng)
    ) {
      throw new BadRequestException(
        'Commande déjà remise : fais signer l’échange par l’adhérent.',
      );
    }

    const isExchange = exchange !== null;
    const labels = isExchange
      ? {
          refund: `Échange — ${reason}`,
          writeOff: `Échange — ${reason}`,
          voidReason: `Échange : ${reason}`,
          chequeNote: `Rendu à l’adhérent : échange — ${reason}`,
        }
      : {
          refund: `Article annulé — ${reason}`,
          writeOff: `Article annulé — ${reason}`,
          voidReason: `Article annulé : ${reason}`,
          chequeNote: `Rendu à l’adhérent : article annulé — ${reason}`,
        };

    const done = await this.prisma.$transaction(async (tx) => {
      // Les factures d'abord, avant la commande, comme à l'annulation remboursée
      // (ADR-0022, §3) : un règlement en cours attend ce commit, ou la relecture
      // le voit.
      await lockInvoicesInTx(tx, money.invoices.map((inv) => inv.id));
      const { adjustment, released } = await this.shop.adjustLineInTx(
        tx,
        clubId,
        userId,
        {
          orderId: order.id,
          lineId: line.id,
          qty: input.quantity,
          reason,
          goodsReturned: input.goodsReturned === true,
          goodsLost: input.goodsLost === true,
          exchange,
          signature: plan.signatureRequired
            ? {
                signerName: input.signerName ?? '',
                signaturePng: input.signaturePng ?? '',
              }
            : null,
          expected: {
            status: order.status,
            fulfilled: order.fulfilledAt !== null,
            delivered: order.deliveredAt !== null,
            lineCancelledQty: line.cancelledQty,
            lineAwaitingStockQty: line.awaitingStockQty,
          },
        },
      );

      await this.money.assertUnchangedInTx(tx, clubId, order.id, money.invoices);
      const manual = await this.money.applyInTx(
        tx,
        clubId,
        money.invoices,
        plan,
        labels,
      );

      let supplementInvoiceId: string | null = null;
      if (plan.supplementCents > 0) {
        supplementInvoiceId = (
          await this.shop.createAdjustmentInvoiceInTx(
            tx,
            clubId,
            order,
            adjustment.id,
            plan.supplementCents,
          )
        ).id;
      }
      // La facture de la commande est soldée : la commande en attente passe
      // payée et sort du stock, comme à un encaissement (ADR-0017).
      if (plan.settlesOrder) {
        await this.shop.fulfillPaidShopOrderInTx(tx, clubId, order.id);
      }

      const manualRefundedCents = manual.reduce((sum, m) => sum + m.amountCents, 0);
      await tx.shopOrderAdjustment.update({
        where: { id: adjustment.id },
        data: {
          refundedCents: manualRefundedCents,
          cardRefundCents: plan.refunds
            .filter((r) => r.kind === ShopOrderRefundKind.CARD)
            .reduce((sum, r) => sum + r.amountCents, 0),
          writtenOffCents: plan.writeOffCents,
        },
      });
      return {
        adjustmentId: adjustment.id,
        signed: adjustment.signaturePng !== null,
        released,
        manual,
        manualRefundedCents,
        supplementInvoiceId,
      };
    });

    const cardRefunds = await this.money.afterCommit(
      clubId,
      `commande ${order.id} ajustée`,
      {
        manual: done.manual,
        refunds: plan.refunds,
        reason,
        closed: [
          ...plan.voidInvoiceIds.map((invoiceId) => ({
            invoiceId,
            wasOpen: true,
            status: InvoiceStatus.VOID,
          })),
          ...plan.settleInvoiceIds.map((invoiceId) => ({
            invoiceId,
            wasOpen: true,
            status: InvoiceStatus.PAID,
          })),
        ],
      },
    );

    // Factures restées ouvertes dont le reste dû vient de baisser : une session
    // de paiement déjà ouverte y encaisserait encore l'ancien montant.
    await this.money.expireSessions(
      clubId,
      [...new Set(plan.writeOffs.map((w) => w.invoiceId))].filter(
        (invoiceId) => !plan.settleInvoiceIds.includes(invoiceId),
      ),
    );

    await this.preorders.allocateQuietly(clubId, done.released);

    return {
      order: await this.shop.getOrderAdmin(clubId, order.id),
      adjustmentId: done.adjustmentId,
      cardRefunds,
      manualRefundedCents: done.manualRefundedCents,
      chequesReturned: plan.refunds.filter(
        (r) => r.kind === ShopOrderRefundKind.CHEQUE_RETURN,
      ).length,
      writtenOffCents: plan.writeOffCents,
      supplementInvoiceId: done.supplementInvoiceId,
      supplementCents: plan.supplementCents,
      signed: done.signed,
    };
  }

  /** La commande, la ligne, l'article pris, les factures et le plan, lus au même instant. */
  private async load(clubId: string, input: ShopOrderLineAdjustmentInput) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: input.orderId, clubId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable');
    const line = order.lines.find((l) => l.id === input.lineId);
    if (!line) {
      throw new NotFoundException('Article introuvable dans cette commande.');
    }

    const item = input.newVariantId
      ? await this.shop.findSaleItem(this.prisma, clubId, input.newVariantId)
      : null;
    const newQty = input.newQuantity ?? input.quantity;
    const money = await this.money.loadInvoices(clubId, order.id);

    const plan = planShopOrderAdjustment({
      order: {
        status: order.status,
        fulfilledAt: order.fulfilledAt,
        deliveredAt: order.deliveredAt,
        lines: order.lines.map((l) => ({
          id: l.id,
          label: l.label,
          quantity: l.quantity,
          cancelledQty: l.cancelledQty,
          awaitingStockQty: l.awaitingStockQty,
          variantId: l.variantId,
          unitPriceCents: l.unitPriceCents,
        })),
      },
      lineId: line.id,
      qty: input.quantity,
      exchange: input.newVariantId ? { newQty, item } : null,
      goodsReturned: input.goodsReturned === true,
      goodsLost: input.goodsLost === true,
      invoices: money.planInvoices,
      inFlightCents: money.inFlightCents,
    });

    // Le prix lu pour le plan est dans l'écriture : s'il change avant la
    // confirmation, la différence ne vaut plus et rien n'est écrit.
    const exchange =
      input.newVariantId && item
        ? {
            variantId: item.variantId,
            newQty,
            unitPriceCents: item.unitPriceCents,
          }
        : null;
    return { order, line, money, plan, exchange };
  }
}
