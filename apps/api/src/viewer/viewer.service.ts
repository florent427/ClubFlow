import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberCivility,
  MemberClubRole,
  MemberStatus,
  SubscriptionBillingRhythm,
  type Prisma,
} from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { ClubContactsService } from '../members/club-contacts.service';
import {
  assertMemberEmailAllowedInClub,
  normalizeMemberEmail,
} from '../members/member-email-family-rule';
import { memberMatchesMembershipProduct } from '../membership/membership-eligibility';
import { MembershipService } from '../membership/membership.service';
import { MembershipCartService } from '../membership/membership-cart.service';
import { ViewerMembershipFormulaGraph } from './models/viewer-membership-formula.model';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { buildInvoiceWhereForHouseholdGroup } from '../families/household-billing.scope';
import {
  ageYearsUtc,
  isStrictlyMinorProfile,
  shouldIncludeMemberInHouseholdViewerProfiles,
} from '../families/viewer-profile-rules';
import { invoicePaymentTotals } from '../payments/invoice-totals';
import { StripeCheckoutService } from '../payments/stripe-checkout.service';
import { PlanningService } from '../planning/planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerInvoicePaymentSnippetGraph } from './models/viewer-invoice-payment-snippet.model';
import {
  ViewerHouseholdObserverGraph,
  ViewerHouseholdPersonGraph,
  ViewerLinkedHouseholdFamilyGraph,
} from './models/viewer-linked-household-family.model';
import { ViewerFamilyJoinResultGraph } from './models/viewer-family-join-result.model';
import { ViewerMemberGraph } from './models/viewer-member.model';
import { MemberPseudoService } from '../messaging/member-pseudo.service';

/**
 * Réduit un input arbitraire au seul ensemble des échéanciers supportés
 * en V1 : 1 (paiement comptant) ou 3 (en 3 fois). Tout autre nombre est
 * borné silencieusement.
 */
function normalizeInstallments(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  return n >= 3 ? 3 : 1;
}

