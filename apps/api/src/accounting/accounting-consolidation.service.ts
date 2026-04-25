import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryStatus,
  AccountingLineSide,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingAuditService } from './accounting-audit.service';

/**
 * Aperçu d'éligibilité de la consolidation pour une entry donnée.
 * Permet à l'UI d'afficher un bandeau "Regrouper les lignes identiques ?"
 * uniquement quand c'est pertinent.
 */
export interface ConsolidationPreview {
  eligible: boolean;
  reason: string | null;
  groups: Array<{
    accountCode: string;
    accountLabel: string;
    lineCount: number;
    totalCents: number;
  }>;
}

/**
 * Service responsable de la consolidation **opt-in** des lignes d'une
 * écriture multi-articles. Cas d'usage typique : note de restaurant avec
 * 6 plats tous catégorisés en `625700 Réceptions` → l'utilisateur clique
 * "Regrouper" → 1 seule ligne 625700 totale conservant la trace des
 * articles fusionnés (`mergedFromArticleLabels`).
 *
 * Garde-fous (tous appliqués dans `consolidate()`) :
 *  - Status doit être NEEDS_REVIEW (pas POSTED/LOCKED/CANCELLED).
 *  - Aucune ligne ne doit être déjà validée (sinon perte d'audit).
 *  - Toutes les lignes article doivent être catégorisées (IA terminée).
 *  - Les allocations analytiques d'un groupe doivent être identiques
 *    sinon le groupe n'est pas consolidable (skip).
 *
 * `unconsolidate()` restaure les lignes/allocations depuis le snapshot
 * JSON sauvegardé sur l'entry.
 */
@Injectable()
export class AccountingConsolidationService {
  private readonly logger = new Logger(AccountingConsolidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
  ) {}

  // ==========================================================================
  // Aperçu (pour UI : afficher ou non le bandeau)
  // ==========================================================================

