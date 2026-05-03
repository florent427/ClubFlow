import { Injectable } from '@nestjs/common';
import { AccountingEntryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ExportFilter {
  from?: Date | null;
  to?: Date | null;
}

/**
 * Service d'export comptable.
 *
 * v1 : CSV libre (colonnes trésorier-friendly).
 * v2 : FEC (Fichier des Écritures Comptables, 18 colonnes obligatoires
 *      définies par l'article A.47 A-1 du Livre des Procédures Fiscales).
 *
 * Le format FEC est requis pour tout contrôle fiscal. On le génère
 * toujours à partir des lignes (`AccountingEntryLine`) car le format
 * exige 1 ligne CSV par mouvement débit/crédit.
 */
@Injectable()
export class AccountingExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Format CSV libre pour usage quotidien du trésorier. */
  async exportCsv(clubId: string, filter: ExportFilter = {}): Promise<string> {
    const entries = await this.prisma.accountingEntry.findMany({
      where: this.whereClause(clubId, filter),
      orderBy: { occurredAt: 'asc' },
      include: {
        lines: {
          include: {
            allocations: {
              include: { project: { select: { title: true } } },
            },
          },
        },
      },
    });
    const headers = [
      'Date',
      'Libellé',
      'Type',
      'Statut',
      'Source',
      'Montant (€)',
      'Compte',
      'Projet',
      'Cohorte',
      'Discipline',
    ];
    const rows: string[][] = [headers];
    for (const e of entries) {
      const mainLine =
        e.lines.find(
          (l) => l.accountCode !== '512000' && l.accountCode !== '530000',
        ) ?? e.lines[0];
      const mainAlloc = mainLine?.allocations[0];
      const sign = e.kind === 'INCOME' ? 1 : e.kind === 'EXPENSE' ? -1 : 0;
      rows.push([
        e.occurredAt.toISOString().slice(0, 10),
        e.label,
        e.kind,
        e.status,
        e.source,
        ((sign * e.amountCents) / 100).toFixed(2),
        mainLine?.accountCode ?? '',
        mainAlloc?.project?.title ?? '',
        mainAlloc?.cohortCode ?? '',
        mainAlloc?.disciplineCode ?? '',
      ]);
    }
    return this.toCsv(rows);
  }

  /**
   * Génère un FEC conforme à l'article A.47 A-1 du LPF. Chaque
   * `AccountingEntryLine` devient une ligne FEC indépendante.
   *
   * Les 18 colonnes FEC (séparateur = TAB, encodage UTF-8 ou ISO-8859-15) :
   *   1. JournalCode   — code journal (VT=ventes, AC=achats, OD=opérations
   *                      diverses, BQ=banque, CA=caisse, etc.)
   *   2. JournalLib    — libellé journal
   *   3. EcritureNum   — numéro séquentiel de l'écriture
   *   4. EcritureDate  — date comptable (AAAAMMJJ)
   *   5. CompteNum     — compte PCG
   *   6. CompteLib     — libellé compte
   *   7. CompAuxNum    — compte auxiliaire (null si pas de tiers)
   *   8. CompAuxLib    — libellé auxiliaire
   *   9. PieceRef      — référence pièce
   *  10. PieceDate     — date pièce (AAAAMMJJ)
   *  11. EcritureLib   — libellé écriture
   *  12. Debit         — montant débit (format "0,00" ou vide)
   *  13. Credit        — montant crédit (format "0,00" ou vide)
   *  14. EcritureLet   — lettre de lettrage
   *  15. DateLet       — date lettrage (AAAAMMJJ)
   *  16. ValidDate     — date validation (AAAAMMJJ)
   *  17. Montantdevise — montant en devise
   *  18. Idevise       — code ISO devise
   */
  async exportFec(clubId: string, filter: ExportFilter = {}): Promise<string> {
    const entries = await this.prisma.accountingEntry.findMany({
      where: {
        ...this.whereClause(clubId, filter),
        // FEC ne doit pas contenir de brouillons ni d'annulations
        status: AccountingEntryStatus.POSTED,
      },
      orderBy: { occurredAt: 'asc' },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        payment: { select: { externalRef: true } },
      },
    });

    const headers = [
      'JournalCode',
      'JournalLib',
      'EcritureNum',
      'EcritureDate',
      'CompteNum',
      'CompteLib',
      'CompAuxNum',
      'CompAuxLib',
      'PieceRef',
      'PieceDate',
      'EcritureLib',
      'Debit',
      'Credit',
      'EcritureLet',
      'DateLet',
      'ValidDate',
      'Montantdevise',
      'Idevise',
    ];
    const rows: string[][] = [headers];

    entries.forEach((e, idx) => {
      const journalCode = this.journalCodeFor(e.source, e.kind);
      const journalLib = this.journalLibFor(journalCode);
      const ecritureNum = String(idx + 1).padStart(6, '0');
      const ecritureDate = this.formatFecDate(e.occurredAt);
      const validDate = this.formatFecDate(e.createdAt);
      const pieceRef = e.payment?.externalRef ?? e.id.slice(0, 8);
      const pieceDate = ecritureDate;

      for (const line of e.lines) {
        rows.push([
          journalCode,
          journalLib,
          ecritureNum,
          ecritureDate,
          line.accountCode,
          line.accountLabel,
          '', // CompAuxNum : non utilisé en v1
          '', // CompAuxLib
          pieceRef,
          pieceDate,
          e.label.replace(/[\t\r\n]+/g, ' '),
          line.debitCents > 0
            ? (line.debitCents / 100).toFixed(2).replace('.', ',')
            : '',
          line.creditCents > 0
            ? (line.creditCents / 100).toFixed(2).replace('.', ',')
            : '',
          '', // EcritureLet
          '', // DateLet
          validDate,
          '', // Montantdevise (pas d'écritures en devise étrangère en v1)
          '', // Idevise
        ]);
      }
    });

    // FEC = TAB-separated
    return rows
      .map((r) => r.map((c) => (c ?? '').toString()).join('\t'))
      .join('\r\n');
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private whereClause(clubId: string, filter: ExportFilter) {
    const where: {
      clubId: string;
      occurredAt?: { gte?: Date; lt?: Date };
    } = { clubId };
    if (filter.from || filter.to) {
      where.occurredAt = {};
      if (filter.from) where.occurredAt.gte = filter.from;
      if (filter.to) where.occurredAt.lt = filter.to;
    }
    return where;
  }

  private formatFecDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  /** Convention simple : un journal par source automatique. */
  private journalCodeFor(source: string, _kind: string): string {
    switch (source) {
      case 'AUTO_MEMBER_PAYMENT':
      case 'AUTO_SHOP':
        return 'VT'; // Journal de ventes
      case 'AUTO_SUBSIDY':
        return 'SU'; // Journal subventions
      case 'AUTO_SPONSORSHIP':
        return 'SP'; // Journal sponsoring
      case 'AUTO_REFUND':
        return 'AV'; // Avoirs
      case 'AUTO_STRIPE_FEES':
        return 'BQ'; // Banque
      case 'OCR_AI':
      case 'MANUAL':
      default:
        return 'OD'; // Opérations diverses
    }
  }

  private journalLibFor(code: string): string {
    switch (code) {
      case 'VT':
        return 'Ventes / Cotisations';
      case 'SU':
        return 'Subventions';
      case 'SP':
        return 'Sponsoring';
      case 'AV':
        return 'Avoirs';
      case 'BQ':
        return 'Banque';
      default:
        return 'Opérations diverses';
    }
  }

  /** Convertit des lignes (array of strings) en CSV RFC 4180. */
  private toCsv(rows: string[][]): string {
    return rows
      .map((r) =>
        r
          .map((cell) => {
            const s = (cell ?? '').toString();
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(','),
      )
      .join('\r\n');
  }
}
