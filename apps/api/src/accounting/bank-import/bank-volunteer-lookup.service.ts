import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VolunteerAdvancesService } from '../volunteers/volunteer-advances.service';
import {
  AUTO_VOLUNTEER_CONFIDENCE,
  matchVolunteerRefund,
  type VolunteerRefundCandidate,
} from './volunteer-refund-matcher';

/**
 * Qui cette sortie d'argent rembourse-t-elle, et quels reçus solde-t-elle
 * (ADR-0016) ?
 *
 * Le pendant de `BankPayerLookupService` pour les lignes débitrices. Lecture
 * seule : il sert la catégorisation AVANT tout appel à l'IA, et une dépense
 * qui rembourse un bénévole n'a rien à faire dans une charge générique.
 */
@Injectable()
export class BankVolunteerLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volunteers: VolunteerAdvancesService,
  ) {}

  /** Bénévoles plausibles pour une ligne débitrice, du plus sûr au moins sûr. */
  async refundCandidates(clubId: string, lineId: string): Promise<VolunteerRefundCandidate[]> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      select: { label: true, reference: true, amountCents: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    // Un remboursement fait SORTIR l'argent : une ligne créditrice n'en est
    // pas un.
    if (line.amountCents >= 0) return [];
    const balances = await this.volunteers.openReceiptsByMember(clubId);
    if (balances.length === 0) return [];
    return matchVolunteerRefund({
      label: line.label,
      reference: line.reference,
      amountCents: Math.abs(line.amountCents),
      balances,
    });
  }

  /**
   * Le meilleur candidat, seulement s'il est proposable en un clic : un seul
   * bénévole reconnu et des reçus qui tombent juste.
   */
  async autoProposal(clubId: string, lineId: string): Promise<VolunteerRefundCandidate | null> {
    const candidates = await this.refundCandidates(clubId, lineId);
    const best = candidates[0];
    if (!best || best.confidence < AUTO_VOLUNTEER_CONFIDENCE || best.entryIds.length === 0) {
      return null;
    }
    return best;
  }
}
