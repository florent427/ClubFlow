import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChequeStatus, ClubPaymentMethod, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPreorderService } from '../shop/shop-preorder.service';
import { ShopService } from '../shop/shop.service';
import { CreditNotesService } from './credit-notes.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import {
  planShopOrderCancellation,
  ShopOrderRefundKind,
} from './shop-order-refund-plan';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeRefundsService } from './stripe-refunds.service';

/** Méthode du paiement négatif, selon la façon dont l'argent est rendu. */
const REFUND_METHOD: Record<
  Exclude<ShopOrderRefundKind, ShopOrderRefundKind.CARD>,
  ClubPaymentMethod
> = {
  [ShopOrderRefundKind.CASH]: ClubPaymentMethod.MANUAL_CASH,
  [ShopOrderRefundKind.TRANSFER]: ClubPaymentMethod.MANUAL_TRANSFER,
  [ShopOrderRefundKind.CHEQUE_RETURN]: ClubPaymentMethod.MANUAL_CHECK,
  [ShopOrderRefundKind.CHEQUE_DEPOSITED]: ClubPaymentMethod.MANUAL_TRANSFER,
};

/**
 * « Annuler et rembourser » une commande boutique (ADR-0019).
 *
 * Vit dans le module paiements parce que le sens de dépendance est celui-là :
 * les paiements connaissent la boutique, jamais l'inverse. La boutique garde
 * la commande et le stock (`ShopService.cancelWithReturnInTx`), ce service
 * compose l'argent autour, avec les mécanismes existants — l'avoir
 * (`CreditNotesService`) et le remboursement Stripe (`StripeRefundsService`).
 *
 * UNE transaction porte tout ce qui doit vivre ou mourir ensemble :
 * l'annulation de la commande, le stock, les chèques rendus, les paiements
 * négatifs et leurs avoirs, l'avoir d'annulation ou l'annulation de la
 * facture. Tout ce qui parle à l'extérieur, ou peut échouer sans fausser ces
 * écritures, vient APRÈS le commit : contre-passations, remboursements carte,
 * clôture de l'échéancier, expiration de la session de paiement, attribution
 * des précommandes.
 */
