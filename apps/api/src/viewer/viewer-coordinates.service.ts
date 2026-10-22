import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyMemberLinkRole, MembershipCartStatus } from '@prisma/client';
import {
  type BirthPlace,
  type ContactCoordinates,
  coordinateGapLabelFr,
  coordinateGaps,
  requireAddress,
  requireBirthPlace,
  requireMobilePhone,
} from '../common/coordinates/coordinates';
import { PrismaService } from '../prisma/prisma.service';
import { ViewerCoordinatesTarget } from './dto/viewer-coordinates.input';
import type {
  ViewerCoordinatesGapGraph,
  ViewerCoordinatesGraph,
  ViewerCoordinatesStatusGraph,
} from './models/viewer-coordinates.model';

type ActiveProfile = { memberId: string | null; contactId: string | null };

type CoordinatesPatch = {
  target: ViewerCoordinatesTarget;
  targetId?: string | null;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  birthCity?: string | null;
  birthCityInseeCode?: string | null;
  birthCountryCode?: string | null;
};

const COORDINATE_SELECT = {
  phone: true,
  addressLine: true,
  postalCode: true,
  city: true,
} as const;

const BIRTH_SELECT = {
  birthCity: true,
  birthCityInseeCode: true,
  birthCountryCode: true,
} as const;

function toGraph(
  c: Partial<ContactCoordinates & BirthPlace>,
): ViewerCoordinatesGraph {
  return {
    phone: c.phone ?? null,
    addressLine: c.addressLine ?? null,
    postalCode: c.postalCode ?? null,
    city: c.city ?? null,
    birthCity: c.birthCity ?? null,
    birthCityInseeCode: c.birthCityInseeCode ?? null,
    birthCountryCode: c.birthCountryCode ?? null,
  };
}

/**
 * Coordonnées exigées à l'adhésion en ligne (portail et app mobile).
 *
 * Le contrôle bloquant vit dans `assertCartComplete`, appelé avant toute
 * validation de panier par le payeur : c'est le goulot par lequel passent
 * les nouvelles inscriptions comme les renouvellements d'adhérents dont la
 * fiche date d'avant l'obligation. L'admin ne passe pas par ici.
 */
