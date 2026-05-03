import { Injectable } from '@nestjs/common';
import type { Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Entrée de ventilation analytique à créer pour une ligne comptable. */
export interface AllocationInput {
  amountCents: number;
  projectId?: string | null;
  cohortCode?: string | null;
  gender?: Gender | null;
  disciplineCode?: string | null;
  memberId?: string | null;
  dynamicGroupIds?: string[];
  dynamicGroupLabels?: string[];
  freeformTags?: string[];
}

/**
 * Service de ventilation analytique. Responsable de :
 * - Calculer la cohorte analytique d'un membre (via sa birthDate)
 * - Snapshoter les groupes dynamiques au moment T du paiement
 * - Créer les allocations avec leurs groupTags normalisés
 */
@Injectable()
export class AccountingAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule l'âge (années complètes) d'un membre à une date de référence.
   */
  private ageInYears(birthDate: Date, reference: Date): number {
    let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = reference.getUTCMonth() - birthDate.getUTCMonth();
    if (
      m < 0 ||
      (m === 0 && reference.getUTCDate() < birthDate.getUTCDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * Retourne le code cohorte matchant l'âge du membre (via config club)
   * ou null si pas de match.
   */
  async resolveCohortCode(
    clubId: string,
    memberId: string,
    referenceDate: Date,
  ): Promise<string | null> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { birthDate: true },
    });
    if (!member?.birthDate) return null;
    const age = this.ageInYears(member.birthDate, referenceDate);

    const cohorts = await this.prisma.accountingCohort.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
    });

    for (const c of cohorts) {
      const minOk = c.minAge === null || c.minAge === undefined || age >= c.minAge;
      const maxOk = c.maxAge === null || c.maxAge === undefined || age <= c.maxAge;
      if (minOk && maxOk) return c.code;
    }
    return null;
  }

  /**
   * Récupère le genre du membre (mappé en AccountingAllocationGender).
   * Note : `Gender` (schema Member) et `AccountingAllocationGender` partagent
   * les mêmes valeurs, on passe par un cast sûr.
   */
  async resolveGender(memberId: string): Promise<Gender | null> {
    const m = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { gender: true },
    });
    return m?.gender ?? null;
  }

  /**
   * Snapshot des groupes dynamiques dont le membre est actuellement
   * bénéficiaire (table de liaison `MemberDynamicGroup`).
   *
   * Pour v1 on utilise le cache des MemberDynamicGroup (maintenu par
   * DynamicGroupsService). En v2, refaire un matching live via les
   * critères serait plus juste si le cache est désynchronisé.
   */
  async snapshotDynamicGroups(
    memberId: string,
  ): Promise<Array<{ groupId: string; groupLabel: string }>> {
    const rows = await this.prisma.memberDynamicGroup.findMany({
      where: { memberId },
      include: { dynamicGroup: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({
      groupId: r.dynamicGroup.id,
      groupLabel: r.dynamicGroup.name,
    }));
  }

  /**
   * Calcule toutes les allocations analytiques à créer à partir des
   * `InvoiceLine` d'une facture payée. Ventilation 1 allocation par line
   * (sauf si la line n'a ni membre ni produit — fallback allocation nue).
   */
  async buildAllocationsForInvoice(
    clubId: string,
    invoiceId: string,
    occurredAt: Date,
  ): Promise<AllocationInput[]> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          include: {
            membershipProduct: {
              select: { disciplineCode: true },
            },
            adjustments: {
              select: { amountCents: true },
            },
          },
        },
      },
    });
    if (!invoice) return [];

    const allocations: AllocationInput[] = [];
    for (const line of invoice.lines) {
      const memberId = line.memberId ?? null;
      const disciplineCode =
        line.membershipProduct?.disciplineCode ?? null;

      let cohortCode: string | null = null;
      let gender: Gender | null = null;
      let groupSnapshot: Array<{ groupId: string; groupLabel: string }> = [];

      if (memberId) {
        cohortCode = await this.resolveCohortCode(
          clubId,
          memberId,
          occurredAt,
        );
        gender = await this.resolveGender(memberId);
        groupSnapshot = await this.snapshotDynamicGroups(memberId);
      }

      // Montant ligne = baseAmountCents - somme des ajustements (négatifs
      // typiquement : remises, prorata, famille). Les ajustements stockent
      // leur montant signé directement — on somme.
      const adjustmentsTotal = line.adjustments.reduce(
        (sum, a) => sum + a.amountCents,
        0,
      );
      const amount = line.baseAmountCents + adjustmentsTotal;

      allocations.push({
        amountCents: Math.max(0, amount),
        memberId,
        cohortCode,
        gender,
        disciplineCode,
        dynamicGroupIds: groupSnapshot.map((g) => g.groupId),
        dynamicGroupLabels: groupSnapshot.map((g) => g.groupLabel),
      });
    }

    // Normalisation : si la somme des allocations ≠ amountCents facture
    // (effet d'arrondi dû aux ajustements), on absorbe l'écart sur la 1ère
    // allocation pour que l'entry reste équilibrée.
    const allocTotal = allocations.reduce((s, a) => s + a.amountCents, 0);
    const drift = invoice.amountCents - allocTotal;
    if (drift !== 0 && allocations.length > 0) {
      allocations[0].amountCents += drift;
    }

    // Cas edge : invoice sans aucune line (ne devrait pas arriver mais
    // on crée 1 allocation globale pour ne rien perdre).
    if (allocations.length === 0) {
      allocations.push({ amountCents: invoice.amountCents });
    }

    return allocations;
  }

  /**
   * Crée les rows AccountingAllocation + AccountingAllocationGroupTag
   * pour une ligne comptable donnée. Utilise une transaction Prisma.
   */
  async persistAllocationsForLine(
    tx: Prisma.TransactionClient,
    lineId: string,
    clubId: string,
    inputs: AllocationInput[],
  ): Promise<void> {
    for (const input of inputs) {
      const alloc = await tx.accountingAllocation.create({
        data: {
          lineId,
          clubId,
          amountCents: input.amountCents,
          projectId: input.projectId ?? null,
          cohortCode: input.cohortCode ?? null,
          gender: input.gender ?? null,
          disciplineCode: input.disciplineCode ?? null,
          memberId: input.memberId ?? null,
          dynamicGroupIdsSnapshot: input.dynamicGroupIds ?? [],
          dynamicGroupLabelsSnapshot: input.dynamicGroupLabels ?? [],
          freeformTags: input.freeformTags ?? [],
        },
      });
      const groupIds = input.dynamicGroupIds ?? [];
      const groupLabels = input.dynamicGroupLabels ?? [];
      for (let i = 0; i < groupIds.length; i++) {
        await tx.accountingAllocationGroupTag.create({
          data: {
            allocationId: alloc.id,
            clubId,
            groupId: groupIds[i],
            groupLabel: groupLabels[i] ?? groupIds[i],
          },
        });
      }
    }
  }
}