@Injectable()
export class ViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly families: FamiliesService,
    private readonly memberPseudo: MemberPseudoService,
    private readonly clubContacts: ClubContactsService,
    private readonly membership: MembershipService,
    private readonly membershipCart: MembershipCartService,
    private readonly stripeCheckout: StripeCheckoutService,
  ) {}

  /**
   * Ensemble des foyers dont les factures sont accessibles au visiteur dans
   * un groupe foyer étendu : foyers où il est payeur (PAYER) + foyers qui
   * l'ont invité (invitation consommée). Modèle unilatéral.
   */
  private async computeVisibleFamilyIdsInGroup(
    viewerUserId: string,
    householdGroupId: string,
  ): Promise<Set<string>> {
    const [payer, invited] = await Promise.all([
      this.families.viewerPayerFamilyIdsInHouseholdGroup(
        viewerUserId,
        householdGroupId,
      ),
      this.families.viewerInvitedFamilyIdsInHouseholdGroup(
        viewerUserId,
        householdGroupId,
      ),
    ]);
    return new Set([...payer, ...invited]);
  }

  private async buildPayerInvoiceWhereForMember(
    clubId: string,
    memberId: string,
    viewerUserId: string,
  ): Promise<Prisma.InvoiceWhereInput | null> {
    const memberFamilyLinks = await this.prisma.familyMember.findMany({
      where: { memberId, family: { clubId } },
      include: { family: { include: { householdGroup: true } } },
    });
    const householdGroup =
      memberFamilyLinks
        .map((l) => l.family.householdGroup)
        .find((g) => g != null) ?? null;
    if (householdGroup) {
      const visibleFamilyIds = await this.computeVisibleFamilyIdsInGroup(
        viewerUserId,
        householdGroup.id,
      );
      return {
        clubId,
        ...buildInvoiceWhereForHouseholdGroup({
          kind: 'householdGroup',
          householdGroupId: householdGroup.id,
          carrierFamilyId: householdGroup.carrierFamilyId ?? null,
          visibleFamilyIds,
        }),
      };
    }
    const payerLink = memberFamilyLinks.find(
      (l) => l.linkRole === FamilyMemberLinkRole.PAYER,
    );
    if (!payerLink) return null;
    return { clubId, familyId: payerLink.familyId };
  }

  private async buildPayerInvoiceWhereForContact(
    clubId: string,
    contactId: string,
    viewerUserId: string,
  ): Promise<Prisma.InvoiceWhereInput | null> {
    const link = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
        contact: { userId: viewerUserId },
      },
      include: { family: { include: { householdGroup: true } } },
    });
    if (!link) return null;
    const householdGroup = link.family.householdGroup;
    if (householdGroup) {
      const visibleFamilyIds = await this.computeVisibleFamilyIdsInGroup(
        viewerUserId,
        householdGroup.id,
      );
      return {
        clubId,
        ...buildInvoiceWhereForHouseholdGroup({
          kind: 'householdGroup',
          householdGroupId: householdGroup.id,
          carrierFamilyId: householdGroup.carrierFamilyId ?? null,
          visibleFamilyIds,
        }),
      };
    }
    return { clubId, familyId: link.familyId };
  }

  async viewerCreateInvoiceCheckoutSession(args: {
    clubId: string;
    invoiceId: string;
    activeProfile: { memberId: string | null; contactId: string | null };
    viewerUserId: string;
    /** 1 = paiement comptant. 3 = échelonnement Stripe (carte 3 fois). */
    installmentsCount?: number;
  }): Promise<{ url: string; sessionId: string }> {
    const where = args.activeProfile.memberId
      ? await this.buildPayerInvoiceWhereForMember(
          args.clubId,
          args.activeProfile.memberId,
          args.viewerUserId,
        )
      : args.activeProfile.contactId
        ? await this.buildPayerInvoiceWhereForContact(
            args.clubId,
            args.activeProfile.contactId,
            args.viewerUserId,
          )
        : null;
    if (!where) {
      throw new BadRequestException(
        'Seul le payeur du foyer peut régler une facture en ligne.',
      );
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { ...where, id: args.invoiceId, status: InvoiceStatus.OPEN },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable ou déjà réglée.');
    }
    // Verrouille la méthode + l'échéancier sur la facture pour traçabilité
    // back-office (le club voit "carte 3x" comme choix du payeur même si
    // Stripe lui-même retombe en comptant).
    const installments = normalizeInstallments(args.installmentsCount);
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lockedPaymentMethod: ClubPaymentMethod.STRIPE_CARD,
        installmentsCount: installments,
      },
    });
    return this.stripeCheckout.createInvoiceCheckoutSession({
      invoiceId: invoice.id,
      clubId: args.clubId,
      paidByMemberId: args.activeProfile.memberId ?? null,
      installmentsCount: installments,
    });
  }

  /**
   * Verrouille un mode de paiement manuel (espèces / chèque / virement)
   * + un échéancier sur la facture. Le payeur reçoit en retour les
   * instructions de règlement (RIB pour virement, adresse pour chèque,
   * etc.). Le club marquera la facture comme réglée à réception du
   * paiement (ou des paiements si 3×).
   */
  async viewerLockInvoicePaymentChoice(args: {
    clubId: string;
    invoiceId: string;
    activeProfile: { memberId: string | null; contactId: string | null };
    viewerUserId: string;
    method: ClubPaymentMethod;
    installmentsCount?: number;
  }): Promise<{
    invoiceId: string;
    method: ClubPaymentMethod;
    installmentsCount: number;
    instructions: string;
  }> {
    const where = args.activeProfile.memberId
      ? await this.buildPayerInvoiceWhereForMember(
          args.clubId,
          args.activeProfile.memberId,
          args.viewerUserId,
        )
      : args.activeProfile.contactId
        ? await this.buildPayerInvoiceWhereForContact(
            args.clubId,
            args.activeProfile.contactId,
            args.viewerUserId,
          )
        : null;
    if (!where) {
      throw new BadRequestException(
        'Seul le payeur du foyer peut choisir un mode de règlement.',
      );
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { ...where, id: args.invoiceId, status: InvoiceStatus.OPEN },
      select: { id: true, amountCents: true, label: true },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable ou déjà réglée.');
    }
    if (args.method === ClubPaymentMethod.STRIPE_CARD) {
      throw new BadRequestException(
        'Pour la carte bancaire, utilisez `viewerCreateInvoiceCheckoutSession`.',
      );
    }
    const installments = normalizeInstallments(args.installmentsCount);
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lockedPaymentMethod: args.method,
        installmentsCount: installments,
      },
    });
    const instructions = this.buildManualPaymentInstructions({
      method: args.method,
      installments,
      amountCents: invoice.amountCents,
      label: invoice.label,
    });
    return {
      invoiceId: invoice.id,
      method: args.method,
      installmentsCount: installments,
      instructions,
    };
  }

  /**
   * Texte court à afficher au payeur après son choix de mode manuel.
   * V1 : générique, pas encore les coordonnées RIB du club (ce sera
   * une amélioration via Club.iban / Club.bic / Club.mailingAddress).
   */
  private buildManualPaymentInstructions(args: {
    method: ClubPaymentMethod;
    installments: number;
    amountCents: number;
    label: string;
  }): string {
    const perInstall = Math.round(args.amountCents / args.installments);
    const installPart =
      args.installments === 1
        ? `Montant à régler : ${(args.amountCents / 100).toFixed(2)} €.`
        : `Échéancier : ${args.installments} versements de ${(perInstall / 100).toFixed(2)} € (1 par mois).`;
    switch (args.method) {
      case ClubPaymentMethod.MANUAL_TRANSFER:
        return `Virement bancaire — ${installPart} Le club vous transmet ses coordonnées (IBAN/BIC) par e-mail. Indiquez "${args.label}" en référence du virement.`;
      case ClubPaymentMethod.MANUAL_CHECK:
        return `Chèque — ${installPart} Libellez le(s) chèque(s) à l'ordre du club et déposez-les lors du prochain entraînement (ou envoyez-les par courrier).`;
      case ClubPaymentMethod.MANUAL_CASH:
        return `Espèces — ${installPart} Apportez le règlement au club lors du prochain entraînement, contre un reçu.`;
      default:
        return installPart;
    }
  }

  async viewerEligibleMembershipFormulas(
    clubId: string,
    birthDate: string,
    activeProfile?: { memberId: string | null; contactId: string | null },
    identityFirstName?: string | null,
    identityLastName?: string | null,
    excludePendingItemId?: string | null,
  ): Promise<ViewerMembershipFormulaGraph[]> {
    const bd = new Date(birthDate);
    if (Number.isNaN(bd.getTime())) {
      throw new BadRequestException('Date de naissance invalide.');
    }
    const ref = new Date();
    const products = await this.membership.listMembershipProducts(clubId);

    // Pour annoter `alreadyTakenInSeason`, on calcule la liste des
    // productIds déjà pris par cette identité dans la saison active du
    // foyer. Sources cumulées :
    //   1) Member existant matchant identité + ses InvoiceLine
    //      MEMBERSHIP_SUBSCRIPTION (factures OPEN/PAID, saison active)
    //   2) Member existant matchant identité + ses MembershipCartItem
    //      dans un cart OPEN du foyer
    //   3) MembershipCartPendingItem matchant identité dans un cart OPEN
    //      du foyer (sauf `excludePendingItemId` pour le edit context)
    const takenProductIds = await this.computeAlreadyTakenProductIds(
      clubId,
      activeProfile ?? { memberId: null, contactId: null },
      bd,
      identityFirstName?.trim() ?? null,
      identityLastName?.trim() ?? null,
      excludePendingItemId ?? null,
    );

    return products
      .filter((p) =>
        memberMatchesMembershipProduct(
          {
            status: MemberStatus.ACTIVE,
            birthDate: bd,
            gradeLevelId: null,
          },
          {
            minAge: p.minAge,
            maxAge: p.maxAge,
            gradeLevelIds: p.gradeFilters.map((g) => g.gradeLevelId),
          },
          ref,
        ),
      )
      .filter((p) => p.gradeFilters.length === 0)
      .map((p) => ({
        id: p.id,
        label: p.label,
        annualAmountCents: p.annualAmountCents,
        monthlyAmountCents: p.monthlyAmountCents,
        minAge: p.minAge,
        maxAge: p.maxAge,
        allowProrata: p.allowProrata,
        alreadyTakenInSeason: takenProductIds.has(p.id),
      }));
  }

  /**
   * Pour une identité donnée (firstName + lastName + birthDate), liste
   * les productIds déjà pris dans la saison active du foyer du viewer.
   *
   * Match identité **insensible à la casse + accents**, sur :
   *   - Member existant du foyer (firstName + lastName + birthDate)
   *   - PendingItem du cart OPEN (firstName + lastName + birthDate)
   *   - Si activeProfile.contactId, on inclut aussi le Contact lui-même
   *     (cas de l'auto-inscription du payeur)
   *
   * Retourne un Set<productId> représentant tous les produits déjà
   * souscrits / en cours de souscription par cette identité.
   */
  private async computeAlreadyTakenProductIds(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    birthDate: Date,
    firstName: string | null,
    lastName: string | null,
    excludePendingItemId: string | null,
  ): Promise<Set<string>> {
    const taken = new Set<string>();
    if (!firstName || !lastName) {
      return taken;
    }
    // Saison active du club
    const season = await this.prisma.clubSeason.findFirst({
      where: { clubId, isActive: true },
      select: { id: true },
    });
    if (!season) return taken;
    // Foyer du viewer
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) return taken;

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

    // 1) Members du foyer matchant identité
    const familyLinks = await this.prisma.familyMember.findMany({
      where: { familyId, memberId: { not: null } },
      select: {
        memberId: true,
        member: {
          select: { id: true, firstName: true, lastName: true, birthDate: true },
        },
      },
    });
    const matchingMemberIds = familyLinks
      .map((l) => l.member)
      .filter(
        (m): m is NonNullable<typeof m> =>
          m != null && sameIdentity(m.firstName, m.lastName, m.birthDate),
      )
      .map((m) => m.id);

    // 2) Leurs InvoiceLine SUBSCRIPTION pour la saison (factures pas void)
    if (matchingMemberIds.length > 0) {
      const lines = await this.prisma.invoiceLine.findMany({
        where: {
          memberId: { in: matchingMemberIds },
          kind: 'MEMBERSHIP_SUBSCRIPTION',
          membershipProductId: { not: null },
          invoice: {
            clubId,
            clubSeasonId: season.id,
            status: { in: ['OPEN', 'PAID', 'DRAFT'] },
          },
        },
        select: { membershipProductId: true },
      });
      for (const l of lines) {
        if (l.membershipProductId) taken.add(l.membershipProductId);
      }

      // 3) Leurs MembershipCartItem dans un cart OPEN du foyer
      const cartItems = await this.prisma.membershipCartItem.findMany({
        where: {
          memberId: { in: matchingMemberIds },
          cart: {
            clubId,
            familyId,
            clubSeasonId: season.id,
            status: 'OPEN',
          },
          membershipProductId: { not: null },
        },
        select: { membershipProductId: true },
      });
      for (const i of cartItems) {
        if (i.membershipProductId) taken.add(i.membershipProductId);
      }
    }

    // 4) PendingItems du foyer (cart OPEN) matchant identité, sauf le
    //    pending en cours d'édition (excludePendingItemId).
    const pendings = await this.prisma.membershipCartPendingItem.findMany({
      where: {
        cart: {
          clubId,
          familyId,
          clubSeasonId: season.id,
          status: 'OPEN',
        },
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

  async viewerMe(
    clubId: string,
    memberId: string,
    userId: string,
  ): Promise<ViewerMemberGraph> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
      include: { gradeLevel: true },
    });
    if (!m) {
      throw new NotFoundException('Membre introuvable');
    }
    const adminWorkspaceClubId = await resolveAdminWorkspaceClubId(
      this.prisma,
      userId,
      clubId,
    );
    const canAccessClubBackOffice = adminWorkspaceClubId !== null;
    const familyLink = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      select: { familyId: true },
    });
    const hasClubFamily = familyLink != null;
    const canManageMembershipCart = await this.computeCanManageMembershipCart(
      clubId,
      { memberId, contactId: null },
    );
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      pseudo: m.pseudo,
      photoUrl: m.photoUrl,
      email: m.email ?? null,
      phone: m.phone ?? null,
      civility: m.civility,
      medicalCertExpiresAt: m.medicalCertExpiresAt,
      gradeLevelId: m.gradeLevelId,
      gradeLevelLabel: m.gradeLevel?.label ?? null,
      canAccessClubBackOffice,
      adminWorkspaceClubId,
      hasClubFamily,
      canSelfAttachFamilyViaPayerEmail: !hasClubFamily,
      isContactProfile: false,
      hideMemberModules: false,
      telegramLinked: Boolean(m.telegramChatId),
      canManageMembershipCart,
    };
  }

  async updateMyPseudo(
    clubId: string,
    memberId: string,
    userId: string,
    pseudoRaw: string,
  ): Promise<ViewerMemberGraph> {
    await this.memberPseudo.updatePseudoForMember(
      clubId,
      memberId,
      pseudoRaw,
    );
    return this.viewerMe(clubId, memberId, userId);
  }

  async viewerMeAsContact(
    clubId: string,
    contactId: string,
    userId: string,
  ): Promise<ViewerMemberGraph> {
    const c = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
      include: { user: { select: { email: true } } },
    });
    if (!c) {
      throw new NotFoundException('Profil introuvable');
    }
    const adminWorkspaceClubId = await resolveAdminWorkspaceClubId(
      this.prisma,
      userId,
      clubId,
    );
    const canAccessClubBackOffice = adminWorkspaceClubId !== null;
    const payerLink = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      select: { familyId: true },
    });
    const hasClubFamily = payerLink != null;
    const canManageMembershipCart = await this.computeCanManageMembershipCart(
      clubId,
      { memberId: null, contactId },
    );
    return {
      id: contactId,
      firstName: c.firstName,
      lastName: c.lastName,
      pseudo: null,
      photoUrl: c.photoUrl ?? null,
      email: c.user?.email ?? null,
      phone: c.phone ?? null,
      civility: MemberCivility.MR,
      medicalCertExpiresAt: null,
      gradeLevelId: null,
      gradeLevelLabel: null,
      canAccessClubBackOffice,
      adminWorkspaceClubId,
      hasClubFamily,
      canSelfAttachFamilyViaPayerEmail: !hasClubFamily,
      isContactProfile: true,
      hideMemberModules: true,
      telegramLinked: false,
      canManageMembershipCart,
    };
  }

  /**
   * Foyer dont le « contact principal » est identifié par cette e-mail :
   * membre avec rôle PAYER, ou seul membre du foyer (payeur implicite).
   */
  private async findFamilyByPrincipalPayerEmail(
    clubId: string,
    payerEmailRaw: string,
  ): Promise<{ familyId: string } | null> {
    const norm = normalizeMemberEmail(payerEmailRaw);
    if (!norm) {
      return null;
    }
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: { id: true, email: true },
    });
    const payerCandidates = members.filter(
      (x) => normalizeMemberEmail(x.email) === norm,
    );
    for (const m of payerCandidates) {
      const fmLinks = await this.prisma.familyMember.findMany({
        where: { memberId: m.id },
        include: { family: { select: { clubId: true } } },
      });
      for (const l of fmLinks) {
        if (l.family.clubId !== clubId) continue;
        const count = await this.prisma.familyMember.count({
          where: { familyId: l.familyId },
        });
        if (count === 1 || l.linkRole === FamilyMemberLinkRole.PAYER) {
          return { familyId: l.familyId };
        }
      }
    }
    const contacts = await this.prisma.contact.findMany({
      where: {
        clubId,
        user: { email: { equals: norm, mode: 'insensitive' } },
      },
      select: { id: true },
    });
    for (const c of contacts) {
      const payFm = await this.prisma.familyMember.findFirst({
        where: {
          contactId: c.id,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
      });
      if (payFm) {
        return { familyId: payFm.familyId };
      }
    }
    return null;
  }

  async viewerJoinFamilyByPayerEmail(
    clubId: string,
    memberId: string,
    payerEmail: string,
  ): Promise<ViewerFamilyJoinResultGraph> {
    const subject = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
    });
    if (!subject) {
      throw new NotFoundException('Membre introuvable');
    }

    const existingLink = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      select: { familyId: true },
    });
    if (existingLink) {
      throw new BadRequestException(
        'Vous êtes déjà rattaché à un foyer. Contactez le club pour modifier ce rattachement.',
      );
    }

    const target = await this.findFamilyByPrincipalPayerEmail(
      clubId,
      payerEmail,
    );
    if (!target) {
      throw new BadRequestException(
        "Aucun foyer dont le payeur correspond à cette e-mail n'a été trouvé. Vérifiez l'adresse (telle qu'enregistrée au club) ou contactez le secrétariat.",
      );
    }

    const linked = await this.families.linkMemberAsCoParentResidenceFromPayerFamily(
      clubId,
      memberId,
      target.familyId,
    );

    const fam = await this.prisma.family.findFirst({
      where: { id: linked.newFamilyId, clubId },
      select: { label: true },
    });

    return {
      success: true,
      message:
        'Votre foyer « résidence » a été créé dans l’espace familial partagé avec celui du payeur. Vous n’apparaissez pas dans son foyer au club ; vous partagez les factures et les enfants du groupe sur le portail. Actualisez la page.',
      familyId: linked.newFamilyId,
      familyLabel: fam?.label ?? null,
    };
  }

  async contactJoinFamilyByPayerEmail(
    clubId: string,
    contactId: string,
    userId: string,
    payerEmail: string,
  ): Promise<ViewerFamilyJoinResultGraph> {
    const subject = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
    });
    if (!subject) {
      throw new NotFoundException('Profil introuvable');
    }

    const existingPayerLink = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      select: { familyId: true },
    });
    if (existingPayerLink) {
      throw new BadRequestException(
        'Vous êtes déjà rattaché à un foyer. Contactez le club pour modifier ce rattachement.',
      );
    }

    const target = await this.findFamilyByPrincipalPayerEmail(
      clubId,
      payerEmail,
    );
    if (!target) {
      throw new BadRequestException(
        "Aucun foyer dont le payeur correspond à cette e-mail n'a été trouvé. Vérifiez l'adresse (telle qu'enregistrée au club) ou contactez le secrétariat.",
      );
    }

    const linked =
      await this.families.linkContactAsCoParentResidenceFromPayerFamily(
        clubId,
        contactId,
        target.familyId,
      );

    const fam = await this.prisma.family.findFirst({
      where: { id: linked.newFamilyId, clubId },
      select: { label: true },
    });

    return {
      success: true,
      message:
        'Votre espace contact est rattaché à l’espace familial partagé avec celui du payeur. Vous partagez les factures et les enfants du groupe sur le portail. Actualisez la page.',
      familyId: linked.newFamilyId,
      familyLabel: fam?.label ?? null,
    };
  }

  async viewerUpcomingCourseSlots(
    clubId: string,
    memberId: string,
  ): Promise<ViewerCourseSlotGraph[]> {
    const rows =
      await this.planning.listUpcomingCourseSlotsForViewerMember(
        clubId,
        memberId,
      );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      venueName: r.venue.name,
      coachFirstName: r.coachMember.firstName,
      coachLastName: r.coachMember.lastName,
    }));
  }

  /**
   * Dérive un libellé de foyer lisible à partir des noms de famille de ses
   * adhérents/contacts. Ex. « Famille Leperlier-Morel ». Retourne `null` si
   * aucun nom de famille n'est disponible. Aligné sur la logique admin
   * (`deriveFamilyLabel` dans `apps/admin/src/pages/members/FamiliesPage.tsx`).
   */
  private deriveFamilyLabelFromLinks(
    links: Array<{
      member: { lastName: string | null } | null;
      contact: { lastName: string | null } | null;
    }>,
  ): string | null {
    const lastNames = new Set<string>();
    for (const l of links) {
      const ln = (l.contact?.lastName ?? l.member?.lastName ?? '').trim();
      if (ln) lastNames.add(ln);
    }
    if (lastNames.size === 0) return null;
    return `Famille ${[...lastNames].sort().join('-')}`;
  }

  /**
   * Construit une {@link ViewerFamilyBillingSummaryGraph} pour UN foyer
   * (ou groupe de foyers) donné, en tant que payeur.
   *
   * Utilisé par {@link viewerFamilyBillingSummary}, {@link viewerFamilyBillingSummaryForContact},
   * et leurs variantes plurielles (multi-foyer).
   */
  private async buildPayerBillingSummary(params: {
    clubId: string;
    viewerUserId: string;
    payerFamilyId: string;
    payerFamilyLabel: string | null;
    viewerRole: FamilyMemberLinkRole;
    householdGroup: {
      id: string;
      label: string | null;
      carrierFamilyId: string | null;
    } | null;
  }): Promise<ViewerFamilyBillingSummaryGraph> {
    const {
      clubId,
      viewerUserId,
      payerFamilyId,
      payerFamilyLabel,
      viewerRole,
      householdGroup,
    } = params;

    let invoiceWhere: Prisma.InvoiceWhereInput;
    let familyLabel: string | null;
    let familyMemberRows: {
      memberId: string;
      firstName: string;
      lastName: string;
      photoUrl: string | null;
    }[];
    let linkedHouseholdFamilies: ViewerLinkedHouseholdFamilyGraph[] = [];

    if (householdGroup) {
      const nowHg = new Date();
      const [viewerPayerFamilyIds, viewerInvitedFamilyIds] = await Promise.all([
        this.families.viewerPayerFamilyIdsInHouseholdGroup(
          viewerUserId,
          householdGroup.id,
        ),
        this.families.viewerInvitedFamilyIdsInHouseholdGroup(
          viewerUserId,
          householdGroup.id,
        ),
      ]);
      const householdInclusion = {
        viewerPayerFamilyIds,
        viewerInvitedFamilyIds,
      };
      // Factures : modèle unilatéral — on expose les factures des foyers
      // où le viewer est payeur + des foyers dont le payeur l'a invité.
      const visibleFamilyIds = new Set([
        ...viewerPayerFamilyIds,
        ...viewerInvitedFamilyIds,
      ]);
      invoiceWhere = {
        clubId,
        ...buildInvoiceWhereForHouseholdGroup({
          kind: 'householdGroup',
          householdGroupId: householdGroup.id,
          carrierFamilyId: householdGroup.carrierFamilyId ?? null,
          visibleFamilyIds,
        }),
      };
      const groupFamilies = await this.prisma.family.findMany({
        where: { householdGroupId: householdGroup.id, clubId },
        select: { id: true, label: true },
        orderBy: { createdAt: 'asc' },
      });
      const groupFamilyIds = groupFamilies.map((f) => f.id);
      // On charge tous les liens du groupe (members ET contacts) en une
      // seule requête : sert à (a) calculer les labels dérivés de chaque
      // foyer-résidence et du groupe global, (b) construire les membres
      // visibles par foyer, (c) dédupliquer la liste agrégée.
      const allGroupLinks = await this.prisma.familyMember.findMany({
        where: { familyId: { in: groupFamilyIds } },
        include: {
          member: true,
          contact: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      // Observateurs de chaque foyer : utilisateurs ayant consommé une
      // FamilyInvite pointant vers ce foyer. On garde le `role` (COPAYER
      // vs VIEWER) pour que le portail affiche « Co-payeur » ou
      // « Observateur » plutôt qu'un libellé générique.
      const consumedInvites = await this.prisma.familyInvite.findMany({
        where: {
          familyId: { in: groupFamilyIds },
          consumedByUserId: { not: null },
        },
        select: {
          familyId: true,
          consumedByUserId: true,
          role: true,
          consumedAt: true,
        },
        orderBy: { consumedAt: 'desc' },
      });
      const consumerUserIds = [
        ...new Set(
          consumedInvites
            .map((i) => i.consumedByUserId)
            .filter((id): id is string => id != null),
        ),
      ];
      // Prisma ne déclare pas de relation `consumedBy` sur FamilyInvite ;
      // on charge à part les identités lisibles (nom/prénom) depuis
      // Contact / Member pour le club courant.
      const [consumerContacts, consumerMembers] =
        consumerUserIds.length === 0
          ? [[], []]
          : await Promise.all([
              this.prisma.contact.findMany({
                where: {
                  clubId,
                  userId: { in: consumerUserIds },
                },
                select: { userId: true, firstName: true, lastName: true },
              }),
              this.prisma.member.findMany({
                where: {
                  clubId,
                  userId: { in: consumerUserIds },
                },
                select: { userId: true, firstName: true, lastName: true },
              }),
            ]);
      const identityByUserId = new Map<
        string,
        { firstName: string; lastName: string }
      >();
      for (const c of consumerContacts) {
        if (c.userId && !identityByUserId.has(c.userId)) {
          identityByUserId.set(c.userId, {
            firstName: c.firstName,
            lastName: c.lastName,
          });
        }
      }
      for (const m of consumerMembers) {
        if (m.userId && !identityByUserId.has(m.userId)) {
          identityByUserId.set(m.userId, {
            firstName: m.firstName,
            lastName: m.lastName,
          });
        }
      }
      const observersByFamilyId = new Map<
        string,
        ViewerHouseholdObserverGraph[]
      >();
      // Dédup par (familyId, userId) : on garde la dernière invite consommée
      // (les plus récentes sont listées en premier grâce à `orderBy`).
      const seenObserver = new Set<string>();
      for (const inv of consumedInvites) {
        const uid = inv.consumedByUserId;
        if (!uid) continue;
        const key = `${inv.familyId}:${uid}`;
        if (seenObserver.has(key)) continue;
        seenObserver.add(key);
        const profile = identityByUserId.get(uid);
        const arr = observersByFamilyId.get(inv.familyId) ?? [];
        arr.push({
          firstName: profile?.firstName ?? 'Invité',
          lastName: profile?.lastName ?? '',
          role: inv.role,
        });
        observersByFamilyId.set(inv.familyId, arr);
      }

      // Filtrage des foyers affichés : on ne montre la carte d'un foyer que
      // si le visiteur y est payeur OU invité (modèle unilatéral). Sans ça,
      // Samantha verrait une carte vide pour la famille Hoarau.
      const viewerVisibleFamilySet = new Set([
        ...viewerPayerFamilyIds,
        ...viewerInvitedFamilyIds,
      ]);

      for (const gf of groupFamilies) {
        if (!viewerVisibleFamilySet.has(gf.id)) continue;
        const famLinks = allGroupLinks.filter((l) => l.familyId === gf.id);
        const derivedFamLabel = this.deriveFamilyLabelFromLinks(famLinks);
        const visibleInResidence = famLinks.filter(
          (fm) =>
            fm.member &&
            shouldIncludeMemberInHouseholdViewerProfiles(
              viewerUserId,
              fm.member,
              nowHg,
              {
                candidateFamilyId: fm.familyId,
                ...householdInclusion,
              },
            ),
        );
        // Payeurs du foyer : FamilyMember PAYER (member ou contact).
        const payerLinks = famLinks.filter(
          (fm) => fm.linkRole === FamilyMemberLinkRole.PAYER,
        );
        const payers: ViewerHouseholdPersonGraph[] = payerLinks.map((fm) => {
          const first =
            fm.contact?.firstName ?? fm.member?.firstName ?? 'Payeur';
          const last = fm.contact?.lastName ?? fm.member?.lastName ?? '';
          return { firstName: first, lastName: last };
        });
        linkedHouseholdFamilies.push({
          familyId: gf.id,
          label: gf.label ?? derivedFamLabel,
          members: visibleInResidence.map((fm) => ({
            memberId: fm.memberId!,
            firstName: fm.member!.firstName,
            lastName: fm.member!.lastName,
            photoUrl: fm.member!.photoUrl,
          })),
          payers,
          observers: observersByFamilyId.get(gf.id) ?? [],
        });
      }
      // Libellé global du groupe foyer étendu : priorité au libellé saisi
      // par le club, sinon au libellé de la famille payeur, sinon libellé
      // dérivé à partir de tous les noms du groupe.
      const derivedGroupLabel = this.deriveFamilyLabelFromLinks(allGroupLinks);
      familyLabel =
        householdGroup.label ?? payerFamilyLabel ?? derivedGroupLabel;

      const uniq = new Map<
        string,
        {
          memberId: string;
          firstName: string;
          lastName: string;
          photoUrl: string | null;
        }
      >();
      for (const fm of allGroupLinks) {
        if (
          !fm.memberId ||
          !fm.member ||
          !shouldIncludeMemberInHouseholdViewerProfiles(
            viewerUserId,
            fm.member,
            nowHg,
            {
              candidateFamilyId: fm.familyId,
              ...householdInclusion,
            },
          )
        ) {
          continue;
        }
        if (!uniq.has(fm.memberId)) {
          uniq.set(fm.memberId, {
            memberId: fm.memberId,
            firstName: fm.member.firstName,
            lastName: fm.member.lastName,
            photoUrl: fm.member.photoUrl,
          });
        }
      }
      familyMemberRows = [...uniq.values()];
    } else {
      const links = await this.prisma.familyMember.findMany({
        where: { familyId: payerFamilyId },
        include: { member: true, contact: true },
        orderBy: { createdAt: 'asc' },
      });
      familyLabel =
        payerFamilyLabel ?? this.deriveFamilyLabelFromLinks(links);
      familyMemberRows = links
        .filter((fm) => fm.memberId != null && fm.member)
        .map((fm) => ({
          memberId: fm.memberId!,
          firstName: fm.member!.firstName,
          lastName: fm.member!.lastName,
          photoUrl: fm.member!.photoUrl,
        }));
      invoiceWhere = { clubId, familyId: payerFamilyId };
    }

    const paymentInclude = {
      payments: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          paidByMember: { select: { firstName: true, lastName: true } },
          paidByContact: { select: { firstName: true, lastName: true } },
        },
      },
    };
    const [openRows, paidRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...invoiceWhere, status: InvoiceStatus.OPEN },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: paymentInclude,
      }),
      this.prisma.invoice.findMany({
        where: { ...invoiceWhere, status: InvoiceStatus.PAID },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: paymentInclude,
      }),
    ]);

    // Table familyId → label lisible pour étiqueter chaque facture côté
    // portail (utile dans un espace partagé : plusieurs foyers, une facture
    // par foyer responsable).
    const familyLabelById = new Map<string, string>();
    if (householdGroup) {
      for (const lhf of linkedHouseholdFamilies) {
        if (lhf.label?.trim()) familyLabelById.set(lhf.familyId, lhf.label);
      }
    } else if (payerFamilyLabel) {
      familyLabelById.set(payerFamilyId, payerFamilyLabel);
    }

    const toSummary = (inv: (typeof openRows)[0]) => {
      const paidSum = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      const { totalPaidCents, balanceCents } = invoicePaymentTotals(
        inv.amountCents,
        paidSum,
      );
      const payments: ViewerInvoicePaymentSnippetGraph[] = inv.payments.map(
        (p) => ({
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          createdAt: p.createdAt,
          paidByFirstName:
            p.paidByMember?.firstName ?? p.paidByContact?.firstName ?? null,
          paidByLastName:
            p.paidByMember?.lastName ?? p.paidByContact?.lastName ?? null,
        }),
      );
      return {
        id: inv.id,
        familyId: inv.familyId ?? null,
        familyLabel: inv.familyId
          ? (familyLabelById.get(inv.familyId) ?? null)
          : null,
        label: inv.label,
        status: inv.status,
        dueAt: inv.dueAt,
        amountCents: inv.amountCents,
        totalPaidCents,
        balanceCents,
        payments,
      };
    };

    return {
      familyId: payerFamilyId,
      householdGroupId: householdGroup?.id ?? null,
      viewerRoleInFamily: viewerRole,
      isPayerView: true,
      familyLabel,
      invoices: [...openRows.map(toSummary), ...paidRows.map(toSummary)],
      familyMembers: familyMemberRows,
      isHouseholdGroupSpace: householdGroup != null,
      linkedHouseholdFamilies,
    };
  }

  private emptyBillingSummary(): ViewerFamilyBillingSummaryGraph {
    return {
      familyId: null,
      householdGroupId: null,
      viewerRoleInFamily: null,
      isPayerView: false,
      familyLabel: null,
      invoices: [],
      familyMembers: [],
      isHouseholdGroupSpace: false,
      linkedHouseholdFamilies: [],
    };
  }

  async viewerFamilyBillingSummary(
    clubId: string,
    memberId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    const all = await this.viewerAllFamilyBillingSummaries(
      clubId,
      memberId,
      viewerUserId,
    );
    return all[0] ?? this.emptyBillingSummary();
  }

  /**
   * Renvoie TOUS les foyers rattachés au profil adhérent `memberId` où le viewer
   * est payeur (PAYER), dédupliqués par groupe foyer étendu. Les foyers dans le
   * même groupe étendu sont fusionnés en une seule entrée (l'ancien comportement).
   *
   * Cette méthode remplace la logique « un seul foyer » de
   * {@link viewerFamilyBillingSummary} pour gérer le cas où un même
   * contact/membre est rattaché à plusieurs foyers (ex. grand-parent payeur
   * dans 2 foyers distincts de petits-enfants).
   */
  async viewerAllFamilyBillingSummaries(
    clubId: string,
    memberId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph[]> {
    const activeMember = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
    });
    if (!activeMember?.userId) return [];
    if (isStrictlyMinorProfile(activeMember.birthDate, new Date())) return [];

    const memberFamilyLinks = await this.prisma.familyMember.findMany({
      where: { memberId, family: { clubId } },
      include: { family: { include: { householdGroup: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Dédup par groupe foyer étendu (si présent) OU par familyId.
    const seenGroupIds = new Set<string>();
    const seenFamilyIds = new Set<string>();
    const summaries: ViewerFamilyBillingSummaryGraph[] = [];

    for (const link of memberFamilyLinks) {
      if (link.linkRole !== FamilyMemberLinkRole.PAYER) continue;
      const hg = link.family.householdGroup;
      if (hg) {
        if (seenGroupIds.has(hg.id)) continue;
        seenGroupIds.add(hg.id);
      } else {
        if (seenFamilyIds.has(link.familyId)) continue;
        seenFamilyIds.add(link.familyId);
      }
      const summary = await this.buildPayerBillingSummary({
        clubId,
        viewerUserId,
        payerFamilyId: link.familyId,
        payerFamilyLabel: link.family.label ?? null,
        viewerRole: link.linkRole,
        householdGroup: hg
          ? {
              id: hg.id,
              label: hg.label,
              carrierFamilyId: hg.carrierFamilyId ?? null,
            }
          : null,
      });
      summaries.push(summary);
    }

    return summaries;
  }

  /** Facturation portail pour un payeur « contact » (sans fiche adhérent). */
  async viewerFamilyBillingSummaryForContact(
    clubId: string,
    contactId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    const all = await this.viewerAllFamilyBillingSummariesForContact(
      clubId,
      contactId,
      viewerUserId,
    );
    return all[0] ?? this.emptyBillingSummary();
  }

  /**
   * Variante multi-foyers pour un profil « contact ». Renvoie tous les foyers
   * où le contact est PAYER, dédupliqués par groupe foyer étendu.
   */
  async viewerAllFamilyBillingSummariesForContact(
    clubId: string,
    contactId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph[]> {
    const links = await this.prisma.familyMember.findMany({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
        contact: { userId: viewerUserId },
      },
      include: {
        family: { include: { householdGroup: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const seenGroupIds = new Set<string>();
    const seenFamilyIds = new Set<string>();
    const summaries: ViewerFamilyBillingSummaryGraph[] = [];

    for (const link of links) {
      const hg = link.family.householdGroup;
      if (hg) {
        if (seenGroupIds.has(hg.id)) continue;
        seenGroupIds.add(hg.id);
      } else {
        if (seenFamilyIds.has(link.familyId)) continue;
        seenFamilyIds.add(link.familyId);
      }
      const summary = await this.buildPayerBillingSummary({
        clubId,
        viewerUserId,
        payerFamilyId: link.familyId,
        payerFamilyLabel: link.family.label ?? null,
        viewerRole: link.linkRole,
        householdGroup: hg
          ? {
              id: hg.id,
              label: hg.label,
              carrierFamilyId: hg.carrierFamilyId ?? null,
            }
          : null,
      });
      summaries.push(summary);
    }

    return summaries;
  }

  async viewerPromoteSelfToMember(
    clubId: string,
    contactId: string,
    userId: string,
    input: {
      civility: MemberCivility;
      birthDate?: string | null;
      membershipProductId?: string | null;
      billingRhythm?: SubscriptionBillingRhythm | null;
    },
  ): Promise<{ memberId: string; firstName: string; lastName: string }> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!contact) {
      throw new NotFoundException('Profil contact introuvable.');
    }
    if (input.membershipProductId && !input.birthDate) {
      throw new BadRequestException(
        'La date de naissance est requise pour choisir une formule.',
      );
    }
    const res = await this.clubContacts.promoteContactToMember(
      clubId,
      contactId,
      {
        civility: input.civility,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
      },
    );
    if (input.membershipProductId) {
      await this.membership.createMembershipInvoiceDraft(clubId, userId, {
        memberId: res.memberId,
        membershipProductId: input.membershipProductId,
        billingRhythm:
          input.billingRhythm ?? SubscriptionBillingRhythm.ANNUAL,
        effectiveDate: new Date().toISOString(),
      });
    }
    return {
      memberId: res.memberId,
      firstName: contact.firstName,
      lastName: contact.lastName,
    };
  }

  async viewerRegisterChildMember(
    clubId: string,
    userId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    input: {
      firstName: string;
      lastName: string;
      civility: MemberCivility;
      birthDate: string;
      /** Multi-formules : 1 ou plusieurs formules d'adhésion. */
      membershipProductIds: string[];
      billingRhythm?: SubscriptionBillingRhythm | null;
    },
  ): Promise<{
    pendingItemId: string;
    cartId: string;
    firstName: string;
    lastName: string;
  }> {
    let familyId: string | null = null;
    let payerEmail: string | null = null;
    if (activeProfile.memberId) {
      const payerLink = await this.prisma.familyMember.findFirst({
        where: {
          memberId: activeProfile.memberId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      if (!payerLink) {
        throw new BadRequestException(
          'Seul un payeur de foyer peut inscrire un enfant depuis le portail.',
        );
      }
      const me = await this.prisma.member.findFirst({
        where: { id: activeProfile.memberId, clubId },
        select: { email: true },
      });
      familyId = payerLink.familyId;
      payerEmail = me?.email ?? null;
    } else if (activeProfile.contactId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { email: true },
      });
      payerEmail = user?.email ?? null;
      const payerLink = await this.prisma.familyMember.findFirst({
        where: {
          contactId: activeProfile.contactId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      if (payerLink) {
        familyId = payerLink.familyId;
      } else {
        const newFamily = await this.prisma.family.create({
          data: {
            clubId,
            familyMembers: {
              create: [
                {
                  contactId: activeProfile.contactId,
                  linkRole: FamilyMemberLinkRole.PAYER,
                },
              ],
            },
          },
          select: { id: true },
        });
        familyId = newFamily.id;
      }
    } else {
      throw new BadRequestException('Sélection de profil requise');
    }
    if (!payerEmail) {
      throw new BadRequestException(
        'Adresse e-mail du compte payeur introuvable.',
      );
    }
    if (
      !input.membershipProductIds ||
      input.membershipProductIds.length === 0
    ) {
      throw new BadRequestException(
        'Sélectionnez au moins une formule d’adhésion.',
      );
    }
    // On évite le doublon nom+prénom+naissance UNIQUEMENT côté Member réel
    // (pas dans les pending — sinon on bloque les ré-essais après abandon).
    const duplicate = await this.prisma.member.findFirst({
      where: {
        clubId,
        birthDate: new Date(input.birthDate),
        firstName: { equals: input.firstName.trim(), mode: 'insensitive' },
        lastName: { equals: input.lastName.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Un adhérent avec ce prénom, nom et date de naissance existe déjà dans le club.',
      );
    }

    // Pattern PENDING : aucun Member créé maintenant. On stocke un
    // `MembershipCartPendingItem` qui sera matérialisé en Member réel
    // à la validation du cart par le payeur (cf
    // `MembershipCartService.finalizePendingItems`).
    const result = await this.membershipCart.addPendingItemToActiveCart(
      clubId,
      familyId!,
      {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        civility: input.civility === 'MR' ? 'MR' : 'MME',
        birthDate: new Date(input.birthDate),
        email: payerEmail,
        contactId: activeProfile.contactId ?? null,
        membershipProductIds: input.membershipProductIds,
        billingRhythm:
          input.billingRhythm ?? SubscriptionBillingRhythm.ANNUAL,
      },
    );

    return {
      pendingItemId: result.pendingItemId,
      cartId: result.cartId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    };
  }

  async updateMyProfile(
    clubId: string,
    memberId: string,
    userId: string,
    patch: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      photoUrl?: string;
    },
  ): Promise<ViewerMemberGraph> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Membre introuvable');
    const data: Prisma.MemberUpdateInput = {};
    if (patch.firstName !== undefined) data.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) data.lastName = patch.lastName.trim();
    if (patch.phone !== undefined) data.phone = patch.phone.trim() || null;
    if (patch.photoUrl !== undefined)
      data.photoUrl = patch.photoUrl.trim() || null;
    if (patch.email !== undefined) {
      const next = normalizeMemberEmail(patch.email);
      if (next) {
        await assertMemberEmailAllowedInClub(this.prisma, clubId, next, {
          memberId,
        });
        data.email = next;
      }
    }
    await this.prisma.member.update({ where: { id: memberId }, data });
    return this.viewerMe(clubId, memberId, userId);
  }

  /**
   * Met à jour le profil d'un viewer connecté en tant que CONTACT (sans fiche
   * adhérent). Champs éditables : firstName, lastName, phone, photoUrl.
   * L'e-mail n'est pas modifiable ici (géré par le flow de changement d'email
   * du compte utilisateur pour éviter les incohérences de login).
   */
  async updateMyProfileAsContact(
    clubId: string,
    contactId: string,
    userId: string,
    patch: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      photoUrl?: string;
    },
  ): Promise<ViewerMemberGraph> {
    const c = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!c) throw new NotFoundException('Profil contact introuvable');

    const data: Prisma.ContactUpdateInput = {};
    let nextFirstName = c.firstName;
    let nextLastName = c.lastName;
    if (patch.firstName !== undefined) {
      const next = patch.firstName.trim();
      if (!next) {
        throw new BadRequestException('Le prénom est obligatoire.');
      }
      data.firstName = next;
      nextFirstName = next;
    }
    if (patch.lastName !== undefined) {
      const next = patch.lastName.trim();
      if (!next) {
        throw new BadRequestException('Le nom est obligatoire.');
      }
      data.lastName = next;
      nextLastName = next;
    }
    if (patch.phone !== undefined) {
      data.phone = patch.phone.trim() || null;
    }
    if (patch.photoUrl !== undefined) {
      data.photoUrl = patch.photoUrl.trim() || null;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.contact.update({ where: { id: contactId }, data });
      }
      // Synchronise User.displayName quand le prénom/nom changent : aligne
      // le badge utilisé dans le back-office club sur le nom mis à jour.
      if (patch.firstName !== undefined || patch.lastName !== undefined) {
        const displayName = `${nextFirstName} ${nextLastName}`.trim();
        await tx.user.update({
          where: { id: userId },
          data: { displayName },
        });
      }
    });
    return this.viewerMeAsContact(clubId, contactId, userId);
  }

  // ------------------------------------------------------------------
  // Viewer : projet d'adhésion (cart)
  // ------------------------------------------------------------------

  private async resolveViewerFamilyId(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
  ): Promise<string | null> {
    if (activeProfile.memberId) {
      const fm = await this.prisma.familyMember.findFirst({
        where: {
          memberId: activeProfile.memberId,
          family: { clubId },
        },
        select: { familyId: true },
      });
      return fm?.familyId ?? null;
    }
    if (activeProfile.contactId) {
      const fm = await this.prisma.familyMember.findFirst({
        where: {
          contactId: activeProfile.contactId,
          family: { clubId },
        },
        select: { familyId: true },
      });
      return fm?.familyId ?? null;
    }
    return null;
  }

  /**
   * Règle d’accès au projet d’adhésion (portail) :
   *  - le viewer doit être rattaché à un foyer du club,
   *  - il doit être désigné PAYER sur ce foyer,
   *  - s’il est un Member, il doit être adulte (âge ≥ 18 ans ou birthDate inconnue).
   *
   * Les Contacts (payeurs sans fiche adhérent) sont adultes par construction
   * (création de compte portail réservée aux adultes).
   */
  private async computeCanManageMembershipCart(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
  ): Promise<boolean> {
    if (activeProfile.memberId) {
      const row = await this.prisma.familyMember.findFirst({
        where: {
          memberId: activeProfile.memberId,
          family: { clubId },
        },
        select: {
          linkRole: true,
          member: { select: { birthDate: true } },
        },
      });
      if (!row) return false;
      if (row.linkRole !== FamilyMemberLinkRole.PAYER) return false;
      const bd = row.member?.birthDate ?? null;
      if (bd && ageYearsUtc(bd, new Date()) < 18) return false;
      return true;
    }
    if (activeProfile.contactId) {
      const row = await this.prisma.familyMember.findFirst({
        where: {
          contactId: activeProfile.contactId,
          family: { clubId },
        },
        select: { linkRole: true },
      });
      if (!row) return false;
      return row.linkRole === FamilyMemberLinkRole.PAYER;
    }
    return false;
  }

  private async assertViewerCanManageMembershipCart(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
  ): Promise<void> {
    const ok = await this.computeCanManageMembershipCart(clubId, activeProfile);
    if (!ok) {
      throw new BadRequestException(
        'Le projet d’adhésion est réservé aux membres adultes désignés payeurs du foyer.',
      );
    }
  }

  async viewerListMembershipCarts(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    seasonId?: string | null,
  ) {
    if (!(await this.computeCanManageMembershipCart(clubId, activeProfile))) {
      return [];
    }
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) return [];
    return this.membershipCart.listCartsForFamily(clubId, familyId, seasonId);
  }

  async viewerActiveMembershipCart(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    seasonId?: string | null,
  ) {
    if (!(await this.computeCanManageMembershipCart(clubId, activeProfile))) {
      return null;
    }
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) return null;
    const targetSeasonId =
      seasonId ??
      (await this.prisma.clubSeason.findFirst({
        where: { clubId, isActive: true },
        select: { id: true },
      }))?.id ??
      null;
    if (!targetSeasonId) return null;
    return this.membershipCart.findOpenCartForFamily(
      clubId,
      familyId,
      targetSeasonId,
    );
  }

  async viewerEnsureOpenMembershipCart(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    seasonId?: string | null,
  ) {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) {
      throw new BadRequestException(
        'Aucun foyer associé au profil sélectionné.',
      );
    }
    const targetSeasonId =
      seasonId ??
      (await this.prisma.clubSeason.findFirst({
        where: { clubId, isActive: true },
        select: { id: true },
      }))?.id;
    if (!targetSeasonId) {
      throw new BadRequestException('Aucune saison active.');
    }
    // S'il existe un VALIDATED/CANCELLED pour cette saison sans OPEN,
    // on ouvre un nouveau cart OPEN (use-case « ajout mi-saison »).
    const openCart = await this.membershipCart.findOpenCartForFamily(
      clubId,
      familyId,
      targetSeasonId,
    );
    if (openCart) return openCart;
    const created = await this.membershipCart.openAdditionalCart(
      clubId,
      familyId,
      targetSeasonId,
    );
    return this.membershipCart['getCartById'].call(
      this.membershipCart,
      clubId,
      created.id,
    );
  }

  async viewerComputeMembershipCartPreview(clubId: string, cartId: string) {
    return this.membershipCart.computeCartPreview(clubId, cartId);
  }

  async viewerUpdateMembershipCartItem(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    itemId: string,
    patch: {
      billingRhythm?: SubscriptionBillingRhythm | null;
      membershipProductId?: string | null;
    },
  ) {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    await this.assertViewerItemOwnership(clubId, activeProfile, itemId);
    return this.membershipCart.updateItem(clubId, itemId, {
      billingRhythm: patch.billingRhythm ?? undefined,
      membershipProductId: patch.membershipProductId ?? undefined,
    });
  }

  async viewerRemoveMembershipCartItem(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    itemId: string,
  ) {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    await this.assertViewerItemOwnership(clubId, activeProfile, itemId);
    return this.membershipCart.removeItem(clubId, itemId);
  }

  /**
   * Met à jour une inscription en attente du panier : formules choisies
   * + rythme de règlement. L'identité (prénom/nom/date de naissance)
   * reste figée — pour la corriger, on retire et on remet.
   */
  async viewerUpdateMembershipCartPendingItem(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    input: {
      pendingItemId: string;
      membershipProductIds: string[];
      billingRhythm: SubscriptionBillingRhythm;
    },
  ): Promise<{ cartId: string }> {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) {
      throw new BadRequestException('Aucun foyer associé au profil.');
    }
    // Ownership : le pending appartient bien au foyer du viewer.
    const row = await this.prisma.membershipCartPendingItem.findFirst({
      where: { id: input.pendingItemId, cart: { clubId, familyId } },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Inscription en attente introuvable pour votre foyer.',
      );
    }
    return this.membershipCart.updatePendingItem(clubId, input.pendingItemId, {
      membershipProductIds: input.membershipProductIds,
      billingRhythm: input.billingRhythm,
    });
  }

  /**
   * Supprime une inscription en attente du panier (Member non encore créé).
   * L'utilisateur peut retirer un membre tant que le panier est OPEN — c'est
   * lui-même qui décide, aucune validation club requise.
   */
  async viewerRemoveMembershipCartPendingItem(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    pendingItemId: string,
  ): Promise<{ cartId: string }> {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) {
      throw new BadRequestException('Aucun foyer associé au profil.');
    }
    // Ownership : le pending appartient bien au foyer de l'utilisateur.
    const row = await this.prisma.membershipCartPendingItem.findFirst({
      where: { id: pendingItemId, cart: { clubId, familyId } },
      select: { id: true, cartId: true, convertedToMemberId: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Inscription en attente introuvable pour votre foyer.',
      );
    }
    if (row.convertedToMemberId) {
      // Edge case improbable (cart déjà validé) — on refuse pour ne pas
      // créer d'incohérence avec le Member converti.
      throw new BadRequestException(
        'Cette inscription a déjà été convertie en adhérent — impossible de la supprimer ici.',
      );
    }
    await this.membershipCart.removePendingItem(clubId, pendingItemId);
    return { cartId: row.cartId };
  }

  async viewerToggleMembershipCartItemLicense(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    itemId: string,
    hasExistingLicense: boolean,
    existingLicenseNumber: string | null,
  ) {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    await this.assertViewerItemOwnership(clubId, activeProfile, itemId);
    return this.membershipCart.toggleExistingLicense(
      clubId,
      itemId,
      hasExistingLicense,
      existingLicenseNumber,
    );
  }

  async viewerValidateMembershipCart(
    clubId: string,
    userId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    cartId: string,
  ) {
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    const cart = await this.membershipCart['getCartById'].call(
      this.membershipCart,
      clubId,
      cartId,
    );
    if (!familyId || cart.familyId !== familyId) {
      throw new BadRequestException('Projet d’adhésion hors de votre foyer.');
    }
    return this.membershipCart.validateCart(clubId, userId, cartId);
  }

  /**
   * Validation atomique du panier + verrouillage du mode de règlement
   * en une seule transaction visible côté front.
   *
   * Différence avec `viewerValidateMembershipCart` : ici la création des
   * Members + de l'Invoice n'a lieu QUE quand le payeur a explicitement
   * choisi son mode de règlement (carte, chèque, espèces, virement) et
   * son échéancier. Si l'utilisateur ferme la modale de paiement avant
   * d'avoir choisi, rien n'est créé en base — le panier reste en `OPEN`,
   * il peut le modifier (retirer un membre, ajouter une formule…) puis
   * recliquer "Valider et payer".
   *
   * Pour STRIPE_CARD : crée la session Stripe Checkout et retourne l'URL
   * dans `stripeCheckoutUrl`.
   * Pour les méthodes manuelles : retourne `instructions` (texte
   * affiché au payeur).
   */
  async viewerCheckoutMembershipCart(args: {
    clubId: string;
    userId: string;
    activeProfile: { memberId: string | null; contactId: string | null };
    cartId: string;
    method: ClubPaymentMethod;
    installmentsCount?: number;
  }): Promise<{
    cartId: string;
    invoiceId: string;
    method: ClubPaymentMethod;
    installmentsCount: number;
    stripeCheckoutUrl: string | null;
    instructions: string | null;
  }> {
    await this.assertViewerCanManageMembershipCart(
      args.clubId,
      args.activeProfile,
    );
    const familyId = await this.resolveViewerFamilyId(
      args.clubId,
      args.activeProfile,
    );
    const cart = await this.membershipCart['getCartById'].call(
      this.membershipCart,
      args.clubId,
      args.cartId,
    );
    if (!familyId || cart.familyId !== familyId) {
      throw new BadRequestException('Panier d’adhésion hors de votre foyer.');
    }
    const installments = normalizeInstallments(args.installmentsCount);

    // Étape 1 : valider le panier (finalisation pending → Members
    // réels + création Invoice). Le `lockedPaymentMethod` est positionné
    // dès la finalisation pour que le club voie immédiatement le choix
    // du payeur dans son back-office.
    const validatedCart = await this.membershipCart.validateCart(
      args.clubId,
      args.userId,
      args.cartId,
      args.method,
    );
    const invoiceId = validatedCart.invoiceId;
    if (!invoiceId) {
      // Cas dégénéré : aucune invoice produite (panier vide après
      // validation). validateCart aurait normalement déjà jeté.
      throw new BadRequestException(
        'Aucune facture n’a pu être créée pour ce panier.',
      );
    }

    // Étape 2 : poser l'échéancier sur l'Invoice (validateCart ne le
    // gère pas — il ne connaît que la méthode).
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { installmentsCount: installments },
    });

    // Étape 3 : selon la méthode, construire la suite (URL Stripe ou
    // instructions manuelles).
    if (args.method === ClubPaymentMethod.STRIPE_CARD) {
      const session = await this.stripeCheckout.createInvoiceCheckoutSession({
        invoiceId,
        clubId: args.clubId,
        paidByMemberId: args.activeProfile.memberId ?? null,
        installmentsCount: installments,
      });
      return {
        cartId: validatedCart.id,
        invoiceId,
        method: args.method,
        installmentsCount: installments,
        stripeCheckoutUrl: session.url,
        instructions: null,
      };
    }
    const invoiceRow = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { amountCents: true, label: true },
    });
    const instructions = this.buildManualPaymentInstructions({
      method: args.method,
      installments,
      amountCents: invoiceRow.amountCents,
      label: invoiceRow.label,
    });
    return {
      cartId: validatedCart.id,
      invoiceId,
      method: args.method,
      installmentsCount: installments,
      stripeCheckoutUrl: null,
      instructions,
    };
  }

  private async assertViewerItemOwnership(
    clubId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    itemId: string,
  ): Promise<void> {
    const familyId = await this.resolveViewerFamilyId(clubId, activeProfile);
    if (!familyId) {
      throw new BadRequestException('Aucun foyer associé au profil.');
    }
    const row = await this.prisma.membershipCartItem.findFirst({
      where: { id: itemId, cart: { clubId, familyId } },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Ligne de projet introuvable pour votre foyer.',
      );
    }
  }

  /**
   * Auto-inscription adulte : crée un Member depuis le Contact viewer et
   * l'ajoute au projet d'adhésion actif.
   */
  /**
   * Auto-inscription d'un Contact (adulte payeur) au projet d'adhésion.
   *
   * **Comportement v1.5** : ne crée PAS de fiche `Member` immédiatement.
   * Crée seulement un `MembershipCartPendingItem` qui sera matérialisé
   * en Member à la validation du cart (`finalizePendingItems` dans
   * `validateCart`). Si le payeur abandonne, aucun Member fantôme.
   *
   * Multi-formules : `membershipProductIds` accepte 1 à N formules
   * (ex Karaté + Cross Training).
   *
   * Le résultat retourne `pendingItemId` au lieu d'un `memberId`.
   */
  async viewerRegisterSelfAsMember(
    clubId: string,
    userId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    input: {
      civility: MemberCivility;
      birthDate: string;
      membershipProductIds: string[];
      billingRhythm?: SubscriptionBillingRhythm | null;
    },
  ): Promise<{
    pendingItemId: string;
    cartId: string;
    firstName: string;
    lastName: string;
  }> {
    if (activeProfile.memberId) {
      throw new BadRequestException(
        'Ce profil est déjà enregistré comme adhérent du club.',
      );
    }
    if (!activeProfile.contactId) {
      throw new BadRequestException('Sélection de profil requise.');
    }
    if (
      !input.membershipProductIds ||
      input.membershipProductIds.length === 0
    ) {
      throw new BadRequestException(
        'Sélectionnez au moins une formule d’adhésion.',
      );
    }
    // Cette voie d'auto-inscription est un sous-flux du projet d'adhésion :
    // seuls les payeurs (adultes) du foyer peuvent l'emprunter.
    await this.assertViewerCanManageMembershipCart(clubId, activeProfile);
    // Contrôle d'âge sur l'input — un majeur qui s'auto-enregistre ne peut
    // pas revendiquer un âge < 18 ans.
    const bd = new Date(input.birthDate);
    if (!Number.isNaN(bd.getTime()) && ageYearsUtc(bd, new Date()) < 18) {
      throw new BadRequestException(
        'L’auto-inscription est réservée aux adultes. Utilisez « Ajouter un enfant » pour un mineur.',
      );
    }
    const contact = await this.prisma.contact.findFirst({
      where: { id: activeProfile.contactId, clubId },
      include: { user: true },
    });
    if (!contact) {
      throw new NotFoundException('Profil contact introuvable.');
    }
    const email = contact.user?.email ?? null;
    if (!email) {
      throw new BadRequestException(
        'Aucun e-mail rattaché au profil. Créez un compte utilisateur avant inscription.',
      );
    }
    const firstName = contact.firstName?.trim();
    const lastName = contact.lastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException(
        'Prénom et nom obligatoires sur votre profil.',
      );
    }

    // Trouver le foyer cible (créé en amont par l'inscription enfants ;
    // sinon on le crée ici comme avant pour avoir un cart).
    const familyLink = await this.prisma.familyMember.findFirst({
      where: {
        contactId: activeProfile.contactId!,
        family: { clubId },
      },
      select: { familyId: true },
    });
    let familyId = familyLink?.familyId;
    if (!familyId) {
      const family = await this.prisma.family.create({
        data: {
          clubId,
          familyMembers: {
            create: [
              {
                contactId: activeProfile.contactId!,
                linkRole: FamilyMemberLinkRole.PAYER,
              },
            ],
          },
        },
        select: { id: true },
      });
      familyId = family.id;
    }

    // Ajout du pending item dans le cart (création différée du Member)
    const result = await this.membershipCart.addPendingItemToActiveCart(
      clubId,
      familyId,
      {
        firstName,
        lastName,
        civility: input.civility,
        birthDate: new Date(input.birthDate),
        email,
        contactId: activeProfile.contactId,
        membershipProductIds: input.membershipProductIds,
        billingRhythm: input.billingRhythm ?? null,
      },
    );

    return {
      pendingItemId: result.pendingItemId,
      cartId: result.cartId,
      firstName,
      lastName,
    };
  }
}
