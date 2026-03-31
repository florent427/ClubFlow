import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubPaymentMethod,
  InvoiceLineKind,
  InvoiceStatus,
  MembershipRole,
  Prisma,
  SubscriptionBillingRhythm,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type MemberMatchInput } from '../members/dynamic-group-matcher';
import { applyPricing } from '../payments/pricing-rules';
import { CreateClubSeasonInput, UpdateClubSeasonInput } from './dto/create-club-season.input';
import { CreateMembershipInvoiceDraftInput } from './dto/create-membership-invoice-draft.input';
import {
  CreateMembershipOneTimeFeeInput,
  UpdateMembershipOneTimeFeeInput,
} from './dto/membership-one-time-fee.input';
import {
  CreateMembershipProductInput,
  UpdateMembershipProductInput,
} from './dto/create-membership-product.input';
import { memberMatchesMembershipProduct } from './membership-eligibility';
import {
  computeMembershipAdjustments,
  computeOneTimeFeeAdjustments,
  computeProrataFactorBp,
  type AdjustmentDraft,
} from './membership-pricing';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertExceptionalDiscountAllowed(
    userId: string,
    clubId: string,
  ): Promise<void> {
    const m = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!m) {
      throw new ForbiddenException();
    }
    const allowed: MembershipRole[] = [
      MembershipRole.CLUB_ADMIN,
      MembershipRole.BOARD,
      MembershipRole.TREASURER,
    ];
    if (!allowed.includes(m.role)) {
      throw new ForbiddenException(
        'Remise exceptionnelle réservée à la trésorerie ou au bureau.',
      );
    }
  }

  async listClubSeasons(clubId: string) {
    return this.prisma.clubSeason.findMany({
      where: { clubId },
      orderBy: { startsOn: 'desc' },
    });
  }

  async getActiveClubSeason(clubId: string) {
    return this.prisma.clubSeason.findFirst({
      where: { clubId, isActive: true },
    });
  }

  async createClubSeason(clubId: string, input: CreateClubSeasonInput) {
    const startsOn = new Date(input.startsOn);
    const endsOn = new Date(input.endsOn);
    if (endsOn < startsOn) {
      throw new BadRequestException('La fin de saison doit être après le début.');
    }
    const setActive = input.setActive === true;
    return this.prisma.$transaction(async (tx) => {
      if (setActive) {
        await tx.clubSeason.updateMany({
          where: { clubId, isActive: true },
          data: { isActive: false },
        });
      }
      return tx.clubSeason.create({
        data: {
          clubId,
          label: input.label,
          startsOn,
          endsOn,
          isActive: setActive,
        },
      });
    });
  }

  async updateClubSeason(clubId: string, input: UpdateClubSeasonInput) {
    const row = await this.prisma.clubSeason.findFirst({
      where: { id: input.id, clubId },
    });
    if (!row) {
      throw new NotFoundException('Saison introuvable');
    }
    const startsOn = input.startsOn ? new Date(input.startsOn) : row.startsOn;
    const endsOn = input.endsOn ? new Date(input.endsOn) : row.endsOn;
    if (endsOn < startsOn) {
      throw new BadRequestException('La fin de saison doit être après le début.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.isActive === true) {
        await tx.clubSeason.updateMany({
          where: { clubId, isActive: true, NOT: { id: input.id } },
          data: { isActive: false },
        });
      }
      return tx.clubSeason.update({
        where: { id: input.id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.startsOn !== undefined ? { startsOn } : {}),
          ...(input.endsOn !== undefined ? { endsOn } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
    });
  }

  async listMembershipProducts(clubId: string) {
    return this.prisma.membershipProduct.findMany({
      where: { clubId, archivedAt: null },
      orderBy: { label: 'asc' },
      include: { gradeFilters: true },
    });
  }

  private async assertGradeLevelsInClub(
    clubId: string,
    gradeLevelIds: string[],
  ): Promise<void> {
    for (const gid of gradeLevelIds) {
      const g = await this.prisma.gradeLevel.findFirst({
        where: { id: gid, clubId },
      });
      if (!g) {
        throw new BadRequestException(`Grade inconnu : ${gid}`);
      }
    }
  }

  async createMembershipProduct(
    clubId: string,
    input: CreateMembershipProductInput,
  ) {
    const gradeLevelIds = input.gradeLevelIds ?? [];
    if (gradeLevelIds.length > 0) {
      await this.assertGradeLevelsInClub(clubId, gradeLevelIds);
    }
    return this.prisma.membershipProduct.create({
      data: {
        clubId,
        label: input.label,
        annualAmountCents: input.annualAmountCents,
        monthlyAmountCents: input.monthlyAmountCents,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        allowProrata: input.allowProrata ?? true,
        allowFamily: input.allowFamily ?? true,
        allowPublicAid: input.allowPublicAid ?? true,
        allowExceptional: input.allowExceptional ?? true,
        exceptionalCapPercentBp: input.exceptionalCapPercentBp ?? null,
        gradeFilters:
          gradeLevelIds.length > 0
            ? {
                create: gradeLevelIds.map((gradeLevelId) => ({
                  gradeLevelId,
                })),
              }
            : undefined,
      },
      include: { gradeFilters: true },
    });
  }

  async updateMembershipProduct(
    clubId: string,
    input: UpdateMembershipProductInput,
  ) {
    const existing = await this.prisma.membershipProduct.findFirst({
      where: { id: input.id, clubId, archivedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Formule introuvable');
    }
    if (input.gradeLevelIds !== undefined) {
      await this.assertGradeLevelsInClub(clubId, input.gradeLevelIds);
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.gradeLevelIds !== undefined) {
        await tx.membershipProductGradeLevel.deleteMany({
          where: { membershipProductId: input.id },
        });
        if (input.gradeLevelIds.length > 0) {
          await tx.membershipProductGradeLevel.createMany({
            data: input.gradeLevelIds.map((gradeLevelId) => ({
              membershipProductId: input.id,
              gradeLevelId,
            })),
          });
        }
      }
      return tx.membershipProduct.update({
        where: { id: input.id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.annualAmountCents !== undefined
            ? { annualAmountCents: input.annualAmountCents }
            : {}),
          ...(input.monthlyAmountCents !== undefined
            ? { monthlyAmountCents: input.monthlyAmountCents }
            : {}),
          ...(input.minAge !== undefined ? { minAge: input.minAge } : {}),
          ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
          ...(input.allowProrata !== undefined
            ? { allowProrata: input.allowProrata }
            : {}),
          ...(input.allowFamily !== undefined
            ? { allowFamily: input.allowFamily }
            : {}),
          ...(input.allowPublicAid !== undefined
            ? { allowPublicAid: input.allowPublicAid }
            : {}),
          ...(input.allowExceptional !== undefined
            ? { allowExceptional: input.allowExceptional }
            : {}),
          ...(input.exceptionalCapPercentBp !== undefined
            ? { exceptionalCapPercentBp: input.exceptionalCapPercentBp }
            : {}),
        },
        include: { gradeFilters: true },
      });
    });
  }

  async deleteMembershipProduct(clubId: string, id: string): Promise<void> {
    const existing = await this.prisma.membershipProduct.findFirst({
      where: { id, clubId, archivedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Formule introuvable');
    }
    await this.prisma.membershipProduct.delete({ where: { id } });
  }

  async listMembershipOneTimeFees(clubId: string) {
    return this.prisma.membershipOneTimeFee.findMany({
      where: { clubId, archivedAt: null },
      orderBy: { label: 'asc' },
    });
  }

  async createMembershipOneTimeFee(
    clubId: string,
    input: CreateMembershipOneTimeFeeInput,
  ) {
    return this.prisma.membershipOneTimeFee.create({
      data: {
        clubId,
        label: input.label,
        amountCents: input.amountCents,
      },
    });
  }

  async updateMembershipOneTimeFee(
    clubId: string,
    input: UpdateMembershipOneTimeFeeInput,
  ) {
    const row = await this.prisma.membershipOneTimeFee.findFirst({
      where: { id: input.id, clubId, archivedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Frais unique introuvable');
    }
    return this.prisma.membershipOneTimeFee.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.amountCents !== undefined
          ? { amountCents: input.amountCents }
          : {}),
      },
    });
  }

  async archiveMembershipOneTimeFee(clubId: string, id: string): Promise<void> {
    const row = await this.prisma.membershipOneTimeFee.findFirst({
      where: { id, clubId, archivedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Frais unique introuvable');
    }
    await this.prisma.membershipOneTimeFee.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async deleteMembershipOneTimeFee(clubId: string, id: string): Promise<void> {
    const row = await this.prisma.membershipOneTimeFee.findFirst({
      where: { id, clubId },
    });
    if (!row) {
      throw new NotFoundException('Frais unique introuvable');
    }
    const used = await this.prisma.invoiceLine.count({
      where: {
        membershipOneTimeFeeId: id,
        invoice: {
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
        },
      },
    });
    if (used > 0) {
      throw new BadRequestException(
        'Impossible de supprimer : ce frais figure sur une facture ouverte ou payée.',
      );
    }
    await this.prisma.membershipOneTimeFee.delete({ where: { id } });
  }

  async eligibleMembershipProducts(
    clubId: string,
    memberId: string,
    referenceDate: Date = new Date(),
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    const products = await this.listMembershipProducts(clubId);
    const memberInput: MemberMatchInput = {
      status: member.status,
      birthDate: member.birthDate,
      gradeLevelId: member.gradeLevelId,
    };
    return products.filter((p) =>
      memberMatchesMembershipProduct(
        memberInput,
        {
          minAge: p.minAge,
          maxAge: p.maxAge,
          gradeLevelIds: p.gradeFilters.map((g) => g.gradeLevelId),
        },
        referenceDate,
      ),
    );
  }

  private mapAdjustmentsCreate(
    adjustments: AdjustmentDraft[],
    userId: string,
  ): Prisma.InvoiceLineAdjustmentCreateWithoutLineInput[] {
    return adjustments.map((a) => ({
      stepOrder: a.stepOrder,
      type: a.type,
      amountCents: a.amountCents,
      percentAppliedBp: a.percentAppliedBp ?? null,
      metadataJson: a.metadataJson ?? null,
      reason: a.reason ?? null,
      createdByUserId: a.type === 'EXCEPTIONAL' ? userId : null,
    }));
  }

  async createMembershipInvoiceDraft(
    clubId: string,
    userId: string,
    input: CreateMembershipInvoiceDraftInput,
  ) {
    const season = await this.getActiveClubSeason(clubId);
    if (!season) {
      throw new BadRequestException(
        'Aucune saison active : créez ou activez une saison avant la cotisation.',
      );
    }

    const member = await this.prisma.member.findFirst({
      where: { id: input.memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }

    const product = await this.prisma.membershipProduct.findFirst({
      where: { id: input.membershipProductId, clubId, archivedAt: null },
      include: { gradeFilters: true },
    });
    if (!product) {
      throw new NotFoundException('Formule d’adhésion introuvable');
    }

    const memberInput: MemberMatchInput = {
      status: member.status,
      birthDate: member.birthDate,
      gradeLevelId: member.gradeLevelId,
    };
    const effDate = new Date(input.effectiveDate);
    const eligible = memberMatchesMembershipProduct(
      memberInput,
      {
        minAge: product.minAge,
        maxAge: product.maxAge,
        gradeLevelIds: product.gradeFilters.map((g) => g.gradeLevelId),
      },
      effDate,
    );
    if (!eligible) {
      throw new BadRequestException(
        'Le membre n’est pas éligible pour cette formule (âge ou grade).',
      );
    }

    const subscriptionBaseCents =
      input.billingRhythm === SubscriptionBillingRhythm.ANNUAL
        ? product.annualAmountCents
        : product.monthlyAmountCents;

    const fm = await this.prisma.familyMember.findFirst({
      where: { memberId: member.id },
      include: { family: true },
    });
    const familyId = fm?.familyId ?? null;

    const priorCount =
      familyId === null
        ? 0
        : await this.countPriorMembershipLinesForFamily(
            clubId,
            season.id,
            familyId,
          );

    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });

    const familyRule =
      product.allowFamily &&
      club.membershipFamilyDiscountFromNth != null &&
      club.membershipFamilyDiscountFromNth >= 1
        ? {
            fromNth: club.membershipFamilyDiscountFromNth,
            adjustmentType: club.membershipFamilyAdjustmentType,
            adjustmentValue: club.membershipFamilyAdjustmentValue,
          }
        : null;

    const allowProrataEffective =
      product.allowProrata &&
      input.billingRhythm === SubscriptionBillingRhythm.ANNUAL;

    const factorBp = allowProrataEffective
      ? input.prorataPercentBp != null
        ? input.prorataPercentBp
        : computeProrataFactorBp(effDate, season.startsOn, season.endsOn)
      : 10_000;

    const feeIdList = [...new Set(input.oneTimeFeeIds ?? [])];
    const exceptionalByFeeId = new Map<
      string,
      { amountCents: number; reason: string }
    >();

    for (const e of input.oneTimeExceptionals ?? []) {
      if (exceptionalByFeeId.has(e.feeId)) {
        throw new BadRequestException(
          'Une seule remise exceptionnelle par frais unique.',
        );
      }
      if (!feeIdList.includes(e.feeId)) {
        throw new BadRequestException(
          'Remise sur frais : le frais doit être inclus dans la facture.',
        );
      }
      if (!e.reason?.trim()) {
        throw new BadRequestException(
          'Remise sur frais unique : motif obligatoire.',
        );
      }
      if (e.amountCents == null || e.amountCents === 0) {
        throw new BadRequestException(
          'Remise sur frais unique : montant obligatoire et non nul.',
        );
      }
      exceptionalByFeeId.set(e.feeId, {
        amountCents: e.amountCents,
        reason: e.reason.trim(),
      });
    }

    const fees =
      feeIdList.length === 0
        ? []
        : await this.prisma.membershipOneTimeFee.findMany({
            where: {
              id: { in: feeIdList },
              clubId,
              archivedAt: null,
            },
          });
    if (fees.length !== feeIdList.length) {
      throw new BadRequestException(
        'Frais unique inconnu, archivé ou hors club.',
      );
    }
    const feeById = new Map(fees.map((f) => [f.id, f]));

    const hasSubscriptionExceptional =
      (input.exceptionalAmountCents != null &&
        input.exceptionalAmountCents !== 0) ||
      (input.exceptionalReason != null && input.exceptionalReason.length > 0);

    if (hasSubscriptionExceptional || exceptionalByFeeId.size > 0) {
      await this.assertExceptionalDiscountAllowed(userId, clubId);
    }

    if (hasSubscriptionExceptional) {
      if (
        !input.exceptionalReason?.trim() ||
        input.exceptionalAmountCents == null
      ) {
        throw new BadRequestException(
          'Remise exceptionnelle (cotisation) : motif et montant obligatoires.',
        );
      }
    }

    const publicAid =
      product.allowPublicAid &&
      input.publicAidAmountCents != null &&
      input.publicAidAmountCents !== 0
        ? {
            amountCents: input.publicAidAmountCents,
            metadata: {
              organisme: input.publicAidOrganisme ?? null,
              reference: input.publicAidReference ?? null,
              pieceJointeUrl: input.publicAidAttachmentUrl ?? null,
            },
          }
        : null;

    const exceptional =
      product.allowExceptional &&
      input.exceptionalAmountCents != null &&
      input.exceptionalAmountCents !== 0 &&
      input.exceptionalReason
        ? {
            amountCents: input.exceptionalAmountCents,
            reason: input.exceptionalReason,
          }
        : null;

    const { adjustments, subtotalAfterBusinessCents } =
      computeMembershipAdjustments({
        baseAmountCents: subscriptionBaseCents,
        allowProrata: allowProrataEffective,
        allowFamily: product.allowFamily,
        allowPublicAid: product.allowPublicAid,
        allowExceptional: product.allowExceptional,
        exceptionalCapPercentBp: product.exceptionalCapPercentBp,
        prorataFactorBp: factorBp,
        familyRule,
        priorFamilyMembershipCount: priorCount,
        publicAid,
        exceptional,
      });

    let invoiceBaseCents = subtotalAfterBusinessCents;

    const linesCreate: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput[] =
      [
      {
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        memberId: member.id,
        membershipProductId: product.id,
        membershipOneTimeFeeId: null,
        subscriptionBillingRhythm: input.billingRhythm,
        dynamicGroupId: null,
        baseAmountCents: subscriptionBaseCents,
        sortOrder: 0,
        adjustments: {
          create: this.mapAdjustmentsCreate(adjustments, userId),
        },
      },
      ];

    let sortOrder = 1;
    for (const feeId of feeIdList) {
      const fee = feeById.get(feeId)!;
      const exOpt = exceptionalByFeeId.get(feeId);
      const feeAdjust = computeOneTimeFeeAdjustments({
        baseAmountCents: fee.amountCents,
        allowExceptional: product.allowExceptional,
        exceptionalCapPercentBp: null,
        exceptional:
          exOpt != null
            ? {
                amountCents: exOpt.amountCents,
                reason: exOpt.reason,
              }
            : null,
      });
      invoiceBaseCents += feeAdjust.subtotalAfterBusinessCents;
      linesCreate.push({
        kind: InvoiceLineKind.MEMBERSHIP_ONE_TIME,
        memberId: member.id,
        membershipProductId: null,
        membershipOneTimeFeeId: fee.id,
        subscriptionBillingRhythm: null,
        dynamicGroupId: null,
        baseAmountCents: fee.amountCents,
        sortOrder: sortOrder++,
        adjustments: {
          create: this.mapAdjustmentsCreate(feeAdjust.adjustments, userId),
        },
      });
    }

    const label = `Adhésion ${season.label} — ${member.firstName} ${member.lastName}`;

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          clubId,
          familyId,
          clubSeasonId: season.id,
          label,
          baseAmountCents: invoiceBaseCents,
          amountCents: invoiceBaseCents,
          status: InvoiceStatus.DRAFT,
          lines: { create: linesCreate },
        },
        include: { lines: { include: { adjustments: true } } },
      });
      return invoice;
    });
  }

  private async countPriorMembershipLinesForFamily(
    clubId: string,
    clubSeasonId: string,
    familyId: string,
  ): Promise<number> {
    const links = await this.prisma.familyMember.findMany({
      where: { familyId },
      select: { memberId: true },
    });
    const memberIds = links
      .map((l) => l.memberId)
      .filter((id): id is string => id != null);
    if (memberIds.length === 0) {
      return 0;
    }
    return this.prisma.invoiceLine.count({
      where: {
        memberId: { in: memberIds },
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        invoice: {
          clubId,
          clubSeasonId,
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
        },
      },
    });
  }

  async finalizeMembershipInvoice(
    clubId: string,
    invoiceId: string,
    lockedPaymentMethod: ClubPaymentMethod,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Seules les factures brouillon sont finalisables.');
    }
    const rule = await this.prisma.clubPricingRule.findUnique({
      where: {
        clubId_method: { clubId, method: lockedPaymentMethod },
      },
    });
    const amountCents = applyPricing(
      invoice.baseAmountCents,
      lockedPaymentMethod,
      rule,
    );
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.OPEN,
        lockedPaymentMethod,
        amountCents,
      },
    });
  }
}
