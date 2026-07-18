import { Injectable } from '@nestjs/common';
import { FamilyMemberLinkRole, type Prisma } from '@prisma/client';
import { buildInvoiceWhereForHouseholdGroup } from '../families/household-billing.scope';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';

/** Profil actif du visiteur : soit une fiche adhérent, soit un contact. */
export type ViewerActiveProfile = {
  memberId: string | null;
  contactId: string | null;
};

/**
 * Périmètre des factures qu'un visiteur du portail peut manipuler **en tant
 * que payeur** (régler en ligne, échelonner, verrouiller un mode de
 * règlement).
 *
 * Extrait de `ViewerService` pour que le portail (viewer) et l'échéancier
 * (payments) partagent UNE SEULE implémentation : dupliquer ce contrôle
 * reviendrait à créer une seconde porte d'entrée qui pourrait diverger et
 * laisser un membre agir sur la facture d'un autre foyer.
 */
@Injectable()
export class InvoicePayerScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
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

  async buildPayerInvoiceWhereForMember(
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

  async buildPayerInvoiceWhereForContact(
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

  /**
   * Clause Prisma restreignant les factures à celles que ce visiteur peut
   * payer, ou `null` s'il n'est payeur d'aucun foyer. Un `null` doit toujours
   * être traité comme un refus — jamais comme « pas de filtre ».
   */
  async resolvePayerInvoiceWhere(args: {
    clubId: string;
    activeProfile: ViewerActiveProfile;
    viewerUserId: string;
  }): Promise<Prisma.InvoiceWhereInput | null> {
    if (args.activeProfile.memberId) {
      return this.buildPayerInvoiceWhereForMember(
        args.clubId,
        args.activeProfile.memberId,
        args.viewerUserId,
      );
    }
    if (args.activeProfile.contactId) {
      return this.buildPayerInvoiceWhereForContact(
        args.clubId,
        args.activeProfile.contactId,
        args.viewerUserId,
      );
    }
    return null;
  }
}
