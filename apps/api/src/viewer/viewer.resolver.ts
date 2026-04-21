import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { AcceptFamilyInviteInput } from '../families/dto/accept-family-invite.input';
import { CreateFamilyInviteInput } from '../families/dto/create-family-invite.input';
import { FamilyInviteService } from '../families/family-invite.service';
import { FamilyInviteCreateResultGraph } from '../families/models/family-invite-create-result.model';
import { ViewerJoinFamilyByPayerEmailInput } from './dto/viewer-join-family-by-payer-email.input';
import { ViewerPromoteSelfToMemberInput } from './dto/viewer-promote-self-to-member.input';
import { ViewerRegisterChildMemberInput } from './dto/viewer-register-child-member.input';
import {
  ViewerRegisterSelfAsMemberInput,
  ViewerToggleCartItemLicenseInput,
  ViewerUpdateCartItemInput,
} from './dto/viewer-membership-cart.input';
import { ViewerUpdateMyProfileInput } from './dto/viewer-update-my-profile.input';
import { ViewerUpdateMyPseudoInput } from './dto/viewer-update-my-pseudo.input';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerCheckoutSessionGraph } from './models/viewer-checkout-session.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerFamilyJoinResultGraph } from './models/viewer-family-join-result.model';
import { ViewerMemberGraph } from './models/viewer-member.model';
import { ViewerMemberCreatedResultGraph } from './models/viewer-member-created-result.model';
import { ViewerMembershipFormulaGraph } from './models/viewer-membership-formula.model';
import { ViewerService } from './viewer.service';
import { MembershipCartGraph } from '../membership/models/membership-cart.model';
import { toMembershipCartGraph } from '../membership/membership-cart.mapper';
import { MembershipCartService } from '../membership/membership-cart.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
export class ViewerResolver {
  constructor(
    private readonly viewer: ViewerService,
    private readonly familyInvites: FamilyInviteService,
    private readonly membershipCart: MembershipCartService,
  ) {}

