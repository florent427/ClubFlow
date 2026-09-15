import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readPayerCredit, type PayerCreditBalance } from './payer-credit-balance';
import {
  resolvePayerCreditHolder,
  type PayerCreditHolder,
  type PayerCreditHolderRef,
} from './payer-credit-holder';

export type { PayerCreditDeposit, PayerCreditUse } from './payer-credit-balance';

export type PayerCredit = PayerCreditBalance & { holder: PayerCreditHolder };

/**
 * Crédit d'une personne (ADR-0022, §4) : calculé à partir des paiements, stocké
 * nulle part. Les paiements tracent déjà chaque mouvement, sur tous les
 * chemins ; une colonne de solde serait une seconde vérité à tenir à jour.
 *
 * La formule vit dans `readPayerCredit`, seule fonction qui calcule le crédit :
 * l'admin la lit ici, l'imputation la relit sous verrou.
 */
@Injectable()
export class PayerCreditService {
  constructor(private readonly prisma: PrismaService) {}

  async credit(clubId: string, ref: PayerCreditHolderRef): Promise<PayerCredit> {
    const holder = await resolvePayerCreditHolder(this.prisma, clubId, ref);
    return { holder, ...(await readPayerCredit(this.prisma, clubId, holder)) };
  }
}
