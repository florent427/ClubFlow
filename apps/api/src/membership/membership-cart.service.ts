import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoiceLineKind,
  InvoiceStatus,
  MembershipCartStatus,
  MembershipOneTimeFeeKind,
  MembershipRole,
  Prisma,
  SubscriptionBillingRhythm,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from './membership.service';
import { memberMatchesMembershipProduct } from './membership-eligibility';
import {
  computeMembershipAdjustments,
  computeOneTimeFeeAdjustments,
  computeProrataFactorBp,
  type AdjustmentDraft,
} from './membership-pricing';
import { applyPricing } from '../payments/pricing-rules';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { renderMembershipCartValidatedEmail } from '../mail/templates/membership-cart-validated';

/** Résumé ligne utilisé pour l'aperçu et l'email. */
export type CartItemPreview = {
  itemId: string;
  memberId: string;
  memberFullName: string;
  productLabel: string | null;
  productId: string | null;
  billingRhythm: SubscriptionBillingRhythm;
  subscriptionBaseCents: number;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
  exceptionalDiscountCents: number;
  lineTotalCents: number;
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
  requiresManualAssignment: boolean;
};

export type CartPreview = {
  cartId: string;
  familyId: string;
  clubSeasonId: string;
  status: MembershipCartStatus;
  items: CartItemPreview[];
  totalCents: number;
  requiresManualAssignmentCount: number;
  canValidate: boolean;
};

