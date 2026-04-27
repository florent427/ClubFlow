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
import { MemberPseudoService } from '../messaging/member-pseudo.service';
import {
  PricingRulesEngineService,
  type CartLineSnapshot,
} from './pricing-rules-engine.service';

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
  /**
   * Aperçu des remises pricing-rule qui s'appliqueront à la validation
   * (règles configurées par l'admin dans Settings → Adhésion). Les
   * règles legacy (computeMembershipAdjustments) sont déjà reflétées
   * dans `subscriptionAdjustedCents`. Cette liste expose UNIQUEMENT
   * les remises supplémentaires qui SERONT appliquées.
   */
  pricingRulePreviews: Array<{
    ruleLabel: string;
    deltaAmountCents: number;
    reason: string;
  }>;
};

/**
 * Pendant un calcul de preview, chaque pending item contribue
 * définitivement au total (mêmes règles que validateCart). On expose
 * un breakdown par pending pour que le mapper puisse mettre le bon
 * total sur la carte UI sans re-deviner.
 */
export type CartPendingPreview = {
  pendingItemId: string;
  /** Total final pour ce pending (somme N produits + frais auto - remises). */
  definitiveTotalCents: number;
  /** Détail par produit (utile pour debug + futur affichage UI). */
  perProduct: Array<{
    productId: string;
    subscriptionBaseCents: number;
    subscriptionAdjustedCents: number;
    pricingRulesDeltaCents: number;
  }>;
  oneTimeFeesCents: number;
  /** Aperçu des remises pricing-rule appliquées sur ce pending. */
  pricingRulePreviews: Array<{
    ruleLabel: string;
    deltaAmountCents: number;
    reason: string;
  }>;
};