@Injectable()
export class ViewerCoordinatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadAccount(
    clubId: string,
    profile: ActiveProfile,
  ): Promise<{
    kind: 'MEMBER' | 'CONTACT';
    id: string;
    displayName: string;
    coords: Partial<ContactCoordinates & BirthPlace>;
  }> {
    if (profile.memberId) {
      const m = await this.prisma.member.findFirst({
        where: { id: profile.memberId, clubId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          ...COORDINATE_SELECT,
          ...BIRTH_SELECT,
        },
      });
      if (!m) throw new NotFoundException('Profil introuvable.');
      return {
        kind: 'MEMBER',
        id: m.id,
        displayName: `${m.firstName} ${m.lastName}`.trim(),
        coords: m,
      };
    }
    if (profile.contactId) {
      const c = await this.prisma.contact.findFirst({
        where: { id: profile.contactId, clubId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          ...COORDINATE_SELECT,
        },
      });
      if (!c) throw new NotFoundException('Profil introuvable.');
      return {
        kind: 'CONTACT',
        id: c.id,
        displayName: `${c.firstName} ${c.lastName}`.trim(),
        coords: c,
      };
    }
    throw new BadRequestException('Sélection de profil requise.');
  }

  /** Foyer dont le viewer est PAYEUR, ou null. */
  private async payerFamilyId(
    clubId: string,
    profile: ActiveProfile,
  ): Promise<string | null> {
    const where = profile.memberId
      ? { memberId: profile.memberId }
      : profile.contactId
        ? { contactId: profile.contactId }
        : null;
    if (!where) return null;
    const link = await this.prisma.familyMember.findFirst({
      where: { ...where, linkRole: FamilyMemberLinkRole.PAYER, family: { clubId } },
      select: { familyId: true },
    });
    return link?.familyId ?? null;
  }

  private async loadOwnedCart(
    clubId: string,
    profile: ActiveProfile,
    cartId: string,
  ) {
    const familyId = await this.payerFamilyId(clubId, profile);
    const cart = await this.prisma.membershipCart.findFirst({
      where: { id: cartId, clubId },
      select: {
        id: true,
        familyId: true,
        status: true,
        items: {
          select: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ...COORDINATE_SELECT,
                ...BIRTH_SELECT,
              },
            },
          },
        },
        pendingItems: {
          where: { convertedToMemberId: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ...COORDINATE_SELECT,
            ...BIRTH_SELECT,
          },
        },
      },
    });
    if (!cart || !familyId || cart.familyId !== familyId) {
      throw new BadRequestException('Projet d’adhésion hors de votre foyer.');
    }
    return cart;
  }

  async status(
    clubId: string,
    profile: ActiveProfile,
    cartId: string | null,
  ): Promise<ViewerCoordinatesStatusGraph> {
    const account = await this.loadAccount(clubId, profile);
    const gaps: ViewerCoordinatesGapGraph[] = [];

    const cart = cartId
      ? await this.loadOwnedCart(clubId, profile, cartId)
      : null;
    // Le payeur adhérent figure dans les lignes du panier : on le traite
    // comme fiche « compte », avec le lieu de naissance en plus, plutôt
    // que de le lister deux fois.
    const accountInCart =
      account.kind === 'MEMBER' &&
      !!cart?.items.some((i) => i.member.id === account.id);
    const accountGaps = coordinateGaps(account.coords, {
      requireBirthPlace: accountInCart,
    });
    if (accountGaps.length > 0) {
      gaps.push({
        target: ViewerCoordinatesTarget.ACCOUNT,
        targetId: null,
        displayName: account.displayName,
        missing: accountGaps,
        requiresBirthPlace: accountInCart,
        current: toGraph(account.coords),
      });
    }

    if (cart) {
      const seen = new Set<string>();
      for (const item of cart.items) {
        const m = item.member;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (account.kind === 'MEMBER' && m.id === account.id) continue;
        const missing = coordinateGaps(m, { requireBirthPlace: true });
        if (missing.length === 0) continue;
        gaps.push({
          target: ViewerCoordinatesTarget.MEMBER,
          targetId: m.id,
          displayName: `${m.firstName} ${m.lastName}`.trim(),
          missing,
          requiresBirthPlace: true,
          current: toGraph(m),
        });
      }
      for (const p of cart.pendingItems) {
        const missing = coordinateGaps(p, { requireBirthPlace: true });
        if (missing.length === 0) continue;
        gaps.push({
          target: ViewerCoordinatesTarget.PENDING_ITEM,
          targetId: p.id,
          displayName: `${p.firstName} ${p.lastName}`.trim(),
          missing,
          requiresBirthPlace: true,
          current: toGraph(p),
        });
      }
    }

    return {
      account: toGraph(account.coords),
      accountComplete: coordinateGaps(account.coords, {
        requireBirthPlace: false,
      }).length === 0,
      gaps,
    };
  }

  /** Avant d'ajouter quelqu'un au panier : le compte payeur doit être complet. */
  async assertAccountComplete(
    clubId: string,
    profile: ActiveProfile,
  ): Promise<{ phone: string; addressLine: string; postalCode: string; city: string }> {
    const account = await this.loadAccount(clubId, profile);
    const missing = coordinateGaps(account.coords, { requireBirthPlace: false });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Complétez d’abord les coordonnées de votre compte (${missing
          .map(coordinateGapLabelFr)
          .join(', ')}).`,
      );
    }
    // Complet = déjà contrôlé par coordinateGaps ; on renvoie la forme normalisée.
    return {
      phone: requireMobilePhone(account.coords.phone),
      ...requireAddress(account.coords),
    };
  }

  /** Goulot de validation du panier côté payeur : refuse toute fiche incomplète. */
  async assertCartComplete(
    clubId: string,
    profile: ActiveProfile,
    cartId: string,
  ): Promise<void> {
    const { gaps } = await this.status(clubId, profile, cartId);
    if (gaps.length === 0) return;
    const detail = gaps
      .map(
        (g) =>
          `${g.displayName} : ${g.missing
            .map((k) => coordinateGapLabelFr(k as never))
            .join(', ')}`,
      )
      .join(' ; ');
    throw new BadRequestException(
      `Coordonnées incomplètes avant validation — ${detail}.`,
    );
  }

  async update(
    clubId: string,
    profile: ActiveProfile,
    input: CoordinatesPatch,
  ): Promise<ViewerCoordinatesStatusGraph> {
    const phone = requireMobilePhone(input.phone);
    const address = requireAddress(input);
    const hasBirthInput = !!(input.birthCity || input.birthCountryCode);

    switch (input.target) {
      case ViewerCoordinatesTarget.ACCOUNT: {
        const account = await this.loadAccount(clubId, profile);
        if (account.kind === 'MEMBER') {
          await this.prisma.member.update({
            where: { id: account.id },
            data: {
              phone,
              ...address,
              ...(hasBirthInput ? requireBirthPlace(input) : {}),
            },
          });
        } else {
          await this.prisma.contact.update({
            where: { id: account.id },
            data: { phone, ...address },
          });
        }
        return this.status(clubId, profile, null);
      }
      case ViewerCoordinatesTarget.MEMBER: {
        if (!input.targetId) throw new BadRequestException('Membre requis.');
        const familyId = await this.payerFamilyId(clubId, profile);
        const link = familyId
          ? await this.prisma.familyMember.findFirst({
              where: { familyId, memberId: input.targetId, member: { clubId } },
              select: { memberId: true },
            })
          : null;
        if (!link) {
          throw new BadRequestException('Adhérent hors de votre foyer.');
        }
        await this.prisma.member.update({
          where: { id: input.targetId },
          data: { phone, ...address, ...requireBirthPlace(input) },
        });
        return this.status(clubId, profile, null);
      }
      case ViewerCoordinatesTarget.PENDING_ITEM: {
        if (!input.targetId) {
          throw new BadRequestException('Inscription requise.');
        }
        const familyId = await this.payerFamilyId(clubId, profile);
        const pending = familyId
          ? await this.prisma.membershipCartPendingItem.findFirst({
              where: {
                id: input.targetId,
                convertedToMemberId: null,
                cart: {
                  clubId,
                  familyId,
                  status: MembershipCartStatus.OPEN,
                },
              },
              select: { id: true },
            })
          : null;
        if (!pending) {
          throw new BadRequestException('Inscription hors de votre panier.');
        }
        await this.prisma.membershipCartPendingItem.update({
          where: { id: pending.id },
          data: { phone, ...address, ...requireBirthPlace(input) },
        });
        return this.status(clubId, profile, null);
      }
    }
  }
}
