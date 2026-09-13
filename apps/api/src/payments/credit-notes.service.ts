import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Émission d'un avoir, quel que soit son déclencheur.
 *
 * Deux chemins y mènent — le geste manuel du trésorier et le remboursement
 * Stripe — et ils doivent produire EXACTEMENT le même objet. Une divergence
 * entre les deux se paierait en écritures comptables manquantes ou en avoirs
 * orphelins de leur foyer, deux défauts invisibles jusqu'à la clôture.
 *
 * Trois choses sont faciles à oublier en réécrivant la création à la main, et
 * c'est précisément pour ça qu'elles vivent ici :
 *  - l'héritage du foyer (`familyId`, `householdGroupId`, `clubSeasonId`),
 *    sans lequel l'avoir n'apparaît dans aucune vue de facturation famille ;
 *  - la contre-passation comptable, sans laquelle l'avoir est un document
 *    sans effet sur les comptes ;
 *  - le plafond au montant de la facture parente.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Crée l'avoir et déclenche sa contre-passation comptable.
   *
   * `tx` permet à l'appelant d'inscrire l'avoir dans SA transaction — le
   * remboursement en a besoin, l'avoir et le Payment négatif devant vivre ou
   * mourir ensemble. La contre-passation, elle, a lieu APRÈS le commit : un
   * plan comptable incomplet ne doit pas annuler un remboursement déjà versé.
   */
  async create(args: {
    clubId: string;
    parentInvoiceId: string;
    reason: string;
    amountCents?: number | null;
    tx?: Prisma.TransactionClient;
  }) {
    const db = args.tx ?? this.prisma;

    const parent = await db.invoice.findFirst({
      where: { id: args.parentInvoiceId, clubId: args.clubId },
    });
    if (!parent) {
      throw new NotFoundException('Facture parente introuvable');
    }
    if (parent.isCreditNote) {
      throw new BadRequestException('Impossible de créer un avoir sur un avoir.');
    }

    const amount = args.amountCents ?? parent.amountCents;
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (amount > parent.amountCents) {
      throw new BadRequestException(
        "Le montant de l'avoir ne peut excéder celui de la facture.",
      );
    }
    const trimmedReason = args.reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Motif obligatoire pour un avoir.');
    }

    const creditNote = await db.invoice.create({
      data: {
        clubId: args.clubId,
        // Hérité de la parente : sans ça l'avoir est orphelin du foyer et
        // n'apparaît dans aucune vue de facturation famille.
        familyId: parent.familyId,
        householdGroupId: parent.householdGroupId,
        clubSeasonId: parent.clubSeasonId,
        label: `Avoir — ${parent.label}`,
        baseAmountCents: amount,
        amountCents: amount,
        // Document final, non modifiable.
        status: InvoiceStatus.PAID,
        isCreditNote: true,
        parentInvoiceId: parent.id,
        creditNoteReason: trimmedReason,
      },
    });

    return creditNote;
  }

  /**
   * Contre-passation comptable de l'avoir. Séparée de `create` pour pouvoir
   * être appelée APRÈS le commit de la transaction de l'appelant.
   *
   * Silencieuse si le module comptable du club est désactivé.
   */
  async recordAccounting(
    clubId: string,
    creditNoteId: string,
    /**
     * Encaissement que cet avoir rembourse, quand il en désigne un. Sans lui,
     * la contre-passation retiendrait l'encaissement le plus RÉCENT de la
     * facture — pas nécessairement celui remboursé, ni sur le même compte.
     */
    sourcePaymentId?: string | null,
    /** Compte d'où l'argent est rendu, s'il diffère de l'encaissement. */
    refundFinancialAccountId?: string | null,
  ): Promise<void> {
    await this.accounting.createContraEntryForCreditNote(
      clubId,
      creditNoteId,
      sourcePaymentId,
      refundFinancialAccountId,
    );
  }
}
