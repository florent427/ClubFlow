import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readPayerCredit, type PayerCreditBalance } from './payer-credit-balance';
import {
  resolvePayerCreditHolder,
  type PayerCreditHolder,
  type PayerCreditHolderRef,
} from './payer-credit-holder';

export type { PayerCreditDeposit, PayerCreditUse } from './payer-credit-balance';

export type PayerCredit = PayerCreditBalance & { holder: PayerCreditHolder };

/** Le crédit d'une personne d'un foyer, sur une ligne. */
export type FamilyPayerCredit = {
  memberId: string | null;
  contactId: string | null;
  displayName: string;
  balanceCents: number;
};

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

  /**
   * Les crédits des personnes d'un foyer, une ligne par personne (ADR-0022,
   * §1) : le foyer ne possède pas de crédit, il affiche ceux de ses personnes.
   * Le membre et le contact d'un même compte font une seule ligne. Un crédit nul
   * est omis ; un crédit négatif reste, car il est à régulariser.
   */
  async familyCredits(
    clubId: string,
    familyId: string,
  ): Promise<FamilyPayerCredit[]> {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, clubId },
      select: { id: true },
    });
    if (!family) {
      throw new NotFoundException('Foyer introuvable pour ce club.');
    }
    const links = await this.prisma.familyMember.findMany({
      where: { familyId: family.id },
      orderBy: { createdAt: 'asc' },
      select: { memberId: true, contactId: true },
    });
    const refs: PayerCreditHolderRef[] = links.flatMap((link) => [
      ...(link.memberId ? [{ memberId: link.memberId }] : []),
      ...(link.contactId ? [{ contactId: link.contactId }] : []),
    ]);

    const lines: FamilyPayerCredit[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      let holder: PayerCreditHolder;
      try {
        holder = await resolvePayerCreditHolder(this.prisma, clubId, ref);
      } catch (err) {
        // Une fiche d'un autre club n'a pas de crédit ici.
        if (err instanceof NotFoundException) continue;
        throw err;
      }
      if (seen.has(holder.personKey)) continue;
      seen.add(holder.personKey);
      const { balanceCents } = await readPayerCredit(this.prisma, clubId, holder);
      if (balanceCents === 0) continue;
      lines.push({
        memberId: holder.memberId,
        contactId: holder.contactId,
        displayName: holder.displayName,
        balanceCents,
      });
    }
    return lines;
  }
}