  @Query(() => ViewerMemberGraph, { name: 'viewerMe' })
  viewerMe(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerMemberGraph> {
    if (user.activeProfileMemberId) {
      return this.viewer.viewerMe(
        club.id,
        user.activeProfileMemberId,
        user.userId,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.viewerMeAsContact(
        club.id,
        user.activeProfileContactId,
        user.userId,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Query(() => [ViewerCourseSlotGraph], { name: 'viewerUpcomingCourseSlots' })
  @RequireClubModule(ModuleCode.PLANNING)
  viewerUpcomingCourseSlots(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerCourseSlotGraph[]> {
    if (user.activeProfileContactId || !user.activeProfileMemberId) {
      return Promise.resolve([]);
    }
    return this.viewer.viewerUpcomingCourseSlots(
      club.id,
      user.activeProfileMemberId,
    );
  }

  @Query(() => ViewerFamilyBillingSummaryGraph, {
    name: 'viewerFamilyBillingSummary',
  })
  @RequireClubModule(ModuleCode.PAYMENT)
  viewerFamilyBillingSummary(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    if (user.activeProfileMemberId) {
      return this.viewer.viewerFamilyBillingSummary(
        club.id,
        user.activeProfileMemberId,
        user.userId,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.viewerFamilyBillingSummaryForContact(
        club.id,
        user.activeProfileContactId,
        user.userId,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Mutation(() => ViewerFamilyJoinResultGraph, {
    name: 'viewerJoinFamilyByPayerEmail',
    description:
      'Rattache le profil actif (fiche adhérent ou contact) à un foyer existant en saisissant l’e-mail du payeur (ou du membre seul du foyer).',
  })
  @RequireClubModule(ModuleCode.FAMILIES)
  viewerJoinFamilyByPayerEmail(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerJoinFamilyByPayerEmailInput,
  ): Promise<ViewerFamilyJoinResultGraph> {
    if (user.activeProfileMemberId) {
      return this.viewer.viewerJoinFamilyByPayerEmail(
        club.id,
        user.activeProfileMemberId,
        input.payerEmail,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.contactJoinFamilyByPayerEmail(
        club.id,
        user.activeProfileContactId,
        user.userId,
        input.payerEmail,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Mutation(() => FamilyInviteCreateResultGraph, {
    name: 'createFamilyInvite',
    description:
      'Génère un code et un lien d’invitation pour rattacher un proche au foyer du viewer (COPAYER ou VIEWER).',
  })
  @RequireClubModule(ModuleCode.FAMILIES)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createFamilyInvite(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: CreateFamilyInviteInput,
  ): Promise<FamilyInviteCreateResultGraph> {
    return this.familyInvites.createInvite(
      club.id,
      user.userId,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      input.role,
    );
  }

  @Mutation(() => ViewerFamilyJoinResultGraph, {
    name: 'acceptFamilyInvite',
    description:
      'Accepte une invitation de rattachement à un foyer (code ou lien).',
  })
  @RequireClubModule(ModuleCode.FAMILIES)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  acceptFamilyInvite(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: AcceptFamilyInviteInput,
  ): Promise<ViewerFamilyJoinResultGraph> {
    return this.familyInvites.acceptInvite(input.code, club.id, user.userId, {
      memberId: user.activeProfileMemberId ?? null,
      contactId: user.activeProfileContactId ?? null,
    });
  }

  @Mutation(() => ViewerMemberCreatedResultGraph, {
    name: 'viewerPromoteSelfToMember',
    description:
      'Promeut le contact actif en fiche adhérent (civilité + date de naissance optionnelle). L’admin complète ensuite la formule d’adhésion et la facturation.',
  })
  @RequireClubModule(ModuleCode.MEMBERS)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  viewerPromoteSelfToMember(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerPromoteSelfToMemberInput,
  ): Promise<ViewerMemberCreatedResultGraph> {
    if (!user.activeProfileContactId) {
      throw new BadRequestException(
        'Cette action nécessite un profil contact actif.',
      );
    }
    return this.viewer.viewerPromoteSelfToMember(
      club.id,
      user.activeProfileContactId,
      user.userId,
      {
        civility: input.civility,
        birthDate: input.birthDate ?? null,
        membershipProductId: input.membershipProductId ?? null,
        billingRhythm: input.billingRhythm ?? null,
      },
    );
  }

  @Query(() => [ViewerMembershipFormulaGraph], {
    name: 'viewerEligibleMembershipFormulas',
    description:
      'Formules d\u2019adh\u00e9sion du club compatibles avec la date de naissance donn\u00e9e (utilis\u00e9 par le portail avant cr\u00e9ation de la fiche adh\u00e9rent).',
  })
  @RequireClubModule(ModuleCode.PAYMENT)
  viewerEligibleMembershipFormulas(
    @CurrentClub() club: Club,
    @Args('birthDate', { type: () => String }) birthDate: string,
  ): Promise<ViewerMembershipFormulaGraph[]> {
    return this.viewer.viewerEligibleMembershipFormulas(club.id, birthDate);
  }

  @Mutation(() => ViewerMemberCreatedResultGraph, {
    name: 'viewerRegisterChildMember',
    description:
      'Crée une fiche adhérent mineure rattachée au foyer du viewer payeur. L’admin complète la formule d’adhésion et la facturation.',
  })
  @RequireClubModule(ModuleCode.MEMBERS)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  viewerRegisterChildMember(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerRegisterChildMemberInput,
  ): Promise<ViewerMemberCreatedResultGraph> {
    return this.viewer.viewerRegisterChildMember(
      club.id,
      user.userId,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      {
        firstName: input.firstName,
        lastName: input.lastName,
        civility: input.civility,
        birthDate: input.birthDate,
        membershipProductId: input.membershipProductId ?? null,
        billingRhythm: input.billingRhythm ?? null,
      },
    );
  }

  @Mutation(() => ViewerMemberGraph, { name: 'viewerUpdateMyProfile' })
  viewerUpdateMyProfile(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerUpdateMyProfileInput,
  ): Promise<ViewerMemberGraph> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException(
        'Cette action nécessite une fiche adhérent active.',
      );
    }
    return this.viewer.updateMyProfile(
      club.id,
      user.activeProfileMemberId,
      user.userId,
      input,
    );
  }

  @Mutation(() => ViewerMemberGraph, { name: 'viewerUpdateMyPseudo' })
  @RequireClubModule(ModuleCode.MESSAGING)
  viewerUpdateMyPseudo(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerUpdateMyPseudoInput,
  ): Promise<ViewerMemberGraph> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException(
        'Cette action nécessite une fiche adhérent active.',
      );
    }
    return this.viewer.updateMyPseudo(
      club.id,
      user.activeProfileMemberId,
      user.userId,
      input.pseudo,
    );
  }

  @Mutation(() => ViewerCheckoutSessionGraph, {
    name: 'viewerCreateInvoiceCheckoutSession',
    description:
      'Crée une session Stripe Checkout pour régler une facture du foyer viewer. Retourne l’URL hébergée Stripe.',
  })
  @RequireClubModule(ModuleCode.PAYMENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  viewerCreateInvoiceCheckoutSession(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('invoiceId') invoiceId: string,
  ): Promise<ViewerCheckoutSessionGraph> {
    return this.viewer.viewerCreateInvoiceCheckoutSession({
      clubId: club.id,
      invoiceId,
      activeProfile: {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      viewerUserId: user.userId,
    });
  }

  // ------------------------------------------------------------------
  // Projet d'adhésion (cart) — portail
  // ------------------------------------------------------------------

  @Query(() => [MembershipCartGraph], { name: 'viewerMembershipCarts' })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerMembershipCarts(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<MembershipCartGraph[]> {
    const carts = await this.viewer.viewerListMembershipCarts(club.id, {
      memberId: user.activeProfileMemberId ?? null,
      contactId: user.activeProfileContactId ?? null,
    });
    const result: MembershipCartGraph[] = [];
    for (const c of carts) {
      const preview = await this.membershipCart.computeCartPreview(
        club.id,
        c.id,
      );
      const full = await this.membershipCart.getCartById(club.id, c.id);
      result.push(toMembershipCartGraph(full, preview));
    }
    return result;
  }

  @Query(() => MembershipCartGraph, {
    name: 'viewerActiveMembershipCart',
    nullable: true,
  })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerActiveMembershipCart(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<MembershipCartGraph | null> {
    const cart = await this.viewer.viewerActiveMembershipCart(club.id, {
      memberId: user.activeProfileMemberId ?? null,
      contactId: user.activeProfileContactId ?? null,
    });
    if (!cart) return null;
    const full = await this.membershipCart.getCartById(club.id, cart.id);
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      cart.id,
    );
    return toMembershipCartGraph(full, preview);
  }

  @Mutation(() => MembershipCartGraph, {
    name: 'viewerOpenMembershipCart',
    description:
      'Ouvre ou récupère le projet d’adhésion actif du foyer pour la saison courante. Crée un nouveau cart OPEN si le précédent est VALIDATED (ajout mi-saison).',
  })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerOpenMembershipCart(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<MembershipCartGraph> {
    const cart = await this.viewer.viewerEnsureOpenMembershipCart(club.id, {
      memberId: user.activeProfileMemberId ?? null,
      contactId: user.activeProfileContactId ?? null,
    });
    const full = await this.membershipCart.getCartById(club.id, cart.id);
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      cart.id,
    );
    return toMembershipCartGraph(full, preview);
  }

  @Mutation(() => MembershipCartGraph, { name: 'viewerUpdateCartItem' })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerUpdateCartItem(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerUpdateCartItemInput,
  ): Promise<MembershipCartGraph> {
    const item = await this.viewer.viewerUpdateMembershipCartItem(
      club.id,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      input.itemId,
      { billingRhythm: input.billingRhythm ?? null },
    );
    const full = await this.membershipCart.getCartById(club.id, item.cartId);
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      item.cartId,
    );
    return toMembershipCartGraph(full, preview);
  }

  @Mutation(() => MembershipCartGraph, { name: 'viewerToggleCartItemLicense' })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerToggleCartItemLicense(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerToggleCartItemLicenseInput,
  ): Promise<MembershipCartGraph> {
    const item = await this.viewer.viewerToggleMembershipCartItemLicense(
      club.id,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      input.itemId,
      input.hasExistingLicense,
      input.existingLicenseNumber ?? null,
    );
    const full = await this.membershipCart.getCartById(club.id, item.cartId);
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      item.cartId,
    );
    return toMembershipCartGraph(full, preview);
  }

  @Mutation(() => MembershipCartGraph, { name: 'viewerRemoveCartItem' })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerRemoveCartItem(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('itemId') itemId: string,
  ): Promise<MembershipCartGraph> {
    const { cartId } = await this.viewer.viewerRemoveMembershipCartItem(
      club.id,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      itemId,
    );
    const full = await this.membershipCart.getCartById(club.id, cartId);
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      cartId,
    );
    return toMembershipCartGraph(full, preview);
  }

  @Mutation(() => MembershipCartGraph, { name: 'viewerValidateMembershipCart' })
  @RequireClubModule(ModuleCode.MEMBERS)
  async viewerValidateMembershipCart(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('cartId') cartId: string,
  ): Promise<MembershipCartGraph> {
    const cart = await this.viewer.viewerValidateMembershipCart(
      club.id,
      user.userId,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      cartId,
    );
    const preview = await this.membershipCart.computeCartPreview(
      club.id,
      cart.id,
    );
    return toMembershipCartGraph(cart, preview);
  }

  @Mutation(() => ViewerMemberCreatedResultGraph, {
    name: 'viewerRegisterSelfAsMember',
    description:
      'Promeut le contact viewer en fiche adhérent et l’ajoute au projet d’adhésion actif (flux self-register).',
  })
  @RequireClubModule(ModuleCode.MEMBERS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  viewerRegisterSelfAsMember(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerRegisterSelfAsMemberInput,
  ): Promise<ViewerMemberCreatedResultGraph> {
    return this.viewer.viewerRegisterSelfAsMember(
      club.id,
      user.userId,
      {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      {
        civility: input.civility,
        birthDate: input.birthDate,
      },
    );
  }
}