  async preview(clubId: string, entryId: string): Promise<ConsolidationPreview> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { clubId, id: entryId },
      include: {
        lines: {
          include: { allocations: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!entry) {
      return { eligible: false, reason: 'Écriture introuvable', groups: [] };
    }
    if (entry.consolidatedAt) {
      return {
        eligible: false,
        reason: 'Écriture déjà consolidée',
        groups: [],
      };
    }
    if (entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      return {
        eligible: false,
        reason: 'L’écriture doit être en revue (NEEDS_REVIEW).',
        groups: [],
      };
    }

    const articleLines = entry.lines.filter((l) => !this.isCounterpartyCode(l.accountCode));
    if (articleLines.length < 2) {
      return {
        eligible: false,
        reason: 'Une seule ligne — rien à regrouper.',
        groups: [],
      };
    }

    // Refus si une ligne déjà validée (perte de signal de validation user)
    if (articleLines.some((l) => l.validatedAt)) {
      return {
        eligible: false,
        reason:
          'Au moins une ligne est déjà validée. Dé-valider d’abord pour pouvoir regrouper.',
        groups: [],
      };
    }

    // Refus si IA pas finie sur toutes les lignes
    const aiUnfinished = articleLines.find(
      (l) => l.iaConfidencePct === null && l.iaSuggestedAccountCode === null,
    );
    if (aiUnfinished) {
      return {
        eligible: false,
        reason: 'IA encore en cours sur certaines lignes.',
        groups: [],
      };
    }

    // Groupement par accountCode
    const groupMap = new Map<
      string,
      { accountLabel: string; lineCount: number; totalCents: number }
    >();
    for (const l of articleLines) {
      const amt = l.debitCents || l.creditCents;
      const ex = groupMap.get(l.accountCode);
      if (ex) {
        ex.lineCount++;
        ex.totalCents += amt;
      } else {
        groupMap.set(l.accountCode, {
          accountLabel: l.accountLabel,
          lineCount: 1,
          totalCents: amt,
        });
      }
    }
    const groups = Array.from(groupMap.entries()).map(([code, g]) => ({
      accountCode: code,
      accountLabel: g.accountLabel,
      lineCount: g.lineCount,
      totalCents: g.totalCents,
    }));

    const consolidableGroups = groups.filter((g) => g.lineCount > 1);
    if (consolidableGroups.length === 0) {
      return {
        eligible: false,
        reason: 'Toutes les lignes sont déjà sur des comptes distincts.',
        groups,
      };
    }

    return { eligible: true, reason: null, groups };
  }

  // ==========================================================================
  // Consolidation
  // ==========================================================================

  /**
   * Consolide les lignes article ayant le même accountCode ET les mêmes
   * dimensions analytiques en une seule ligne par groupe.
   *
   * Sauvegarde un snapshot JSON pour permettre `unconsolidate()`.
   *
   * @returns nombre de groupes consolidés et nombre de lignes supprimées
   */
  async consolidate(
    clubId: string,
    userId: string,
    entryId: string,
  ): Promise<{ mergedGroups: number; removedLines: number }> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { clubId, id: entryId },
      include: {
        lines: {
          include: { allocations: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    if (entry.consolidatedAt) {
      throw new BadRequestException('Écriture déjà consolidée.');
    }
    if (entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new ForbiddenException(
        'Consolidation autorisée uniquement en NEEDS_REVIEW.',
      );
    }

    const articleLines = entry.lines.filter(
      (l) => !this.isCounterpartyCode(l.accountCode),
    );
    if (articleLines.some((l) => l.validatedAt)) {
      throw new ForbiddenException(
        'Au moins une ligne est validée. Dé-valider d’abord.',
      );
    }
    const aiUnfinished = articleLines.find(
      (l) => l.iaConfidencePct === null && l.iaSuggestedAccountCode === null,
    );
    if (aiUnfinished) {
      throw new BadRequestException('IA encore en cours sur certaines lignes.');
    }

    // Snapshot AVANT toute modification (pour rollback).
    const snapshot = articleLines.map((l) => ({
      id: l.id,
      accountCode: l.accountCode,
      accountLabel: l.accountLabel,
      label: l.label,
      side: l.side,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      sortOrder: l.sortOrder,
      iaSuggestedAccountCode: l.iaSuggestedAccountCode,
      iaReasoning: l.iaReasoning,
      iaConfidencePct: l.iaConfidencePct,
      mergedFromArticleLabels: l.mergedFromArticleLabels,
      allocations: l.allocations.map((a) => ({
        amountCents: a.amountCents,
        projectId: a.projectId,
        cohortCode: a.cohortCode,
        gender: a.gender,
        disciplineCode: a.disciplineCode,
        memberId: a.memberId,
        dynamicGroupIdsSnapshot: a.dynamicGroupIdsSnapshot,
        dynamicGroupLabelsSnapshot: a.dynamicGroupLabelsSnapshot,
        freeformTags: a.freeformTags,
      })),
    }));

    // Groupement par (accountCode + signature analytique)
    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      {
        accountCode: string;
        accountLabel: string;
        side: AccountingLineSide;
        sortOrder: number;
        firstAlloc: (typeof articleLines)[number]['allocations'][number] | null;
        lines: typeof articleLines;
      }
    >();

    for (const l of articleLines) {
      const firstAlloc = l.allocations[0] ?? null;
      const sig = this.allocationSignature(firstAlloc);
      const key = `${l.accountCode}::${sig}`;
      const ex = groups.get(key);
      if (ex) {
        ex.lines.push(l);
      } else {
        groups.set(key, {
          accountCode: l.accountCode,
          accountLabel: l.accountLabel,
          side: l.side,
          sortOrder: l.sortOrder,
          firstAlloc,
          lines: [l],
        });
      }
    }

    let mergedGroups = 0;
    let removedLines = 0;

    await this.prisma.$transaction(async (tx) => {
      // Sauvegarde snapshot AVANT toute mutation
      await tx.accountingEntry.update({
        where: { id: entryId },
        data: {
          preConsolidationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });

      for (const [, g] of groups) {
        if (g.lines.length < 2) continue; // singleton, rien à fusionner

        const totalDebit = g.lines.reduce((s, l) => s + l.debitCents, 0);
        const totalCredit = g.lines.reduce((s, l) => s + l.creditCents, 0);
        const labels = g.lines.map((l) => l.label ?? '(sans libellé)');
        const synthLabel =
          labels.length <= 3
            ? labels.join(' + ')
            : `${g.accountLabel} (${labels.length} articles)`;

        // Nouvelle ligne consolidée
        const newLine = await tx.accountingEntryLine.create({
          data: {
            entryId,
            clubId,
            accountCode: g.accountCode,
            accountLabel: g.accountLabel,
            label: synthLabel,
            side: g.side,
            debitCents: totalDebit,
            creditCents: totalCredit,
            sortOrder: g.sortOrder,
            mergedFromArticleLabels: labels,
          },
        });

        // 1 allocation totalisante reprenant les dimensions partagées
        const a = g.firstAlloc;
        await tx.accountingAllocation.create({
          data: {
            lineId: newLine.id,
            clubId,
            amountCents: totalDebit || totalCredit,
            projectId: a?.projectId ?? null,
            cohortCode: a?.cohortCode ?? null,
            gender: a?.gender ?? null,
            disciplineCode: a?.disciplineCode ?? null,
            memberId: a?.memberId ?? null,
            dynamicGroupIdsSnapshot: a?.dynamicGroupIdsSnapshot ?? [],
            dynamicGroupLabelsSnapshot: a?.dynamicGroupLabelsSnapshot ?? [],
            freeformTags: a?.freeformTags ?? [],
          },
        });

        // Suppression des anciennes lignes (cascade allocations + groupTags)
        await tx.accountingEntryLine.deleteMany({
          where: { id: { in: g.lines.map((l) => l.id) } },
        });

        mergedGroups++;
        removedLines += g.lines.length;
      }

      await tx.accountingEntry.update({
        where: { id: entryId },
        data: { consolidatedAt: new Date() },
      });
    });

    await this.audit.log({
      clubId,
      userId,
      entryId,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'CONSOLIDATE',
        mergedGroups,
        removedLines,
      },
    });

    this.logger.log(
      `[Entry ${entryId}] Consolidation : ${mergedGroups} groupes, ${removedLines} lignes fusionnées`,
    );

    return { mergedGroups, removedLines };
  }

  // ==========================================================================
  // Annulation de la consolidation
  // ==========================================================================

  /**
   * Restaure les lignes d'origine depuis `preConsolidationSnapshot`.
   * Refusé si l'entry est POSTED/LOCKED (modifierait la structure d'une
   * écriture déjà comptabilisée).
   */
  async unconsolidate(
    clubId: string,
    userId: string,
    entryId: string,
  ): Promise<void> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { clubId, id: entryId },
      include: { lines: { include: { allocations: true } } },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    if (!entry.consolidatedAt || !entry.preConsolidationSnapshot) {
      throw new BadRequestException(
        'Cette écriture n’est pas consolidée.',
      );
    }
    if (entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new ForbiddenException(
        'Annulation de la consolidation interdite après comptabilisation.',
      );
    }

    const snapshot = entry.preConsolidationSnapshot as unknown as Array<{
      id: string;
      accountCode: string;
      accountLabel: string;
      label: string | null;
      side: AccountingLineSide;
      debitCents: number;
      creditCents: number;
      sortOrder: number;
      iaSuggestedAccountCode: string | null;
      iaReasoning: string | null;
      iaConfidencePct: number | null;
      mergedFromArticleLabels: string[];
      allocations: Array<{
        amountCents: number;
        projectId: string | null;
        cohortCode: string | null;
        gender: string | null;
        disciplineCode: string | null;
        memberId: string | null;
        dynamicGroupIdsSnapshot: string[];
        dynamicGroupLabelsSnapshot: string[];
        freeformTags: string[];
      }>;
    }>;

    await this.prisma.$transaction(async (tx) => {
      // Identifier les lignes consolidées (mergedFromArticleLabels non vide)
      // pour les supprimer avant restauration.
      const consolidatedLines = entry.lines.filter(
        (l) => l.mergedFromArticleLabels.length > 0,
      );
      await tx.accountingEntryLine.deleteMany({
        where: { id: { in: consolidatedLines.map((l) => l.id) } },
      });

      for (const s of snapshot) {
        const line = await tx.accountingEntryLine.create({
          data: {
            entryId,
            clubId,
            accountCode: s.accountCode,
            accountLabel: s.accountLabel,
            label: s.label,
            side: s.side,
            debitCents: s.debitCents,
            creditCents: s.creditCents,
            sortOrder: s.sortOrder,
            iaSuggestedAccountCode: s.iaSuggestedAccountCode,
            iaReasoning: s.iaReasoning,
            iaConfidencePct: s.iaConfidencePct,
            mergedFromArticleLabels: s.mergedFromArticleLabels,
          },
        });
        for (const a of s.allocations) {
          await tx.accountingAllocation.create({
            data: {
              lineId: line.id,
              clubId,
              amountCents: a.amountCents,
              projectId: a.projectId,
              cohortCode: a.cohortCode,
              gender:
                (a.gender as
                  | 'MALE'
                  | 'FEMALE'
                  | 'OTHER'
                  | 'UNSPECIFIED'
                  | null) ?? null,
              disciplineCode: a.disciplineCode,
              memberId: a.memberId,
              dynamicGroupIdsSnapshot: a.dynamicGroupIdsSnapshot,
              dynamicGroupLabelsSnapshot: a.dynamicGroupLabelsSnapshot,
              freeformTags: a.freeformTags,
            },
          });
        }
      }

      await tx.accountingEntry.update({
        where: { id: entryId },
        data: { consolidatedAt: null, preConsolidationSnapshot: Prisma.JsonNull },
      });
    });

    await this.audit.log({
      clubId,
      userId,
      entryId,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'UNCONSOLIDATE',
        restoredLines: snapshot.length,
      },
    });

    this.logger.log(
      `[Entry ${entryId}] Consolidation annulée : ${snapshot.length} lignes restaurées`,
    );
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Codes des comptes utilisés en contrepartie banque/caisse — exclus de
   * la consolidation. On match sur le préfixe (51x = banque/transit, 53x
   * = caisse). Les vrais comptes article sont en 60x/61x/62x/etc.
   */
  private isCounterpartyCode(code: string): boolean {
    return code.startsWith('51') || code.startsWith('53');
  }

  /**
   * Signature stable d'une allocation pour comparer 2 lignes : si signature
   * identique → consolidable, sinon non. On ignore `memberId` (snapshot
   * plus fluide) et les freeformTags (libellé libre).
   */
  private allocationSignature(
    a: {
      projectId: string | null;
      cohortCode: string | null;
      disciplineCode: string | null;
      gender: string | null;
    } | null,
  ): string {
    if (!a) return 'null';
    return [
      a.projectId ?? '_',
      a.cohortCode ?? '_',
      a.disciplineCode ?? '_',
      a.gender ?? '_',
    ].join('|');
  }
}