@Injectable()
export class ShopOrderRefundsService {
  private readonly logger = new Logger(ShopOrderRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly creditNotes: CreditNotesService,
    private readonly stripeRefunds: StripeRefundsService,
    private readonly scheduleEngine: PaymentScheduleEngineService,
    private readonly stripeCheckout: StripeCheckoutService,
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
    const { order, invoice, plan, creditNotesCents } = await this.load(
      clubId,
      input.orderId,
    );
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

      const manual: Array<{
        creditNoteId: string;
        sourcePaymentId: string;
        refundFinancialAccountId: string | null;
        amountCents: number;
      }> = [];
      if (!invoice) return { released, manual };

      // Un encaissement arrivé depuis la lecture changerait le plan : il
      // resterait sans remboursement sur une commande annulée.
      const paymentsNow = await tx.payment.count({
        where: { invoiceId: invoice.id, clubId },
      });
      if (paymentsNow !== invoice.payments.length) {
        throw new BadRequestException(
          'Un règlement vient d’être enregistré sur cette commande : recharge la page avant de l’annuler.',
        );
      }
      // Même garde pour les avoirs : un avoir émis entre-temps fausserait le
      // reste dû, et les avoirs dépasseraient la facture.
      const creditNotesNow = await tx.invoice.aggregate({
        where: {
          parentInvoiceId: invoice.id,
          clubId,
          isCreditNote: true,
          status: { not: InvoiceStatus.VOID },
        },
        _sum: { amountCents: true },
      });
      if ((creditNotesNow._sum.amountCents ?? 0) !== creditNotesCents) {
        throw new BadRequestException(
          'Un avoir vient d’être émis sur cette commande : recharge la page avant de l’annuler.',
        );
      }

      for (const action of plan.refunds) {
        if (action.kind === ShopOrderRefundKind.CARD) continue;
        const original = invoice.payments.find((p) => p.id === action.paymentId);
        if (!original) {
          throw new Error(`Encaissement ${action.paymentId} absent de la facture.`);
        }

        if (action.kind === ShopOrderRefundKind.CHEQUE_RETURN) {
          // Même garde que la remise en banque, dans l'autre sens : un chèque
          // remis entre-temps ne se rend plus, et tout est annulé.
          const returned = await tx.cheque.updateMany({
            where: {
              id: action.chequeId!,
              clubId,
              status: ChequeStatus.PENDING,
              depositId: null,
            },
            data: {
              status: ChequeStatus.CANCELLED,
              notes: `Rendu à l’adhérent : commande annulée — ${reason}`,
            },
          });
          if (returned.count !== 1) {
            throw new BadRequestException(
              `Le chèque ${action.chequeNumber ? `n° ${action.chequeNumber} ` : ''}vient d’être remis en banque : recharge la page avant d’annuler.`,
            );
          }
        }

        await tx.payment.create({
          data: {
            clubId,
            invoiceId: invoice.id,
            amountCents: -action.amountCents,
            method: REFUND_METHOD[action.kind],
            refundedPaymentId: original.id,
            financialAccountId:
              action.bankAccountId ?? original.financialAccountId,
            paidByMemberId: original.paidByMemberId,
            paidByContactId: original.paidByContactId,
          },
        });
        // L'avoir du montant rendu (ADR-0011) : sans lui, la facture
        // redeviendrait due de ce que l'on vient de rendre.
        const creditNote = await this.creditNotes.create({
          tx,
          clubId,
          parentInvoiceId: invoice.id,
          amountCents: action.amountCents,
          reason: `Remboursement — ${reason}`,
        });
        manual.push({
          creditNoteId: creditNote.id,
          sourcePaymentId: original.id,
          refundFinancialAccountId: action.bankAccountId,
          amountCents: action.amountCents,
        });
      }

      if (plan.writeOffCents > 0) {
        // Jamais encaissé, donc jamais constaté en comptabilité : cet avoir
        // n'appelle aucune contre-passation.
        await this.creditNotes.create({
          tx,
          clubId,
          parentInvoiceId: invoice.id,
          amountCents: plan.writeOffCents,
          reason: `Annulation de la commande — ${reason}`,
        });
      }
      if (plan.voidInvoice) {
        await tx.invoice.updateMany({
          where: {
            id: invoice.id,
            clubId,
            status: InvoiceStatus.OPEN,
            payments: { none: {} },
          },
          data: {
            status: InvoiceStatus.VOID,
            voidReason: `Commande annulée : ${reason}`,
          },
        });
      }
      return { released, manual };
    });

    // --- Après le commit ---

    for (const m of done.manual) {
      await this.creditNotes
        .recordAccounting(
          clubId,
          m.creditNoteId,
          m.sourcePaymentId,
          m.refundFinancialAccountId,
        )
        .catch((err: Error) => {
          this.logger.warn(
            `[boutique] contre-passation impossible pour l’avoir ${m.creditNoteId} — ${err.message}`,
          );
        });
    }

    // Remboursements carte : l'argent part de Stripe, l'enregistrement arrive
    // par le webhook (ADR-0011). Un refus ne défait pas l'annulation : il est
    // rendu à l'admin, qui relance depuis la facture.
    const cardRefunds: Array<{
      paymentId: string;
      amountCents: number;
      ok: boolean;
      error: string | null;
    }> = [];
    for (const action of plan.refunds) {
      if (action.kind !== ShopOrderRefundKind.CARD) continue;
      try {
        const res = await this.stripeRefunds.refundPayment({
          clubId,
          paymentId: action.paymentId,
          amountCents: null,
          reason,
        });
        cardRefunds.push({
          paymentId: action.paymentId,
          amountCents: res.amountCents,
          ok: true,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[boutique] commande ${order.id} annulée, mais le remboursement carte de l’encaissement ${action.paymentId} a échoué : ${message}`,
        );
        cardRefunds.push({
          paymentId: action.paymentId,
          amountCents: action.amountCents,
          ok: false,
          error: message,
        });
      }
    }

    if (invoice) {
      await this.closeInvoiceAfterCancel(
        clubId,
        invoice.id,
        invoice.status === InvoiceStatus.OPEN,
      );
    }

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
   * le commit, la facture annulée perd sa session de paiement et son
   * échéancier, comme à l'annulation par l'adhérent.
   */
  async cancelUnpaid(clubId: string, orderId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { shopOrderId: orderId, clubId },
      select: { id: true, status: true },
    });
    const order = await this.shop.cancelOrder(clubId, orderId);
    if (invoice) {
      await this.closeInvoiceAfterCancel(
        clubId,
        invoice.id,
        invoice.status === InvoiceStatus.OPEN,
      );
    }
    return order;
  }

  /**
   * Ce qui suit l'annulation d'une facture, hors transaction : ni l'un ni
   * l'autre ne peut défaire une annulation déjà commitée, mais chaque échec se
   * dit — une session restée ouverte permettrait de payer une commande annulée.
   */
  private async closeInvoiceAfterCancel(
    clubId: string,
    invoiceId: string,
    wasOpen: boolean,
  ): Promise<void> {
    try {
      await this.scheduleEngine.closeScheduleForInvoice(
        invoiceId,
        InvoiceStatus.VOID,
      );
    } catch (err) {
      this.logger.error(
        `[boutique] échéancier de la facture ${invoiceId} non clôturé après annulation — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!wasOpen) return;
    try {
      await this.stripeCheckout.expireCheckoutSessionForInvoice(clubId, invoiceId);
    } catch (err) {
      this.logger.error(
        `[boutique] session de paiement de la facture ${invoiceId} non fermée après annulation : elle peut rester PAYABLE — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** La commande, sa facture et le plan, lus au même instant. */
  private async load(clubId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const invoice = await this.prisma.invoice.findFirst({
      where: { shopOrderId: orderId, clubId },
      include: {
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            cheque: {
              select: {
                id: true,
                number: true,
                status: true,
                depositId: true,
                deposit: { select: { financialAccountId: true } },
              },
            },
          },
        },
      },
    });
    const creditNotesCents = invoice
      ? ((
          await this.prisma.invoice.aggregate({
            where: {
              parentInvoiceId: invoice.id,
              clubId,
              isCreditNote: true,
              status: { not: InvoiceStatus.VOID },
            },
            _sum: { amountCents: true },
          })
        )._sum.amountCents ?? 0)
      : 0;
    const inFlightCents = invoice
      ? await this.scheduleEngine.sumInFlightForInvoice(invoice.id)
      : 0;

    const plan = planShopOrderCancellation({
      order: {
        status: order.status,
        fulfilledAt: order.fulfilledAt,
        deliveredAt: order.deliveredAt,
        lines: order.lines.map((l) => ({
          id: l.id,
          label: l.label,
          quantity: l.quantity,
          awaitingStockQty: l.awaitingStockQty,
          variantId: l.variantId,
        })),
      },
      invoice: invoice
        ? {
            status: invoice.status,
            amountCents: invoice.amountCents,
            creditNotesCents,
            payments: invoice.payments.map((p) => ({
              id: p.id,
              amountCents: p.amountCents,
              method: p.method,
              externalRef: p.externalRef,
              refundedPaymentId: p.refundedPaymentId,
              cheque: p.cheque
                ? {
                    id: p.cheque.id,
                    number: p.cheque.number,
                    status: p.cheque.status,
                    depositId: p.cheque.depositId,
                    depositAccountId: p.cheque.deposit?.financialAccountId ?? null,
                  }
                : null,
            })),
          }
        : null,
      inFlightCents,
    });
    return { order, invoice, plan, creditNotesCents };
  }
}