@Injectable()
export class MembershipCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  // ------------------------------------------------------------------
  // Sélection produit par âge
  // ------------------------------------------------------------------

  /**
   * Sélectionne automatiquement la meilleure formule pour un membre donné
   * (uniquement par l'âge à la date de référence). Renvoie la formule la
   * moins chère en cas d'égalité multiple ; `null` si aucune n'est éligible.
   */
  async selectProductForAge(
    clubId: string,
    seasonId: string,
    birthDate: Date,
    refDate?: Date | null,
  ): Promise<{
    id: string;
    label: string;
    annualAmountCents: number;
    monthlyAmountCents: number;
    minAge: number | null;
    maxAge: number | null;
  } | null> {
    const season = await this.prisma.clubSeason.findFirst({
      where: { id: seasonId, clubId },
    });
    if (!season) {
      throw new NotFoundException('Saison introuvable pour ce club.');
    }
    const reference = refDate ?? season.startsOn;
    const products = await this.prisma.membershipProduct.findMany({
      where: { clubId, archivedAt: null },
      include: { gradeFilters: true },
      orderBy: [{ annualAmountCents: 'asc' }, { label: 'asc' }],
    });
    for (const p of products) {
      const match = memberMatchesMembershipProduct(
        {
          status: 'ACTIVE',
          birthDate,
          gradeLevelId: null,
        },
        {
          minAge: p.minAge,
          maxAge: p.maxAge,
          gradeLevelIds: [], // l'âge est le seul critère pour le choix auto
        },
        reference,
      );
      if (match) {
        return {
          id: p.id,
          label: p.label,
          annualAmountCents: p.annualAmountCents,
          monthlyAmountCents: p.monthlyAmountCents,
          minAge: p.minAge,
          maxAge: p.maxAge,
        };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Résolution famille / saison / payeur
  // ------------------------------------------------------------------

  private async resolveActiveSeason(clubId: string) {
    const season = await this.prisma.clubSeason.findFirst({
      where: { clubId, isActive: true },
    });
    if (!season) {
      throw new BadRequestException(
        'Aucune saison active : créez ou activez une saison avant d’ouvrir un projet d’adhésion.',
      );
    }
    return season;
  }

  private async findMemberFamily(
    clubId: string,
    memberId: string,
  ): Promise<string | null> {
    const fm = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      select: { familyId: true },
    });
    return fm?.familyId ?? null;
  }

  private async findPayerForFamily(
    clubId: string,
    familyId: string,
  ): Promise<{ payerContactId: string | null; payerMemberId: string | null }> {
    const payer = await this.prisma.familyMember.findFirst({
      where: {
        familyId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      select: { contactId: true, memberId: true },
    });
    return {
      payerContactId: payer?.contactId ?? null,
      payerMemberId: payer?.memberId ?? null,
    };
  }

  // ------------------------------------------------------------------
  // Ouverture / récupération de cart
  // ------------------------------------------------------------------

  /**
   * Renvoie le projet OPEN existant pour la famille × saison ou en crée un.
   * Idempotent : aucun nouveau record si un OPEN existe déjà.
   */
  async getOrOpenCart(
    clubId: string,
    familyId: string,
    seasonId: string,
    payerOverride?: {
      payerContactId?: string | null;
      payerMemberId?: string | null;
    },
  ) {
    const existing = await this.prisma.membershipCart.findFirst({
      where: {
        clubId,
        familyId,
        clubSeasonId: seasonId,
        status: MembershipCartStatus.OPEN,
      },
    });
    if (existing) {
      return existing;
    }
    const defaultPayer = await this.findPayerForFamily(clubId, familyId);
    return this.prisma.membershipCart.create({
      data: {
        clubId,
        familyId,
        clubSeasonId: seasonId,
        payerContactId:
          payerOverride?.payerContactId ?? defaultPayer.payerContactId,
        payerMemberId:
          payerOverride?.payerMemberId ?? defaultPayer.payerMemberId,
        status: MembershipCartStatus.OPEN,
      },
    });
  }

  /**
   * Ouvre un nouveau projet en cours de saison. Interdit si un OPEN existe déjà.
   */
  async openAdditionalCart(
    clubId: string,
    familyId: string,
    seasonId: string,
  ) {
    const open = await this.prisma.membershipCart.findFirst({
      where: {
        clubId,
        familyId,
        clubSeasonId: seasonId,
        status: MembershipCartStatus.OPEN,
      },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        'Un projet d’adhésion est déjà ouvert pour cette famille sur la saison courante.',
      );
    }
    const payer = await this.findPayerForFamily(clubId, familyId);
    return this.prisma.membershipCart.create({
      data: {
        clubId,
        familyId,
        clubSeasonId: seasonId,
        payerContactId: payer.payerContactId,
        payerMemberId: payer.payerMemberId,
        status: MembershipCartStatus.OPEN,
      },
    });
  }

  // ------------------------------------------------------------------
  // Ajout automatique d'un membre au projet actif
  // ------------------------------------------------------------------

  /**
   * Hook appelé après `member.create` (admin ou portail). Idempotent :
   * - pas de famille → no-op
   * - pas de saison active → no-op (log via caller)
   * - item déjà présent → mise à jour du produit si nouveau match
   */
  async addMemberToActiveCart(
    clubId: string,
    memberId: string,
    options?: { payerMemberId?: string | null; payerContactId?: string | null },
  ): Promise<{ cartId: string; itemId: string } | null> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true, birthDate: true },
    });
    if (!member) {
      return null;
    }
    const familyId = await this.findMemberFamily(clubId, memberId);
    if (!familyId) {
      return null;
    }
    const season = await this.prisma.clubSeason.findFirst({
      where: { clubId, isActive: true },
    });
    if (!season) {
      return null;
    }
    const cart = await this.getOrOpenCart(clubId, familyId, season.id, options);

    let productId: string | null = null;
    let requiresManual = true;
    if (member.birthDate) {
      const product = await this.selectProductForAge(
        clubId,
        season.id,
        member.birthDate,
        season.startsOn,
      );
      if (product) {
        productId = product.id;
        requiresManual = false;
      }
    }

    const existing = await this.prisma.membershipCartItem.findUnique({
      where: { cartId_memberId: { cartId: cart.id, memberId } },
    });
    if (existing) {
      return { cartId: cart.id, itemId: existing.id };
    }

    const item = await this.prisma.membershipCartItem.create({
      data: {
        cartId: cart.id,
        memberId,
        membershipProductId: productId,
        requiresManualAssignment: requiresManual,
        billingRhythm: SubscriptionBillingRhythm.ANNUAL,
      },
    });
    return { cartId: cart.id, itemId: item.id };
  }

  // ------------------------------------------------------------------
  // Mutations item
  // ------------------------------------------------------------------

  private async loadItemOrThrow(clubId: string, itemId: string) {
    const item = await this.prisma.membershipCartItem.findFirst({
      where: { id: itemId, cart: { clubId } },
      include: { cart: true, product: true, member: true },
    });
    if (!item) {
      throw new NotFoundException('Ligne de projet introuvable.');
    }
    if (item.cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException(
        'Seuls les projets ouverts peuvent être modifiés.',
      );
    }
    return item;
  }

  async updateItem(
    clubId: string,
    itemId: string,
    patch: {
      billingRhythm?: SubscriptionBillingRhythm;
      membershipProductId?: string | null;
      oneTimeFeeOverrideIds?: string[] | null;
    },
  ) {
    const item = await this.loadItemOrThrow(clubId, itemId);
    const data: Prisma.MembershipCartItemUpdateInput = {};
    if (patch.billingRhythm !== undefined) {
      data.billingRhythm = patch.billingRhythm;
    }
    if (patch.membershipProductId !== undefined) {
      if (patch.membershipProductId === null) {
        data.product = { disconnect: true };
        data.requiresManualAssignment = true;
      } else {
        const product = await this.prisma.membershipProduct.findFirst({
          where: {
            id: patch.membershipProductId,
            clubId,
            archivedAt: null,
          },
        });
        if (!product) {
          throw new NotFoundException('Formule d’adhésion introuvable.');
        }
        data.product = { connect: { id: product.id } };
        data.requiresManualAssignment = false;
      }
    }
    if (patch.oneTimeFeeOverrideIds !== undefined) {
      data.oneTimeFeeOverrideIdsCsv =
        patch.oneTimeFeeOverrideIds && patch.oneTimeFeeOverrideIds.length > 0
          ? patch.oneTimeFeeOverrideIds.join(',')
          : null;
    }
    return this.prisma.membershipCartItem.update({
      where: { id: item.id },
      data,
    });
  }

  async removeItem(clubId: string, itemId: string) {
    const item = await this.loadItemOrThrow(clubId, itemId);
    await this.prisma.membershipCartItem.delete({ where: { id: item.id } });
    return { cartId: item.cartId, deletedItemId: item.id };
  }

  async toggleExistingLicense(
    clubId: string,
    itemId: string,
    hasExistingLicense: boolean,
    existingLicenseNumber: string | null,
  ) {
    const item = await this.loadItemOrThrow(clubId, itemId);
    if (hasExistingLicense) {
      if (!existingLicenseNumber || existingLicenseNumber.trim().length < 3) {
        throw new BadRequestException(
          'Numéro de licence obligatoire (au moins 3 caractères).',
        );
      }
    }
    return this.prisma.membershipCartItem.update({
      where: { id: item.id },
      data: {
        hasExistingLicense,
        existingLicenseNumber: hasExistingLicense
          ? existingLicenseNumber!.trim()
          : null,
      },
    });
  }

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

  async applyExceptionalDiscount(
    clubId: string,
    userId: string,
    itemId: string,
    amountCents: number,
    reason: string,
  ) {
    await this.assertExceptionalDiscountAllowed(userId, clubId);
    const item = await this.loadItemOrThrow(clubId, itemId);
    if (!reason.trim()) {
      throw new BadRequestException(
        'Motif obligatoire pour une remise exceptionnelle.',
      );
    }
    return this.prisma.membershipCartItem.update({
      where: { id: item.id },
      data: {
        exceptionalDiscountCents: amountCents,
        exceptionalDiscountReason: reason.trim(),
      },
    });
  }

  // ------------------------------------------------------------------
  // Listing admin / viewer
  // ------------------------------------------------------------------

  async getCartById(clubId: string, cartId: string) {
    const cart = await this.prisma.membershipCart.findFirst({
      where: { id: cartId, clubId },
      include: {
        items: {
          include: { member: true, product: true },
          orderBy: { createdAt: 'asc' },
        },
        payerContact: true,
        payerMember: true,
        family: true,
        clubSeason: true,
        invoice: true,
      },
    });
    if (!cart) {
      throw new NotFoundException('Projet introuvable.');
    }
    return cart;
  }

  async listCartsForClub(
    clubId: string,
    filters: {
      seasonId?: string | null;
      status?: MembershipCartStatus | null;
      familyId?: string | null;
      onlyWithAlerts?: boolean | null;
    },
  ) {
    const where: Prisma.MembershipCartWhereInput = { clubId };
    if (filters.seasonId) where.clubSeasonId = filters.seasonId;
    if (filters.status) where.status = filters.status;
    if (filters.familyId) where.familyId = filters.familyId;
    if (filters.onlyWithAlerts) {
      where.items = { some: { requiresManualAssignment: true } };
    }
    return this.prisma.membershipCart.findMany({
      where,
      include: {
        items: { include: { member: true, product: true } },
        payerContact: true,
        payerMember: true,
        family: true,
        clubSeason: true,
        invoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listCartsForFamily(
    clubId: string,
    familyId: string,
    seasonId?: string | null,
  ) {
    return this.prisma.membershipCart.findMany({
      where: {
        clubId,
        familyId,
        ...(seasonId ? { clubSeasonId: seasonId } : {}),
      },
      include: {
        items: { include: { member: true, product: true } },
        payerContact: true,
        payerMember: true,
        clubSeason: true,
        invoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOpenCartForFamily(
    clubId: string,
    familyId: string,
    seasonId: string,
  ) {
    return this.prisma.membershipCart.findFirst({
      where: {
        clubId,
        familyId,
        clubSeasonId: seasonId,
        status: MembershipCartStatus.OPEN,
      },
      include: {
        items: { include: { member: true, product: true } },
        payerContact: true,
        payerMember: true,
        clubSeason: true,
      },
    });
  }

  // ------------------------------------------------------------------
  // Calcul aperçu (sans émission de facture)
  // ------------------------------------------------------------------

  private async computePriorFamilyCount(
    clubId: string,
    seasonId: string,
    familyId: string,
  ): Promise<number> {
    const links = await this.prisma.familyMember.findMany({
      where: { familyId },
      select: { memberId: true },
    });
    const memberIds = links
      .map((l) => l.memberId)
      .filter((x): x is string => x != null);
    if (memberIds.length === 0) {
      return 0;
    }
    return this.prisma.invoiceLine.count({
      where: {
        memberId: { in: memberIds },
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        invoice: {
          clubId,
          clubSeasonId: seasonId,
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
        },
      },
    });
  }

  async computeCartPreview(
    clubId: string,
    cartId: string,
  ): Promise<CartPreview> {
    const cart = await this.getCartById(clubId, cartId);
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });

    const familyRule =
      club.membershipFamilyDiscountFromNth != null &&
      club.membershipFamilyDiscountFromNth >= 1
        ? {
            fromNth: club.membershipFamilyDiscountFromNth,
            adjustmentType: club.membershipFamilyAdjustmentType,
            adjustmentValue: club.membershipFamilyAdjustmentValue,
          }
        : null;

    const priorCount = await this.computePriorFamilyCount(
      clubId,
      cart.clubSeasonId,
      cart.familyId,
    );
    const autoFees = await this.prisma.membershipOneTimeFee.findMany({
      where: { clubId, archivedAt: null, autoApply: true },
    });

    const itemsPreview: CartItemPreview[] = [];
    let familyCursor = priorCount;
    let total = 0;

    for (const item of cart.items) {
      const product = item.product;
      if (!product || item.requiresManualAssignment) {
        itemsPreview.push({
          itemId: item.id,
          memberId: item.memberId,
          memberFullName: `${item.member.firstName} ${item.member.lastName}`,
          productLabel: product?.label ?? null,
          productId: product?.id ?? null,
          billingRhythm: item.billingRhythm,
          subscriptionBaseCents: 0,
          subscriptionAdjustedCents: 0,
          oneTimeFeesCents: 0,
          exceptionalDiscountCents: 0,
          lineTotalCents: 0,
          hasExistingLicense: item.hasExistingLicense,
          existingLicenseNumber: item.existingLicenseNumber,
          requiresManualAssignment: true,
        });
        continue;
      }

      const subscriptionBase =
        item.billingRhythm === SubscriptionBillingRhythm.ANNUAL
          ? product.annualAmountCents
          : product.monthlyAmountCents;

      const allowProrataEffective =
        product.allowProrata &&
        item.billingRhythm === SubscriptionBillingRhythm.ANNUAL;

      const factorBp = allowProrataEffective
        ? computeProrataFactorBp(
            new Date(),
            cart.clubSeason.startsOn,
            cart.clubSeason.endsOn,
          )
        : 10_000;

      const exceptional =
        product.allowExceptional && item.exceptionalDiscountCents !== 0
          ? {
              amountCents: item.exceptionalDiscountCents,
              reason: item.exceptionalDiscountReason ?? 'Remise exceptionnelle',
            }
          : null;

      const { subtotalAfterBusinessCents } = computeMembershipAdjustments({
        baseAmountCents: subscriptionBase,
        allowProrata: allowProrataEffective,
        allowFamily: product.allowFamily,
        allowPublicAid: product.allowPublicAid,
        allowExceptional: product.allowExceptional,
        exceptionalCapPercentBp: product.exceptionalCapPercentBp,
        prorataFactorBp: factorBp,
        familyRule,
        priorFamilyMembershipCount: familyCursor,
        publicAid: null,
        exceptional,
      });
      familyCursor += 1;

      // Frais uniques auto-applicables filtrés par licence
      const effectiveFees = autoFees.filter((f) => {
        if (f.kind === MembershipOneTimeFeeKind.LICENSE) {
          return !item.hasExistingLicense;
        }
        return true;
      });
      let feesTotal = 0;
      for (const f of effectiveFees) {
        feesTotal += f.amountCents;
      }

      const lineTotal = subtotalAfterBusinessCents + feesTotal;
      total += lineTotal;
      itemsPreview.push({
        itemId: item.id,
        memberId: item.memberId,
        memberFullName: `${item.member.firstName} ${item.member.lastName}`,
        productLabel: product.label,
        productId: product.id,
        billingRhythm: item.billingRhythm,
        subscriptionBaseCents: subscriptionBase,
        subscriptionAdjustedCents: subtotalAfterBusinessCents,
        oneTimeFeesCents: feesTotal,
        exceptionalDiscountCents: item.exceptionalDiscountCents,
        lineTotalCents: lineTotal,
        hasExistingLicense: item.hasExistingLicense,
        existingLicenseNumber: item.existingLicenseNumber,
        requiresManualAssignment: false,
      });
    }

    const requiresManualAssignmentCount = itemsPreview.filter(
      (i) => i.requiresManualAssignment,
    ).length;

    return {
      cartId: cart.id,
      familyId: cart.familyId,
      clubSeasonId: cart.clubSeasonId,
      status: cart.status,
      items: itemsPreview,
      totalCents: total,
      requiresManualAssignmentCount,
      canValidate:
        cart.status === MembershipCartStatus.OPEN &&
        requiresManualAssignmentCount === 0 &&
        cart.items.length > 0,
    };
  }

  // ------------------------------------------------------------------
  // Annulation
  // ------------------------------------------------------------------

  async cancelCart(clubId: string, cartId: string, reason: string) {
    const cart = await this.getCartById(clubId, cartId);
    if (cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException(
        'Seul un projet ouvert peut être annulé.',
      );
    }
    return this.prisma.membershipCart.update({
      where: { id: cart.id },
      data: {
        status: MembershipCartStatus.CANCELLED,
        cancelledReason: reason.trim() || null,
      },
    });
  }

  // ------------------------------------------------------------------
  // Validation → facture + email
  // ------------------------------------------------------------------

  async validateCart(
    clubId: string,
    userId: string,
    cartId: string,
    lockedPaymentMethod?: ClubPaymentMethod | null,
  ) {
    const cart = await this.getCartById(clubId, cartId);
    if (cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException('Le projet est déjà validé ou annulé.');
    }
    if (cart.items.length === 0) {
      throw new BadRequestException(
        'Impossible de valider un projet vide. Ajoutez au moins un membre.',
      );
    }
    const unassigned = cart.items.filter(
      (i) => i.requiresManualAssignment || !i.membershipProductId,
    );
    if (unassigned.length > 0) {
      throw new BadRequestException(
        'Certaines lignes nécessitent une assignation manuelle avant validation.',
      );
    }
    // Validation remises exceptionnelles
    const needsExceptionalAuth = cart.items.some(
      (i) => i.exceptionalDiscountCents !== 0,
    );
    if (needsExceptionalAuth) {
      await this.assertExceptionalDiscountAllowed(userId, clubId);
    }

    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });
    const season = await this.prisma.clubSeason.findUniqueOrThrow({
      where: { id: cart.clubSeasonId },
    });

    const familyRule =
      club.membershipFamilyDiscountFromNth != null &&
      club.membershipFamilyDiscountFromNth >= 1
        ? {
            fromNth: club.membershipFamilyDiscountFromNth,
            adjustmentType: club.membershipFamilyAdjustmentType,
            adjustmentValue: club.membershipFamilyAdjustmentValue,
          }
        : null;

    const priorCount = await this.computePriorFamilyCount(
      clubId,
      season.id,
      cart.familyId,
    );
    const autoFees = await this.prisma.membershipOneTimeFee.findMany({
      where: { clubId, archivedAt: null, autoApply: true },
    });

    // Précharger les produits (déjà chargés via `items.include.product` dans getCartById)
    let familyCursor = priorCount;
    let invoiceBaseCents = 0;
    const linesCreate: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput[] =
      [];
    let sortOrder = 0;

    for (const item of cart.items) {
      const product = item.product!;
      const subscriptionBase =
        item.billingRhythm === SubscriptionBillingRhythm.ANNUAL
          ? product.annualAmountCents
          : product.monthlyAmountCents;
      const allowProrataEffective =
        product.allowProrata &&
        item.billingRhythm === SubscriptionBillingRhythm.ANNUAL;
      const factorBp = allowProrataEffective
        ? computeProrataFactorBp(new Date(), season.startsOn, season.endsOn)
        : 10_000;

      const exceptional =
        product.allowExceptional && item.exceptionalDiscountCents !== 0
          ? {
              amountCents: item.exceptionalDiscountCents,
              reason:
                item.exceptionalDiscountReason ?? 'Remise exceptionnelle',
            }
          : null;

      const { adjustments, subtotalAfterBusinessCents } =
        computeMembershipAdjustments({
          baseAmountCents: subscriptionBase,
          allowProrata: allowProrataEffective,
          allowFamily: product.allowFamily,
          allowPublicAid: product.allowPublicAid,
          allowExceptional: product.allowExceptional,
          exceptionalCapPercentBp: product.exceptionalCapPercentBp,
          prorataFactorBp: factorBp,
          familyRule,
          priorFamilyMembershipCount: familyCursor,
          publicAid: null,
          exceptional,
        });
      familyCursor += 1;
      invoiceBaseCents += subtotalAfterBusinessCents;
      linesCreate.push({
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        memberId: item.memberId,
        membershipProductId: product.id,
        membershipOneTimeFeeId: null,
        subscriptionBillingRhythm: item.billingRhythm,
        dynamicGroupId: null,
        baseAmountCents: subscriptionBase,
        sortOrder: sortOrder++,
        adjustments: {
          create: this.mapAdjustmentsCreate(adjustments, userId),
        },
      });

      // Frais uniques auto
      const effectiveFees = autoFees.filter((f) => {
        if (f.kind === MembershipOneTimeFeeKind.LICENSE) {
          return !item.hasExistingLicense;
        }
        return true;
      });
      for (const fee of effectiveFees) {
        invoiceBaseCents += fee.amountCents;
        linesCreate.push({
          kind: InvoiceLineKind.MEMBERSHIP_ONE_TIME,
          memberId: item.memberId,
          membershipProductId: null,
          membershipOneTimeFeeId: fee.id,
          subscriptionBillingRhythm: null,
          dynamicGroupId: null,
          baseAmountCents: fee.amountCents,
          sortOrder: sortOrder++,
          adjustments: { create: [] },
        });
      }
    }

    const payerLabel = await this.resolvePayerLabel(cart);
    const label = `Adhésion ${season.label} — ${payerLabel}`;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          clubId,
          familyId: cart.familyId,
          clubSeasonId: season.id,
          label,
          baseAmountCents: invoiceBaseCents,
          amountCents: invoiceBaseCents,
          status: InvoiceStatus.DRAFT,
          lines: { create: linesCreate },
        },
      });
      // Ligne de licence (stockage numéro sur Member)
      for (const item of cart.items) {
        if (item.hasExistingLicense && item.existingLicenseNumber) {
          await tx.member.update({
            where: { id: item.memberId },
            data: { licenseNumber: item.existingLicenseNumber },
          });
        }
      }
      await tx.membershipCart.update({
        where: { id: cart.id },
        data: {
          status: MembershipCartStatus.VALIDATED,
          validatedAt: new Date(),
          invoiceId: inv.id,
        },
      });
      return inv;
    });

    // Finalisation DRAFT → OPEN avec la méthode de paiement verrouillée.
    // Par défaut STRIPE_CARD (le payeur choisira réellement au moment du paiement).
    const method = lockedPaymentMethod ?? ClubPaymentMethod.STRIPE_CARD;
    await this.membership.finalizeMembershipInvoice(clubId, invoice.id, method);

    // Notification e-mail (fire-and-forget, on swallow les erreurs pour ne pas bloquer la validation)
    try {
      await this.sendCartValidatedEmail(clubId, cart.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[membership-cart] notification email failed',
        (err as Error).message,
      );
    }

    return this.getCartById(clubId, cart.id);
  }

  private async resolvePayerLabel(cart: {
    payerMemberId: string | null;
    payerContactId: string | null;
  }): Promise<string> {
    if (cart.payerMemberId) {
      const m = await this.prisma.member.findUnique({
        where: { id: cart.payerMemberId },
        select: { firstName: true, lastName: true },
      });
      if (m) return `${m.firstName} ${m.lastName}`.trim();
    }
    if (cart.payerContactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: cart.payerContactId },
        select: { firstName: true, lastName: true },
      });
      if (c) return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Famille';
    }
    return 'Famille';
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

  // ------------------------------------------------------------------
  // Email
  // ------------------------------------------------------------------

  private async sendCartValidatedEmail(
    clubId: string,
    cartId: string,
  ): Promise<void> {
    const cart = await this.getCartById(clubId, cartId);
    if (!cart.invoiceId) return;
    // Destinataire = email du payeur (Member > Contact)
    let to: string | null = null;
    if (cart.payerMember?.email) {
      to = cart.payerMember.email;
    } else if (cart.payerContactId) {
      // Essayer via user lié au contact
      const contact = await this.prisma.contact.findUnique({
        where: { id: cart.payerContactId },
        include: { user: true },
      });
      to = contact?.user?.email ?? null;
    }
    if (!to) return;

    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });
    const preview = await this.computeCartPreview(clubId, cartId);
    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    const { subject, html, text } = renderMembershipCartValidatedEmail({
      clubName: club.name,
      seasonLabel: cart.clubSeason.label,
      payerName: await this.resolvePayerLabel(cart),
      invoiceId: cart.invoiceId,
      totalCents: preview.totalCents,
      items: preview.items,
    });
    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to,
      subject,
      html,
      text,
    });
  }
}
