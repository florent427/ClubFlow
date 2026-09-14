import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPreorderService } from '../shop/shop-preorder.service';
import { ShopService } from '../shop/shop.service';
import { ShopOrderMoneyService } from './shop-order-money.service';
import {
  planShopOrderCancellation,
  ShopOrderRefundKind,
} from './shop-order-refund-plan';

/**
 * « Annuler et rembourser » une commande boutique (ADR-0019).
 *
 * Vit dans le module paiements parce que le sens de dépendance est celui-là :
 * les paiements connaissent la boutique, jamais l'inverse. La boutique garde
 * la commande et le stock (`ShopService.cancelWithReturnInTx`), l'argent passe
 * par `ShopOrderMoneyService`, sur toutes les factures de la commande — la
 * sienne et celles du reste à payer d'un échange (ADR-0020).
 *
 * UNE transaction porte tout ce qui doit vivre ou mourir ensemble :
 * l'annulation de la commande, le stock, les chèques rendus, les paiements
 * négatifs et leurs avoirs, les avoirs d'annulation ou l'annulation des
 * factures. Tout ce qui parle à l'extérieur, ou peut échouer sans fausser ces
 * écritures, vient APRÈS le commit : contre-passations, remboursements carte,
 * échéanciers et sessions de paiement, attribution des précommandes.
 */
@Injectable()
export class ShopOrderRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly money: ShopOrderMoneyService,
    private readonly preorders: ShopPreorderService,
  ) {}

  /** Ce que ferait l'annulation, sans rien écrire. */
  async preview(clubId: string, orderId: string) {
    const { plan } = await this.load(clubId, orderId);
    return {
      blockers: plan.blockers,
      delivered: plan.delivered,
      exited: plan.exited,
      refunds: plan.refunds.map((r) => ({
        kind: r.kind,
        paymentId: r.paymentId,
        amountCents: r.amountCents,
        chequeNumber: r.chequeNumber,
      })),
      writeOffCents: plan.writeOffCents,
      voidInvoice: plan.voidInvoice,
      lines: plan.lines,
    };
  }

  async cancelAndRefund(
    clubId: string,
    userId: string,
    input: {
      orderId: string;
      reason: string;
      goodsReturned?: boolean | null;
      lostLineIds?: string[] | null;
    },
  ) {
    const reason = input.reason.trim();
    if (!reason) {
      throw new BadRequestException(
        'Indique le motif de l’annulation : il figure sur les avoirs.',
      );
    }
    const { order, invoices, plan } = await this.load(clubId, input.orderId);
    if (plan.blockers.length > 0) {
      throw new BadRequestException(plan.blockers.join(' '));
    }

    const done = await this.prisma.$transaction(async (tx) => {
      // L'état lu pour le plan est dans l'écriture conditionnelle : si la
      // commande a changé depuis, rien n'est écrit.
      const { released } = await this.shop.cancelWithReturnInTx(
        tx,
        clubId,
        userId,
        {
          orderId: order.id,
          reason,
          goodsReturned: input.goodsReturned === true,
          lostLineIds: input.lostLineIds ?? [],
          expected: {
            status: order.status,
            fulfilled: order.fulfilledAt !== null,
            delivered: order.deliveredAt !== null,
          },
        },
      );
      if (invoices.length === 0) return { released, manual: [] };

      // Un encaissement, un avoir ou une facture arrivés depuis la lecture
      // changeraient le plan.
      await this.money.assertUnchangedInTx(tx, clubId, order.id, invoices);
      const manual = await this.money.applyInTx(tx, clubId, invoices, plan, {
        refund: `Remboursement — ${reason}`,
        writeOff: `Annulation de la commande — ${reason}`,
        voidReason: `Commande annulée : ${reason}`,
        chequeNote: `Rendu à l’adhérent : commande annulée — ${reason}`,
      });
      return { released, manual };
    });

    const cardRefunds = await this.money.afterCommit(
      clubId,
      `commande ${order.id} annulée`,
      {
        manual: done.manual,
        refunds: plan.refunds,
        reason,
        closed: invoices.map((inv) => ({
          invoiceId: inv.id,
          wasOpen: inv.status === InvoiceStatus.OPEN,
          status: InvoiceStatus.VOID,
        })),
      },
    );

    await this.preorders.allocateQuietly(clubId, done.released);

    return {
      order: await this.shop.getOrderAdmin(clubId, order.id),
      cardRefunds,
      manualRefundedCents: done.manual.reduce((sum, m) => sum + m.amountCents, 0),
      chequesReturned: plan.refunds.filter(
        (r) => r.kind === ShopOrderRefundKind.CHEQUE_RETURN,
      ).length,
      writtenOffCents: plan.writeOffCents,
      invoiceVoided: plan.voidInvoice,
    };
  }

  /**
   * Annulation sans remboursement : commande en attente, sans aucun
   * encaissement — les gardes sont celles de `ShopService.cancelOrder`. Après
   * le commit, les factures annulées perdent leur session de paiement et leur
   * échéancier, comme à l'annulation par l'adhérent.
   */
  async cancelUnpaid(clubId: string, orderId: string) {
    const { invoices } = await this.money.loadInvoices(clubId, orderId);
    const order = await this.shop.cancelOrder(clubId, orderId);
    for (const inv of invoices) {
      await this.money.closeInvoice(
        clubId,
        inv.id,
        inv.status === InvoiceStatus.OPEN,
        InvoiceStatus.VOID,
      );
    }
    return order;
  }

  /** La commande, ses factures et le plan, lus au même instant. */
  private async load(clubId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const { invoices, planInvoices, inFlightCents } =
      await this.money.loadInvoices(clubId, orderId);

    const plan = planShopOrderCancellation({
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
        })),
      },
      invoices: planInvoices,
      inFlightCents,
    });
    return { order, invoices, plan };
  }
}
