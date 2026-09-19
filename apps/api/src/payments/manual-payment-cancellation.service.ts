import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoicePurpose,
  InvoiceStatus,
  type Payment,
  Prisma,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveInvoiceBalance } from './invoice-balance';
import { lockInvoiceInTx } from './settlement-locks';

/** Les encaissements qu'un admin saisit à la main, et donc peut mal saisir. */
const MANUAL_METHODS: ReadonlySet<ClubPaymentMethod> = new Set([
  ClubPaymentMethod.MANUAL_CASH,
  ClubPaymentMethod.MANUAL_CHECK,
  ClubPaymentMethod.MANUAL_TRANSFER,
]);

/**
 * Annuler un encaissement saisi par erreur : mauvais montant, mauvaise facture.
 *
 * Le 2026-09-19, un chèque de 91,50 € a été saisi à 366 € en prod, et
 * l'application n'offrait aucun moyen de le reprendre : la fiche du chèque ne
 * change pas de montant, l'annulation d'un chèque ne vaut que hors facture, et
 * un remboursement émet un avoir, qui éteint la dette restante.
 *
 * Une annulation dit que l'argent n'a JAMAIS été reçu :
 * - une ligne négative, rattachée à l'encaissement (`refundedPaymentId`) et
 *   portant le motif (`cancellationReason`), remet le reste dû ;
 * - aucun avoir : la dette de la facture reste entière ;
 * - la recette est contre-passée, dans la même transaction ;
 * - un chèque encore en portefeuille est annulé, hors de toute remise.
 *
 * Tout se décide sous le verrou de la facture (ADR-0022, §3) : un
 * encaissement, une imputation ou une autre annulation en cours attend.
 */
@Injectable()
export class ManualPaymentCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async cancel(
    clubId: string,
    userId: string,
    paymentId: string,
    reason: string,
  ): Promise<Payment> {
    const motif = reason.trim();
    if (!motif) {
      throw new BadRequestException(
        'Motif requis : dis pourquoi cet encaissement est annulé.',
      );
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, clubId },
      include: { invoice: true, cheque: true },
    });
    if (!payment) {
      throw new NotFoundException('Encaissement introuvable');
    }
    if (!MANUAL_METHODS.has(payment.method)) {
      throw new BadRequestException(
        'Seul un encaissement saisi à la main (espèces, chèque, virement) s’annule ici. Un paiement par carte se rembourse.',
      );
    }
    if (payment.amountCents <= 0) {
      throw new BadRequestException(
        'Cette ligne est déjà une annulation ou un remboursement.',
      );
    }
    // Avant l'état du chèque : un chèque annulé avec sa saisie n'est plus en
    // portefeuille, et le dire serait trompeur. Relu sous le verrou, plus bas.
    await this.assertNotAlreadyCancelled(this.prisma, clubId, payment.id);
    const invoice = payment.invoice;
    if (invoice.isCreditNote || invoice.purpose !== InvoicePurpose.CHARGE) {
      throw new BadRequestException(
        'Une avance ne s’annule pas ici : rembourse-la depuis son reçu.',
      );
    }
    if (invoice.shopOrderId) {
      throw new BadRequestException(
        'L’encaissement d’une commande boutique s’annule avec la commande, depuis la Boutique.',
      );
    }
    if (
      payment.cheque &&
      (payment.cheque.status !== ChequeStatus.PENDING ||
        payment.cheque.depositId !== null)
    ) {
      throw new BadRequestException(
        'Ce chèque n’est plus en portefeuille : annule d’abord sa remise en banque.',
      );
    }
    const recette = await this.accounting.paymentIncomeEntryState(
      clubId,
      payment.id,
    );
    if (recette?.blockedBecause) {
      throw new BadRequestException(recette.blockedBecause);
    }

    return this.prisma.$transaction(async (tx) => {
      await lockInvoiceInTx(tx, invoice.id);

      // Sous le verrou : une annulation ou un remboursement commité pendant
      // les contrôles se voit ici.
      await this.assertNotAlreadyCancelled(tx, clubId, payment.id);

      if (payment.cheque) {
        // Conditionnel : une remise créée pendant les contrôles le fait
        // échouer, et tout est annulé.
        const n = await tx.cheque.updateMany({
          where: {
            id: payment.cheque.id,
            clubId,
            status: ChequeStatus.PENDING,
            depositId: null,
          },
          data: {
            status: ChequeStatus.CANCELLED,
            notes: payment.cheque.notes
              ? `${payment.cheque.notes}\nSaisie annulée : ${motif}`
              : `Saisie annulée : ${motif}`,
          },
        });
        if (n.count !== 1) {
          throw new BadRequestException(
            'Ce chèque vient d’être remis en banque : il ne s’annule plus ici.',
          );
        }
      }

      const annulation = await tx.payment.create({
        data: {
          clubId,
          invoiceId: invoice.id,
          amountCents: -payment.amountCents,
          method: payment.method,
          externalRef: payment.externalRef,
          paidByMemberId: payment.paidByMemberId,
          paidByContactId: payment.paidByContactId,
          financialAccountId: payment.financialAccountId,
          refundedPaymentId: payment.id,
          recordedByUserId: userId,
          cancellationReason: motif,
        },
      });

      // Le reste dû revient : une facture soldée redevient à payer.
      const balance = await resolveInvoiceBalance(tx, invoice.id, clubId);
      if (balance.status === InvoiceStatus.PAID && balance.balanceCents > 0) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.OPEN },
        });
      }

      // La recette part avec l'encaissement, ou rien ne part : une période
      // close fait échouer la contre-passation, et tout est annulé.
      if (recette) {
        await this.accounting.createContraEntry(
          clubId,
          userId,
          recette.entryId,
          `Annulation d’encaissement : ${motif}`,
          tx,
        );
      }
      return annulation;
    });
  }

  /** Une ligne négative rattachée à cet encaissement : annulé ou remboursé. */
  private async assertNotAlreadyCancelled(
    reader: Pick<Prisma.TransactionClient, 'payment'>,
    clubId: string,
    paymentId: string,
  ): Promise<void> {
    const deja = await reader.payment.findFirst({
      where: { clubId, refundedPaymentId: paymentId },
      select: { id: true },
    });
    if (deja) {
      throw new BadRequestException(
        'Cet encaissement a déjà été annulé ou remboursé.',
      );
    }
  }
}
