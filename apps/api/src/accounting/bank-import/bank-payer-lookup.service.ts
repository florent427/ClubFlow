import { Injectable, NotFoundException } from '@nestjs/common';
import { FamilyMemberLinkRole, InvoiceStatus, MemberStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { invoicePaymentTotals } from '../../payments/invoice-totals';
import { AUTO_PAYER_CONFIDENCE, matchMemberTransfer } from './member-transfer-matcher';
import type {
  MatchableInvoice,
  MatchablePerson,
  PayerCandidate,
} from './member-transfer-matcher';

/**
 * Qui a pu envoyer ce virement, et quelles factures il solderait
 * (ADR-0014 §7). Lecture seule : ce service ne dépend que de la base, ce qui
 * lui permet de servir la catégorisation AVANT tout appel à l'IA sans
 * entraîner le module des paiements avec lui.
 */
@Injectable()
export class BankPayerLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Payeurs plausibles pour une ligne créditrice, du plus sûr au moins sûr. */
  async payerCandidates(clubId: string, lineId: string): Promise<PayerCandidate[]> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      select: { id: true, label: true, reference: true, amountCents: true, status: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.amountCents <= 0) return [];
    const [people, invoices] = await Promise.all([
      this.people(clubId),
      this.openInvoices(clubId),
    ]);
    return matchMemberTransfer({
      label: line.label,
      reference: line.reference,
      amountCents: line.amountCents,
      people,
      invoices,
    });
  }

  /**
   * Le meilleur candidat, seulement s'il est proposable en un clic : un seul
   * nom reconnu et un montant qui tombe juste. Sert au moment de la
   * catégorisation, avant tout appel à l'IA.
   */
  async autoProposal(clubId: string, lineId: string): Promise<PayerCandidate | null> {
    const candidates = await this.payerCandidates(clubId, lineId);
    const best = candidates[0];
    if (!best || best.confidence < AUTO_PAYER_CONFIDENCE || best.allocations.length === 0) {
      return null;
    }
    return best;
  }

  /** Membres actifs et contacts du club, pour la reconnaissance du nom. */
  private async people(clubId: string): Promise<MatchablePerson[]> {
    const [members, contacts] = await Promise.all([
      this.prisma.member.findMany({
        where: { clubId, status: MemberStatus.ACTIVE },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.contact.findMany({
        where: { clubId },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return [
      ...members.map((m) => ({ kind: 'MEMBER' as const, ...m })),
      ...contacts.map((c) => ({ kind: 'CONTACT' as const, ...c })),
    ];
  }

  /**
   * Factures ouvertes avec leur reste dû et les personnes autorisées à les
   * payer — les mêmes règles de foyer que `recordManualPayment`, pour ne
   * jamais proposer ce qu'il refusera.
   */
  private async openInvoices(clubId: string): Promise<MatchableInvoice[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { clubId, status: InvoiceStatus.OPEN, isCreditNote: false },
      select: {
        id: true,
        label: true,
        amountCents: true,
        dueAt: true,
        familyId: true,
        householdGroupId: true,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    if (invoices.length === 0) return [];
    const ids = invoices.map((i) => i.id);
    const [paid, creditNotes, families] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: ids } },
        _sum: { amountCents: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['parentInvoiceId'],
        where: {
          parentInvoiceId: { in: ids },
          isCreditNote: true,
          status: { not: InvoiceStatus.VOID },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.family.findMany({
        where: { clubId },
        select: {
          id: true,
          householdGroupId: true,
          familyMembers: { select: { memberId: true, contactId: true, linkRole: true } },
        },
      }),
    ]);
    const paidBy = new Map(paid.map((p) => [p.invoiceId, p._sum.amountCents ?? 0]));
    const creditBy = new Map(
      creditNotes.map((c) => [c.parentInvoiceId as string, c._sum.amountCents ?? 0]),
    );
    const payersOfFamily = (familyId: string | null, groupId: string | null): string[] => {
      const scope = groupId
        ? families.filter((f) => f.householdGroupId === groupId)
        : families.filter((f) => f.id === familyId);
      const out = new Set<string>();
      for (const f of scope) {
        for (const m of f.familyMembers) {
          if (m.memberId) out.add(m.memberId);
          // Un contact ne peut payer que s'il est déclaré payeur du foyer.
          if (m.contactId && m.linkRole === FamilyMemberLinkRole.PAYER) out.add(m.contactId);
        }
      }
      return [...out];
    };
    const out: MatchableInvoice[] = [];
    for (const i of invoices) {
      const { balanceCents } = invoicePaymentTotals(
        i.amountCents,
        paidBy.get(i.id) ?? 0,
        creditBy.get(i.id) ?? 0,
        false,
      );
      if (balanceCents <= 0) continue;
      const payerIds = payersOfFamily(i.familyId, i.householdGroupId);
      if (payerIds.length === 0) continue;
      out.push({
        id: i.id,
        label: i.label,
        amountCents: i.amountCents,
        balanceCents,
        dueAt: i.dueAt,
        payerIds,
      });
    }
    return out;
  }
}
