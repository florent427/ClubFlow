import { Injectable } from '@nestjs/common';
import { ClubPaymentMethod, InvoicePurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolvePayerCreditHolder,
  type PayerCreditHolder,
  type PayerCreditHolderRef,
} from './payer-credit-holder';

export type PayerCreditDeposit = {
  invoiceId: string;
  label: string;
  createdAt: Date;
  /** Net versé sur le reçu : un remboursement y compte en négatif. */
  amountCents: number;
  payments: Array<{
    id: string;
    amountCents: number;
    method: ClubPaymentMethod;
    externalRef: string | null;
    createdAt: Date;
  }>;
};

export type PayerCredit = {
  holder: PayerCreditHolder;
  balanceCents: number;
  deposits: PayerCreditDeposit[];
};

/**
 * Crédit d'une personne (ADR-0022, §4) : calculé à partir des paiements, stocké
 * nulle part. Les paiements tracent déjà chaque mouvement, sur tous les
 * chemins ; une colonne de solde serait une seconde vérité à tenir à jour.
 *
 * C'est la SEULE fonction qui calcule le crédit. L'admin l'appelle, le portail
 * et l'utilisation du crédit l'appelleront (lots 2 et 3).
 */
@Injectable()
export class PayerCreditService {
  constructor(private readonly prisma: PrismaService) {}

  async credit(clubId: string, ref: PayerCreditHolderRef): Promise<PayerCredit> {
    const holder = await resolvePayerCreditHolder(this.prisma, clubId, ref);
    const receipts = await this.prisma.invoice.findMany({
      where: {
        clubId,
        purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
        OR: [
          { payerCreditMemberId: { in: holder.memberIds } },
          { payerCreditContactId: { in: holder.contactIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amountCents: true,
            method: true,
            externalRef: true,
            createdAt: true,
          },
        },
      },
    });
    const deposits = receipts.map((r) => ({
      invoiceId: r.id,
      label: r.label,
      createdAt: r.createdAt,
      amountCents: r.payments.reduce((sum, p) => sum + p.amountCents, 0),
      payments: r.payments,
    }));
    return {
      holder,
      balanceCents: deposits.reduce((sum, d) => sum + d.amountCents, 0),
      deposits,
    };
  }
}