export type CartPreview = {
  cartId: string;
  familyId: string;
  clubSeasonId: string;
  status: MembershipCartStatus;
  items: CartItemPreview[];
  pendingItems: CartPendingPreview[];
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
    private readonly memberPseudo: MemberPseudoService,
    private readonly pricingRulesEngine: PricingRulesEngineService,
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

    // Avec la contrainte unique composite `(cartId, memberId, productId)`,
    // on cherche par triplet pour idempotence stricte. On accepte qu'un
    // membre ait plusieurs lignes dans le même cart (multi-formules).
    const existing = await this.prisma.membershipCartItem.findFirst({
      where: {
        cartId: cart.id,
        memberId,
        membershipProductId: productId,
      },
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
  // Inscriptions "en attente" (Member pas encore créé)
  // ------------------------------------------------------------------

  /**
   * Ajoute un Contact (adulte) ou un enfant en "pending" dans le cart actif
   * du foyer. Aucune fiche `Member` n'est créée à ce stade : la création
   * effective a lieu uniquement à la validation du cart, via
   * `finalizePendingItems`.
   *
   * Multi-formules : `membershipProductIds` est un array — l'utilisateur
   * choisit toutes les formules auxquelles il veut s'inscrire en un coup
   * (ex Karaté + Cross Training).
   */
  async addPendingItemToActiveCart(
    clubId: string,
    familyId: string,
    input: {
      firstName: string;
      lastName: string;
      civility: 'MR' | 'MME';
      birthDate: Date;
      email: string;
      contactId?: string | null;
      membershipProductIds: string[];
      billingRhythm?: SubscriptionBillingRhythm | null;
    },
  ): Promise<{ cartId: string; pendingItemId: string }> {
    if (input.membershipProductIds.length === 0) {
      throw new BadRequestException(
        'Sélectionnez au moins une formule d’adhésion.',
      );
    }
    const season = await this.prisma.clubSeason.findFirst({
      where: { clubId, isActive: true },
    });
    if (!season) {
      throw new BadRequestException(
        'Aucune saison active pour ce club.',
      );
    }

    // Validation : tous les MembershipProduct existent et appartiennent à
    // ce club (anti-tampering depuis l'UI).
    const products = await this.prisma.membershipProduct.findMany({
      where: { id: { in: input.membershipProductIds }, clubId },
      select: { id: true },
    });
    if (products.length !== input.membershipProductIds.length) {
      throw new BadRequestException(
        'Une ou plusieurs formules sélectionnées sont invalides.',
      );
    }

    const cart = await this.getOrOpenCart(clubId, familyId, season.id, {
      payerContactId: input.contactId ?? null,
    });

    // Garde-fou anti-doublon : refuse si une des formules est déjà
    // prise par cette identité dans la saison active (Member existant,
    // cart item, autre pending). Le frontend grise déjà les options
    // mais on protège aussi côté API contre les appels directs.
    const taken = await this.computePendingTakenProductIds(
      clubId,
      familyId,
      season.id,
      cart.id,
      input.firstName,
      input.lastName,
      input.birthDate,
      null, // pas d'exclusion (création)
    );
    const conflict = input.membershipProductIds.filter((id) => taken.has(id));
    if (conflict.length > 0) {
      throw new BadRequestException(
        `${input.firstName} ${input.lastName} a déjà pris ${conflict.length === 1 ? 'cette formule' : 'ces formules'} pour cette saison.`,
      );
    }

    // Idempotence : si un pending existe déjà sur ce cart pour cette
    // identité (même email + nom complet), on met à jour les formules
    // au lieu de créer un doublon.
    const existing = await this.prisma.membershipCartPendingItem.findFirst({
      where: {
        cartId: cart.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
    if (existing) {
      const updated = await this.prisma.membershipCartPendingItem.update({
        where: { id: existing.id },
        data: {
          civility: input.civility,
          birthDate: input.birthDate,
          membershipProductIds: input.membershipProductIds,
          billingRhythm:
            input.billingRhythm ?? SubscriptionBillingRhythm.ANNUAL,
          contactId: input.contactId ?? existing.contactId,
        },
      });
      return { cartId: cart.id, pendingItemId: updated.id };
    }

    const pending = await this.prisma.membershipCartPendingItem.create({
      data: {
        cartId: cart.id,
        firstName: input.firstName,
        lastName: input.lastName,
        civility: input.civility,
        birthDate: input.birthDate,
        email: input.email,
        contactId: input.contactId ?? null,
        membershipProductIds: input.membershipProductIds,
        billingRhythm: input.billingRhythm ?? SubscriptionBillingRhythm.ANNUAL,
      },
    });
    return { cartId: cart.id, pendingItemId: pending.id };
  }

  /**
   * Liste les `productId` déjà pris par une identité (firstName +
   * lastName + birthDate) dans la saison active du foyer. Sources :
   *   - Member existant matchant identité + InvoiceLine SUBSCRIPTION
   *     pour la saison (factures OPEN/PAID/DRAFT)
   *   - Member existant + MembershipCartItem dans le cart courant
   *   - Autres MembershipCartPendingItem du cart courant matchant
   *     identité (sauf `excludePendingItemId`)
   *
   * Match identité insensible à la casse + accents.
   */
  private async computePendingTakenProductIds(
    clubId: string,
    familyId: string,
    seasonId: string,
    cartId: string,
    firstName: string,
    lastName: string,
    birthDate: Date,
    excludePendingItemId: string | null,
  ): Promise<Set<string>> {
    const taken = new Set<string>();
    const norm = (s: string): string =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
    const targetFirst = norm(firstName);
    const targetLast = norm(lastName);
    const targetBd = new Date(
      Date.UTC(
        birthDate.getUTCFullYear(),
        birthDate.getUTCMonth(),
        birthDate.getUTCDate(),
      ),
    );
    const sameIdentity = (
      f: string | null | undefined,
      l: string | null | undefined,
      b: Date | null | undefined,
    ): boolean => {
      if (!f || !l || !b) return false;
      if (norm(f) !== targetFirst) return false;
      if (norm(l) !== targetLast) return false;
      const bd2 = new Date(
        Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()),
      );
      return bd2.getTime() === targetBd.getTime();
    };

    // Members du foyer matchant l'identité
    const links = await this.prisma.familyMember.findMany({
      where: { familyId, memberId: { not: null } },
      select: {
        member: {
          select: { id: true, firstName: true, lastName: true, birthDate: true },
        },
      },
    });
    const matchingMemberIds = links
      .map((l) => l.member)
      .filter(
        (m): m is NonNullable<typeof m> =>
          m != null && sameIdentity(m.firstName, m.lastName, m.birthDate),
      )
      .map((m) => m.id);

    if (matchingMemberIds.length > 0) {
      // Factures de la saison
      const lines = await this.prisma.invoiceLine.findMany({
        where: {
          memberId: { in: matchingMemberIds },
          kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
          membershipProductId: { not: null },
          invoice: {
            clubId,
            clubSeasonId: seasonId,
            status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
          },
        },
        select: { membershipProductId: true },
      });
      for (const l of lines) {
        if (l.membershipProductId) taken.add(l.membershipProductId);
      }
      // CartItems dans le cart en cours
      const items = await this.prisma.membershipCartItem.findMany({
        where: {
          cartId,
          memberId: { in: matchingMemberIds },
          membershipProductId: { not: null },
        },
        select: { membershipProductId: true },
      });
      for (const i of items) {
        if (i.membershipProductId) taken.add(i.membershipProductId);
      }
    }

    // Autres pending items du même cart matchant l'identité
    const pendings = await this.prisma.membershipCartPendingItem.findMany({
      where: {
        cartId,
        convertedToMemberId: null,
        ...(excludePendingItemId ? { id: { not: excludePendingItemId } } : {}),
      },
      select: {
        firstName: true,
        lastName: true,
        birthDate: true,
        membershipProductIds: true,
      },
    });
    for (const p of pendings) {
      if (sameIdentity(p.firstName, p.lastName, p.birthDate)) {
        for (const pid of p.membershipProductIds) {
          taken.add(pid);
        }
      }
    }

    return taken;
  }

  /**
   * Modifie une inscription en attente : formules sélectionnées et/ou
   * rythme de règlement. L'identité (firstName, lastName, civility,
   * birthDate) reste figée — pour la corriger, on retire et on remet.
   *
   * Garde-fous :
   *  - Le panier doit être en `OPEN` (refus si VALIDATED/CANCELLED).
   *  - Le pending ne doit pas être déjà converti en Member réel
   *    (`convertedToMemberId === null`).
   *  - Les formules ciblées doivent appartenir au club et être
   *    encore actives (non archivées).
   */
  async updatePendingItem(
    clubId: string,
    pendingItemId: string,
    patch: {
      membershipProductIds: string[];
      billingRhythm: SubscriptionBillingRhythm;
    },
  ): Promise<{ cartId: string }> {
    const item = await this.prisma.membershipCartPendingItem.findFirst({
      where: { id: pendingItemId, cart: { clubId } },
      include: { cart: { select: { id: true, status: true } } },
    });
    if (!item) {
      throw new NotFoundException('Inscription en attente introuvable.');
    }
    if (item.convertedToMemberId !== null) {
      throw new BadRequestException(
        'Cette inscription a déjà été convertie en adhérent — utilisez la fiche membre dédiée.',
      );
    }
    if (item.cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException(
        'Le panier est déjà validé — impossible de le modifier.',
      );
    }
    if (
      !Array.isArray(patch.membershipProductIds) ||
      patch.membershipProductIds.length === 0
    ) {
      throw new BadRequestException(
        'Au moins une formule d’adhésion est requise.',
      );
    }
    // Vérifie que toutes les formules existent dans le club et qu'elles
    // ne sont pas archivées (évite qu'un payeur sauvegarde un panier
    // pointant vers une formule supprimée par l'admin).
    const products = await this.prisma.membershipProduct.findMany({
      where: {
        clubId,
        id: { in: patch.membershipProductIds },
        archivedAt: null,
      },
      select: { id: true, monthlyAmountCents: true },
    });
    if (products.length !== patch.membershipProductIds.length) {
      throw new BadRequestException(
        'Une ou plusieurs formules sélectionnées sont indisponibles.',
      );
    }
    if (
      patch.billingRhythm === SubscriptionBillingRhythm.MONTHLY &&
      products.some((p) => p.monthlyAmountCents <= 0)
    ) {
      throw new BadRequestException(
        'Le rythme mensuel n’est pas disponible pour une des formules choisies.',
      );
    }
    // Garde-fou anti-doublon : si le payeur essaie de cocher une
    // formule qui est déjà prise par cette identité ailleurs (autre
    // pending, member existant, facture validée), on refuse. On
    // exclut le pending lui-même de la recherche pour qu'il puisse
    // garder ses propres formules pendant l'édition.
    const cartFull = await this.prisma.membershipCart.findUniqueOrThrow({
      where: { id: item.cart.id },
      select: { familyId: true, clubSeasonId: true },
    });
    const taken = await this.computePendingTakenProductIds(
      clubId,
      cartFull.familyId,
      cartFull.clubSeasonId,
      item.cart.id,
      item.firstName,
      item.lastName,
      item.birthDate,
      pendingItemId, // exclude self
    );
    const conflict = patch.membershipProductIds.filter((id) => taken.has(id));
    if (conflict.length > 0) {
      throw new BadRequestException(
        `${item.firstName} ${item.lastName} a déjà pris ${conflict.length === 1 ? 'cette formule' : 'ces formules'} pour cette saison — impossible de la sélectionner ici.`,
      );
    }
    await this.prisma.membershipCartPendingItem.update({
      where: { id: pendingItemId },
      data: {
        membershipProductIds: patch.membershipProductIds,
        billingRhythm: patch.billingRhythm,
      },
    });
    return { cartId: item.cart.id };
  }

  /**
   * Supprime un pending item (l'utilisateur change d'avis avant validation).
   */
  async removePendingItem(clubId: string, pendingItemId: string): Promise<void> {
    const item = await this.prisma.membershipCartPendingItem.findFirst({
      where: { id: pendingItemId, cart: { clubId } },
      include: { cart: true },
    });
    if (!item) {
      throw new NotFoundException('Inscription en attente introuvable.');
    }
    if (item.cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException(
        'Le projet est déjà validé — impossible de modifier.',
      );
    }
    await this.prisma.membershipCartPendingItem.delete({
      where: { id: pendingItemId },
    });
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

  /**
   * Charge l'historique des cotisations facturées pour une famille
   * dans la saison donnée. Utilisé pour calculer le **rang global** des
   * adhérents dans la grille FAMILY_PROGRESSIVE quand des projets
   * d'adhésion s'étalent dans le temps (septembre puis janvier puis
   * avril, etc.).
   *
   * Retourne le **plus haut montant facturé par membre** (si un membre
   * a 2 formules, on garde la plus chère pour le classement).
   *
   * `excludeInvoiceId` permet d'exclure la facture en cours de
   * création (sinon on compterait double).
   */
  async loadPriorMembershipsForFamily(
    clubId: string,
    familyId: string,
    seasonId: string,
    excludeInvoiceId: string | null,
  ): Promise<{
    entries: Array<{
      memberId: string;
      baseAmountCents: number;
      membershipProductId: string | null;
      invoicedAt: Date;
    }>;
  }> {
    // Toutes les InvoiceLine SUBSCRIPTION du foyer pour cette saison,
    // hors facture en cours et hors factures void.
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        invoice: {
          clubId,
          familyId,
          clubSeasonId: seasonId,
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
          ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
      },
      select: {
        memberId: true,
        membershipProductId: true,
        baseAmountCents: true,
        invoice: { select: { createdAt: true } },
      },
    });
    // Garde la plus haute baseAmount par memberId (un membre peut avoir
    // 2 lignes pour 2 formules — multi-formules — on prend la plus chère).
    const byMember = new Map<
      string,
      {
        memberId: string;
        baseAmountCents: number;
        membershipProductId: string | null;
        invoicedAt: Date;
      }
    >();
    for (const l of lines) {
      const ex = byMember.get(l.memberId);
      if (!ex || l.baseAmountCents > ex.baseAmountCents) {
        byMember.set(l.memberId, {
          memberId: l.memberId,
          baseAmountCents: l.baseAmountCents,
          membershipProductId: l.membershipProductId,
          invoicedAt: l.invoice.createdAt,
        });
      }
    }
    return { entries: Array.from(byMember.values()) };
  }

  /**
   * Charge cart + preview + map des produits référencés dans les
   * pending items en une seule call. Utilisé par les resolvers pour
   * éviter de répéter les 3 calls + ne pas oublier la map.
   */
  async getCartFullForGraph(clubId: string, cartId: string) {
    const cart = await this.getCartById(clubId, cartId);
    const [preview, productsById] = await Promise.all([
      this.computeCartPreview(clubId, cartId),
      this.loadProductsForCartPendingItems(clubId, cart),
    ]);
    return { cart, preview, productsById };
  }

  /**
   * Charge les `MembershipProduct` référencés par les pending items d'un
   * cart pour fournir leurs `label` + `annualAmountCents` au mapper
   * Graph. Sans ça, l'UI portail affiche "Formule abc123…" au lieu du
   * vrai libellé.
   */
  async loadProductsForCartPendingItems(
    clubId: string,
    cart: { pendingItems?: Array<{ membershipProductIds: string[] }> | null },
  ): Promise<
    Map<
      string,
      {
        id: string;
        label: string;
        annualAmountCents: number;
        monthlyAmountCents: number;
        allowProrata: boolean;
        allowFamily: boolean;
        allowPublicAid: boolean;
        allowExceptional: boolean;
        exceptionalCapPercentBp: number | null;
      }
    >
  > {
    const ids = new Set<string>();
    for (const p of cart.pendingItems ?? []) {
      for (const id of p.membershipProductIds) ids.add(id);
    }
    if (ids.size === 0) return new Map();
    const products = await this.prisma.membershipProduct.findMany({
      where: { clubId, id: { in: Array.from(ids) } },
      select: {
        id: true,
        label: true,
        annualAmountCents: true,
        monthlyAmountCents: true,
        allowProrata: true,
        allowFamily: true,
        allowPublicAid: true,
        allowExceptional: true,
        exceptionalCapPercentBp: true,
      },
    });
    return new Map(products.map((p) => [p.id, p]));
  }

  async getCartById(clubId: string, cartId: string) {
    const cart = await this.prisma.membershipCart.findFirst({
      where: { id: cartId, clubId },
      include: {
        items: {
          include: { member: true, product: true },
          orderBy: { createdAt: 'asc' },
        },
        // Inscriptions en attente (Member pas encore créé)
        pendingItems: {
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
    // On compte les MEMBRES distincts ayant au moins une cotisation
    // facturée cette saison — pas le nombre de lignes. Sinon un membre
    // qui prend Karaté + Cross Training compterait pour 2 dans le rang
    // famille (alors qu'il s'agit d'un seul adhérent).
    const distinctMemberLines = await this.prisma.invoiceLine.findMany({
      where: {
        memberId: { in: memberIds },
        kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        invoice: {
          clubId,
          clubSeasonId: seasonId,
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAID] },
        },
      },
      select: { memberId: true },
      distinct: ['memberId'],
    });
    return distinctMemberLines.length;
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
    /**
     * Stocke `subtotalAfterBusinessCents` (post-prorata + post-family
     * legacy) par itemId. Utilisé plus bas dans le snapshot envoyé au
     * PricingRulesEngine pour que les pourcentages soient calculés sur
     * le bon montant — identique à validateCart, sinon le total preview
     * dévie de quelques cents par rapport à la facture finale.
     */
    const subtotalByItemKey = new Map<string, number>();

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
          pricingRulePreviews: [],
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
            club.membershipFullPriceFirstMonths,
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
      // Snapshot post-legacy pour le pricing-engine plus bas (cohérent
      // avec validateCart).
      subtotalByItemKey.set(item.id, subtotalAfterBusinessCents);

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
        pricingRulePreviews: [], // rempli plus bas par le bloc engine
      });
    }

    // ----------------------------------------------------------------
    // Étape 2 : pending items (Members pas encore créés)
    // ----------------------------------------------------------------
    // Mêmes règles que cart.items (prorata + family + frais auto). Le
    // familyCursor continue à monter pour que le 3ᵉ pending soit bien
    // traité comme 3ᵉ adhérent du foyer.
    const pendingItemsPreview: CartPendingPreview[] = [];
    const pendingProducts = await this.loadProductsForCartPendingItems(
      clubId,
      cart,
    );
    const activePending = (cart.pendingItems ?? []).filter(
      (p) => p.convertedToMemberId === null,
    );
    // Snapshot des virtual-itemIds par pending pour pouvoir distribuer
    // les remises pricing-rule au bon pending item plus bas.
    const virtualItemIdsByPending = new Map<string, string[]>();
    // Map virtualItemId → { pendingId, productId, factorBp } pour
    // recalculer correctement les ajustements après l'engine.
    const virtualItemMeta = new Map<
      string,
      { pendingId: string; productId: string; factorBp: number }
    >();
    // Subtotal post-legacy par virtualItemId — utilisé comme base pour
    // les pricing rules, EXACTEMENT comme validateCart.
    const subtotalByVirtualId = new Map<string, number>();
    for (const p of activePending) {
      const virtualIds: string[] = [];
      const perProduct: CartPendingPreview['perProduct'] = [];
      let pendingSubscriptionTotal = 0;
      for (const productId of p.membershipProductIds) {
        const product = pendingProducts.get(productId);
        if (!product) {
          // Produit archivé / supprimé : on ignore silencieusement
          continue;
        }
        const subscriptionBase =
          p.billingRhythm === SubscriptionBillingRhythm.ANNUAL
            ? product.annualAmountCents
            : product.monthlyAmountCents;
        const allowProrataEffective =
          product.allowProrata &&
          p.billingRhythm === SubscriptionBillingRhythm.ANNUAL;
        const factorBp = allowProrataEffective
          ? computeProrataFactorBp(
              new Date(),
              cart.clubSeason.startsOn,
              cart.clubSeason.endsOn,
              club.membershipFullPriceFirstMonths,
            )
          : 10_000;
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
          exceptional: null,
        });
        const virtualItemId = `pending:${p.id}:${productId}`;
        virtualIds.push(virtualItemId);
        virtualItemMeta.set(virtualItemId, {
          pendingId: p.id,
          productId,
          factorBp,
        });
        subtotalByVirtualId.set(virtualItemId, subtotalAfterBusinessCents);
        perProduct.push({
          productId,
          subscriptionBaseCents: subscriptionBase,
          subscriptionAdjustedCents: subtotalAfterBusinessCents,
          pricingRulesDeltaCents: 0, // rempli par l'engine plus bas
        });
        pendingSubscriptionTotal += subtotalAfterBusinessCents;
      }
      // Le pending compte UNE FOIS dans le rang famille (peu importe le
      // nombre de formules), à l'image d'un Member réel qui a 1 cotisation
      // par cart item.
      familyCursor += 1;

      // Frais auto : licence (sauf si déclarée existante — pas dispo en
      // pending v1 car la license se déclare après validation), cotisation
      // foyer, etc. On applique tous les frais autoApply.
      const effectiveFees = autoFees.filter(() => true);
      let feesTotal = 0;
      for (const f of effectiveFees) {
        feesTotal += f.amountCents;
      }

      virtualItemIdsByPending.set(p.id, virtualIds);
      pendingItemsPreview.push({
        pendingItemId: p.id,
        definitiveTotalCents: pendingSubscriptionTotal + feesTotal,
        perProduct,
        oneTimeFeesCents: feesTotal,
        pricingRulePreviews: [],
      });
      total += pendingSubscriptionTotal + feesTotal;
    }

    // ----------------------------------------------------------------
    // Aperçu des remises pricing-rule qui s'appliqueront à validation
    // ----------------------------------------------------------------
    // On évalue les règles SUR LE SNAPSHOT du cart (pas sur des
    // InvoiceLine, qui n'existent pas encore). Le résultat est attaché
    // à chaque CartItemPreview pour que l'UI portail affiche
    // "🎁 Famille progressive : -10% (3ᵉ adhérent du foyer)".
    // Cette preview est **non engageante** : elle reflète l'état actuel
    // des règles ; les vraies remises sont calculées à la validation
    // (et persistées dans InvoiceLineAdjustment).
    try {
      const snapshot: CartLineSnapshot[] = cart.items
        .filter((i) => !i.requiresManualAssignment && i.product)
        .map((i) => {
          const product = i.product!;
          const base =
            i.billingRhythm === SubscriptionBillingRhythm.ANNUAL
              ? product.annualAmountCents
              : product.monthlyAmountCents;
          const allowProrataEffective =
            product.allowProrata &&
            i.billingRhythm === SubscriptionBillingRhythm.ANNUAL;
          const factorBp = allowProrataEffective
            ? computeProrataFactorBp(
                new Date(),
                cart.clubSeason.startsOn,
                cart.clubSeason.endsOn,
                club.membershipFullPriceFirstMonths,
              )
            : 10_000;
          // Le `baseAmountCents` envoyé à l'engine doit être POST-LEGACY
          // (post-prorata + post-family-legacy). Sinon les % se
          // calculent sur un montant supérieur à la facture finale et
          // le total preview dévie. validateCart fait pareil via
          // `subtotalByItemKey.get(itemKey)`.
          const subtotalPostLegacy =
            subtotalByItemKey.get(i.id) ??
            Math.round((base * factorBp) / 10_000);
          return {
            itemId: i.id,
            baseAmountCents: subtotalPostLegacy,
            membershipProductId: product.id,
            category: 'SUBSCRIPTION' as const,
            memberId: i.memberId,
            ageAtReference: null,
            billingRhythm: i.billingRhythm,
            prorataFactorBp: factorBp,
          };
        });
      // Ajoute les pending items (virtual itemIds) au snapshot pour que
      // les pricing-rules s'appliquent identiquement (PRODUCT_BUNDLE,
      // FAMILY_PROGRESSIVE, etc.). À la validation, les Members réels
      // seront créés et l'engine retournera EXACTEMENT les mêmes deltas.
      for (const p of activePending) {
        for (const productId of p.membershipProductIds) {
          const product = pendingProducts.get(productId);
          if (!product) continue;
          const base =
            p.billingRhythm === SubscriptionBillingRhythm.ANNUAL
              ? product.annualAmountCents
              : product.monthlyAmountCents;
          const allowProrataEffective =
            product.allowProrata &&
            p.billingRhythm === SubscriptionBillingRhythm.ANNUAL;
          const factorBp = allowProrataEffective
            ? computeProrataFactorBp(
                new Date(),
                cart.clubSeason.startsOn,
                cart.clubSeason.endsOn,
                club.membershipFullPriceFirstMonths,
              )
            : 10_000;
          const virtualItemId = `pending:${p.id}:${productId}`;
          // Idem cart.items : on envoie le subtotal post-legacy à
          // l'engine pour que les % soient calculés sur le bon montant.
          const subtotalPostLegacy =
            subtotalByVirtualId.get(virtualItemId) ??
            Math.round((base * factorBp) / 10_000);
          snapshot.push({
            itemId: virtualItemId,
            baseAmountCents: subtotalPostLegacy,
            membershipProductId: product.id,
            category: 'SUBSCRIPTION' as const,
            // L'engine n'utilise `memberId` qu'en tant que clé de Map pour
            // dédupliquer (plusieurs formules d'un même membre = 1 rang).
            // On utilise un ID synthétique pour que chaque pending compte
            // comme un membre distinct dans le rang famille.
            memberId: `pending-member:${p.id}`,
            ageAtReference: null,
            billingRhythm: p.billingRhythm,
            prorataFactorBp: factorBp,
          });
        }
      }
      const prior = await this.loadPriorMembershipsForFamily(
        clubId,
        cart.familyId,
        cart.clubSeasonId,
        cart.invoiceId, // exclut l'invoice du cart si déjà créée
      );
      const result = await this.pricingRulesEngine.evaluate(clubId, {
        cart: snapshot,
        prior,
      });
      // Distribue les applications par itemId pour les rattacher au preview
      const previewsByItem = new Map<
        string,
        Array<{
          ruleLabel: string;
          deltaAmountCents: number;
          reason: string;
        }>
      >();
      for (const app of result.applications) {
        for (const a of app.appliedTo) {
          const list = previewsByItem.get(a.itemId) ?? [];
          list.push({
            ruleLabel: app.ruleLabel,
            deltaAmountCents: a.deltaAmountCents,
            reason: a.reason,
          });
          previewsByItem.set(a.itemId, list);
        }
      }
      // Mise à jour des previews + recalcul du total cart pour cart.items
      for (const p of itemsPreview) {
        const previews = previewsByItem.get(p.itemId) ?? [];
        p.pricingRulePreviews = previews;
        const additionalDelta = previews.reduce(
          (s, x) => s + x.deltaAmountCents,
          0,
        );
        p.lineTotalCents += additionalDelta;
        total += additionalDelta;
      }
      // Idem pour les pending items : on agrège les deltas de tous les
      // virtual items d'un même pending dans `pricingRulePreviews` +
      // `definitiveTotalCents`.
      for (const pp of pendingItemsPreview) {
        const virtualIds = virtualItemIdsByPending.get(pp.pendingItemId) ?? [];
        const aggregated: typeof pp.pricingRulePreviews = [];
        let pendingDelta = 0;
        for (const vid of virtualIds) {
          const previews = previewsByItem.get(vid) ?? [];
          for (const x of previews) {
            aggregated.push(x);
            pendingDelta += x.deltaAmountCents;
            // Inscrit aussi le delta sur la perProduct correspondante
            const meta = virtualItemMeta.get(vid);
            if (meta) {
              const pp2 = pp.perProduct.find(
                (e) => e.productId === meta.productId,
              );
              if (pp2) {
                pp2.pricingRulesDeltaCents += x.deltaAmountCents;
              }
            }
          }
        }
        pp.pricingRulePreviews = aggregated;
        pp.definitiveTotalCents += pendingDelta;
        total += pendingDelta;
      }
    } catch (err) {
      // Filet de sécurité : si l'engine plante, le preview reste valide
      // mais sans la prévisualisation des règles. Le preview affichera
      // donc juste les remises legacy (suffisamment informatif).
      // eslint-disable-next-line no-console
      console.error(
        '[membership-cart.preview] PricingRulesEngine plantage non-fatal',
        (err as Error).message,
      );
      for (const p of itemsPreview) {
        if (!p.pricingRulePreviews) p.pricingRulePreviews = [];
      }
    }
    // Garantit le champ même si on n'a pas réussi à le calculer
    for (const p of itemsPreview) {
      if (!p.pricingRulePreviews) p.pricingRulePreviews = [];
    }

    const requiresManualAssignmentCount = itemsPreview.filter(
      (i) => i.requiresManualAssignment,
    ).length;

    // Le cart peut être validé s'il contient au moins UN item réel OU
    // au moins UN pending item (qui sera matérialisé en Member réel à
    // la validation via finalizePendingItems). Sans ça, un foyer qui a
    // tout en pending verrait son bouton "Valider et payer" désactivé
    // et ne pourrait jamais aller au paiement.
    const pendingCount = (cart.pendingItems ?? []).filter(
      (p) => p.convertedToMemberId === null,
    ).length;

    return {
      cartId: cart.id,
      familyId: cart.familyId,
      clubSeasonId: cart.clubSeasonId,
      status: cart.status,
      items: itemsPreview,
      pendingItems: pendingItemsPreview,
      totalCents: total,
      requiresManualAssignmentCount,
      canValidate:
        cart.status === MembershipCartStatus.OPEN &&
        requiresManualAssignmentCount === 0 &&
        (cart.items.length > 0 || pendingCount > 0),
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
    let cart = await this.getCartById(clubId, cartId);
    if (cart.status !== MembershipCartStatus.OPEN) {
      throw new BadRequestException('Le projet est déjà validé ou annulé.');
    }
    // Étape 1 : finaliser les pending items (création des Members réels +
    // CartItems associés). Refresh du cart pour inclure les nouveaux items.
    const pendingCount =
      await this.prisma.membershipCartPendingItem.count({
        where: { cartId, convertedToMemberId: null },
      });
    if (pendingCount > 0) {
      await this.finalizePendingItems(clubId, cartId);
      cart = await this.getCartById(clubId, cartId);
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
    /**
     * Collecte le facteur prorata par (memberId, productId) pour pouvoir
     * le retrouver lors de la construction du snapshot pricing-rule.
     * Permet de proratiser correctement les remises FIXED_CENTS.
     */
    const prorataByItemKey = new Map<string, number>();
    const subtotalByItemKey = new Map<string, number>();

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
        ? computeProrataFactorBp(
            new Date(),
            season.startsOn,
            season.endsOn,
            club.membershipFullPriceFirstMonths,
          )
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
      // Mémorise le facteur prorata + le subtotal POST-prorata pour
      // que le snapshot pricing-rule reflète le montant effectivement
      // facturé (et que les remises % / FIXED soient proratisées
      // correctement).
      const itemKey = `${item.memberId}|${product.id}`;
      prorataByItemKey.set(itemKey, factorBp);
      subtotalByItemKey.set(itemKey, subtotalAfterBusinessCents);
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
    // Rattache la facture au groupe foyer étendu si la famille en fait partie
    // (sinon la facture serait invisible dans l'espace partagé portail).
    const cartFamily = await this.prisma.family.findUnique({
      where: { id: cart.familyId },
      select: { householdGroupId: true },
    });
    const householdGroupId = cartFamily?.householdGroupId ?? null;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          clubId,
          familyId: cart.familyId,
          householdGroupId,
          clubSeasonId: season.id,
          label,
          baseAmountCents: invoiceBaseCents,
          amountCents: invoiceBaseCents,
          status: InvoiceStatus.DRAFT,
          lines: { create: linesCreate },
        },
        include: { lines: { include: { membershipProduct: true } } },
      });

      // ----------------------------------------------------------------
      // Application des règles de remise pattern-based (v2)
      // ----------------------------------------------------------------
      //
      // En complément des remises legacy (computeMembershipAdjustments
      // ci-dessus), on applique les `MembershipPricingRule` configurées
      // par l'admin via Settings → Adhésion → Remises automatiques.
      //
      // Robustesse : si une règle a un configJson cassé, elle est ignorée
      // et loggée (cf PricingRulesEngineService). La facturation continue
      // avec les autres règles + les remises legacy déjà appliquées.
      try {
        const snapshot: CartLineSnapshot[] = inv.lines.map((l) => {
          const itemKey = `${l.memberId}|${l.membershipProductId ?? ''}`;
          const prorataFactorBp =
            prorataByItemKey.get(itemKey) ?? 10_000;
          const subtotalPostProrata =
            subtotalByItemKey.get(itemKey) ?? l.baseAmountCents;
          return {
            itemId: l.id,
            // POST-prorata : montant effectivement facturé pour cette
            // ligne (avant les pricing rules). Permet aux % de se
            // calculer naturellement sur le bon montant.
            baseAmountCents: subtotalPostProrata,
            membershipProductId: l.membershipProductId,
            category:
              l.kind === InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION
                ? ('SUBSCRIPTION' as const)
                : ('ONE_TIME' as const),
            memberId: l.memberId ?? '',
            ageAtReference: null, // TODO : si AGE_RANGE_DISCOUNT actif
            billingRhythm:
              l.subscriptionBillingRhythm ??
              SubscriptionBillingRhythm.ANNUAL,
            // Pour proratiser les remises FIXED_CENTS dans l'engine.
            prorataFactorBp,
          };
        });
        // Récupère l'historique de la famille pour cette saison.
        // Permet à FAMILY_PROGRESSIVE de calculer le rang GLOBAL et à
        // PRODUCT_BUNDLE de détecter le primary déjà acheté dans un
        // projet antérieur.
        const prior = await this.loadPriorMembershipsForFamily(
          clubId,
          cart.familyId,
          cart.clubSeasonId,
          inv.id,
        );
        const result = await this.pricingRulesEngine.evaluate(clubId, {
          cart: snapshot,
          prior,
        });
        // Persister chaque application en InvoiceLineAdjustment
        for (const app of result.applications) {
          for (const a of app.appliedTo) {
            await tx.invoiceLineAdjustment.create({
              data: {
                lineId: a.itemId,
                stepOrder: 100, // après PRORATA (10), FAMILY (20), PUBLIC_AID (30), EXCEPTIONAL (40)
                type: 'EXCEPTIONAL',
                amountCents: a.deltaAmountCents,
                reason: a.reason,
                metadataJson: JSON.stringify({
                  source: 'PRICING_RULE',
                  ruleId: app.ruleId,
                  ruleLabel: app.ruleLabel,
                  pattern: app.pattern,
                }),
              },
            });
          }
        }
        // Logging si erreurs (règles ignorées)
        if (result.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[membership-cart] ${result.errors.length} règle(s) de remise ignorée(s) : ${result.errors.map((e) => `${e.ruleLabel} (${e.error})`).join(' ; ')}`,
          );
        }
      } catch (err) {
        // Filet de sécurité : si l'engine plante complètement, on
        // continue sans bloquer la facturation (les remises legacy
        // sont déjà appliquées sur la facture).
        // eslint-disable-next-line no-console
        console.error(
          '[membership-cart] PricingRulesEngine plantage non-fatal',
          (err as Error).message,
        );
      }

      // ----------------------------------------------------------------
      // Recomputation défensive des totaux facture (source unique de vérité)
      // ----------------------------------------------------------------
      // On refetch toutes les lignes + adjustments pour garantir que
      // Invoice.baseAmountCents et Invoice.amountCents sont COHÉRENTS
      // avec la somme réelle des lignes. Sans ça, si une remise est
      // ajoutée par un autre code path (admin manuel par exemple) ou
      // si une mise à jour passe à travers, le total facture diverge
      // de la somme des lignes — le payeur voit un montant ≠ détail.
      //
      // Convention rétablie :
      //   - baseAmountCents = somme des LINE.baseAmountCents (montant
      //     catalogue brut, AVANT toute remise)
      //   - amountCents = somme de (LINE.baseAmountCents + somme des
      //     adjustments de la ligne) — représente exactement ce que le
      //     payeur doit
      const linesWithAdj = await tx.invoiceLine.findMany({
        where: { invoiceId: inv.id },
        select: {
          baseAmountCents: true,
          adjustments: { select: { amountCents: true } },
        },
      });
      let totalGross = 0;
      let totalNet = 0;
      for (const l of linesWithAdj) {
        totalGross += l.baseAmountCents;
        const adjSum = l.adjustments.reduce((s, a) => s + a.amountCents, 0);
        totalNet += l.baseAmountCents + adjSum;
      }
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          baseAmountCents: totalGross,
          amountCents: Math.max(0, totalNet),
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
  // Conversion pending → Member réel
  // ------------------------------------------------------------------

  /**
   * Pour chaque `MembershipCartPendingItem` non converti du cart :
   *  1. Crée le `Member` réel (status ACTIVE)
   *  2. Rattache au foyer du cart
   *  3. Crée 1 `MembershipCartItem` par formule choisie (multi-formules)
   *  4. Marque le pending comme `convertedToMemberId`
   *
   * Appelée au début de `validateCart` pour matérialiser les inscriptions
   * "en attente" juste avant de créer la facture. Les pending items
   * abandonnés (cart annulé) ne sont jamais convertis.
   */
  private async finalizePendingItems(
    clubId: string,
    cartId: string,
  ): Promise<void> {
    const pendings = await this.prisma.membershipCartPendingItem.findMany({
      where: { cartId, convertedToMemberId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (pendings.length === 0) return;

    const cart = await this.prisma.membershipCart.findUniqueOrThrow({
      where: { id: cartId },
      select: { familyId: true, clubSeasonId: true },
    });

    for (const p of pendings) {
      // 1. Créer le Member
      const pseudo = await this.memberPseudo.pickAvailablePseudo(
        this.prisma,
        clubId,
        p.firstName,
        p.lastName,
        null,
      );
      const member = await this.prisma.member.create({
        data: {
          clubId,
          firstName: p.firstName,
          lastName: p.lastName,
          pseudo,
          civility: p.civility,
          email: p.email,
          birthDate: p.birthDate,
          status: 'ACTIVE',
          // Ne pas hériter du userId : le Contact garde son User mais le
          // Member créé n'a pas de User pour l'instant (il sera lié plus
          // tard si l'admin promeut le Contact en passant par
          // promoteContactToMember, ou via l'email matching).
        },
        select: { id: true },
      });

      // 2. Rattacher au foyer (linkRole=MEMBER)
      await this.prisma.familyMember.create({
        data: {
          familyId: cart.familyId,
          memberId: member.id,
          linkRole: FamilyMemberLinkRole.MEMBER,
        },
      });

      // 3. Créer 1 CartItem par formule sélectionnée (multi-formules
      //    rendu possible par la contrainte unique composite
      //    `(cartId, memberId, productId)` au lieu de `(cartId, memberId)`).
      for (const productId of p.membershipProductIds) {
        // Vérifier que le produit est toujours valide (pas archivé entre
        // l'ajout pending et la validation)
        const product = await this.prisma.membershipProduct.findFirst({
          where: { id: productId, clubId, archivedAt: null },
          select: { id: true },
        });
        if (!product) {
          // Produit supprimé entre temps : on ignore cette formule mais
          // on crée quand même les autres.
          continue;
        }
        // Idempotence : si une ligne (member+product) existe déjà
        // (admin manuel par exemple), on ne crée pas de doublon.
        const existing = await this.prisma.membershipCartItem.findFirst({
          where: {
            cartId,
            memberId: member.id,
            membershipProductId: productId,
          },
        });
        if (existing) continue;
        await this.prisma.membershipCartItem.create({
          data: {
            cartId,
            memberId: member.id,
            membershipProductId: productId,
            requiresManualAssignment: false,
            billingRhythm: p.billingRhythm,
          },
        });
      }

      // 4. Marquer pending comme converti
      await this.prisma.membershipCartPendingItem.update({
        where: { id: p.id },
        data: { convertedToMemberId: member.id },
      });
    }
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
