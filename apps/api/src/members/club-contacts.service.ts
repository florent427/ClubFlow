import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberCivility, MemberStatus, Prisma } from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemberPseudoService } from '../messaging/member-pseudo.service';
import { assertMemberEmailAllowedInClub } from './member-email-family-rule';

/** Civilité par défaut à la promotion contact → membre (MVP). À corriger en annuaire si besoin. */
export const PROMOTE_CONTACT_DEFAULT_CIVILITY = MemberCivility.MR;

export type ClubContactRecord = {
  id: string;
  clubId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  linkedMemberId: string | null;
  canDeleteContact: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ClubContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly memberPseudo: MemberPseudoService,
  ) {}

  private async findLinkedMemberId(
    clubId: string,
    userId: string,
  ): Promise<string | null> {
    const m = await this.prisma.member.findFirst({
      where: { clubId, userId },
      select: { id: true },
    });
    return m?.id ?? null;
  }

  private toRecord(
    row: Prisma.ContactGetPayload<{ include: { user: true } }>,
    linkedMemberId: string | null,
  ): ClubContactRecord {
    return {
      id: row.id,
      clubId: row.clubId,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.user.email,
      emailVerified: row.user.emailVerifiedAt != null,
      linkedMemberId,
      canDeleteContact: linkedMemberId == null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listClubContacts(clubId: string): Promise<ClubContactRecord[]> {
    const rows = await this.prisma.contact.findMany({
      where: { clubId },
      include: { user: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const out: ClubContactRecord[] = [];
    for (const row of rows) {
      const linkedId = await this.findLinkedMemberId(clubId, row.userId);
      out.push(this.toRecord(row, linkedId));
    }
    return out;
  }

  async getClubContact(
    clubId: string,
    contactId: string,
  ): Promise<ClubContactRecord> {
    const row = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId },
      include: { user: true },
    });
    if (!row) {
      throw new NotFoundException('Contact introuvable.');
    }
    const linkedId = await this.findLinkedMemberId(clubId, row.userId);
    return this.toRecord(row, linkedId);
  }

  async updateClubContact(
    clubId: string,
    contactId: string,
    input: { firstName: string; lastName: string },
  ): Promise<ClubContactRecord> {
    const row = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId },
      include: { user: true },
    });
    if (!row) {
      throw new NotFoundException('Contact introuvable.');
    }
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('Prénom et nom sont obligatoires.');
    }
    const displayName = `${firstName} ${lastName}`.trim();
    await this.prisma.$transaction([
      this.prisma.contact.update({
        where: { id: contactId },
        data: { firstName, lastName },
      }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { displayName },
      }),
    ]);
    return this.getClubContact(clubId, contactId);
  }

  /** Rattache les comptes portail (e-mail vérifié) aux fiches membre payeur / seules si même e-mail. */
  async syncContactMemberLinksForClub(clubId: string): Promise<void> {
    await this.families.syncAllContactPayerMemberLinksForClub(clubId);
  }

  async deleteClubContact(clubId: string, contactId: string): Promise<void> {
    const row = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId },
    });
    if (!row) {
      throw new NotFoundException('Contact introuvable.');
    }
    const linkedId = await this.findLinkedMemberId(clubId, row.userId);
    if (linkedId != null) {
      throw new BadRequestException(
        'Impossible de supprimer ce contact tant qu’une fiche membre existe pour ce compte. Retirez d’abord le membre depuis l’annuaire si nécessaire.',
      );
    }
    await this.prisma.contact.delete({
      where: { id: contactId },
    });
    await this.cleanupOrphanUser(row.userId);
  }

  /**
   * Supprime le User et ses artefacts d’authentification lorsqu’aucune fiche
   * Contact / Member / ClubMembership ne le référence plus (tous clubs confondus).
   *
   * Sans ce nettoyage, un User orphelin bloquerait toute future inscription
   * portail avec la même adresse e-mail (erreur USER_ALREADY_EXISTS côté
   * AuthService), alors même qu’aucun profil métier n’existe plus.
   */
  private async cleanupOrphanUser(userId: string): Promise<void> {
    const [remainingContact, remainingMember, remainingMembership] =
      await Promise.all([
        this.prisma.contact.count({ where: { userId } }),
        this.prisma.member.count({ where: { userId } }),
        this.prisma.clubMembership.count({ where: { userId } }),
      ]);
    if (
      remainingContact > 0 ||
      remainingMember > 0 ||
      remainingMembership > 0
    ) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.userIdentity.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }

  async promoteContactToMember(
    clubId: string,
    contactId: string,
    overrides?: {
      civility?: MemberCivility;
      birthDate?: Date | null;
    },
  ): Promise<{ memberId: string }> {
    const row = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId },
      include: { user: true },
    });
    if (!row) {
      throw new NotFoundException('Contact introuvable.');
    }
    const user = row.user;
    if (!user.emailVerifiedAt) {
      throw new BadRequestException(
        'L’adresse e-mail du compte doit être vérifiée avant la promotion en membre.',
      );
    }
    const existingMemberId = await this.findLinkedMemberId(clubId, user.id);
    if (existingMemberId != null) {
      throw new BadRequestException(
        'Ce contact est déjà associé à une fiche membre pour ce club.',
      );
    }
    await assertMemberEmailAllowedInClub(this.prisma, clubId, user.email, {
      memberId: null,
    });
    const pseudo = await this.memberPseudo.pickAvailablePseudo(
      this.prisma,
      clubId,
      row.firstName,
      row.lastName,
      null,
    );
    const member = await this.prisma.member.create({
      data: {
        clubId,
        userId: user.id,
        firstName: row.firstName,
        lastName: row.lastName,
        pseudo,
        civility: overrides?.civility ?? PROMOTE_CONTACT_DEFAULT_CIVILITY,
        email: user.email,
        birthDate: overrides?.birthDate ?? null,
        status: MemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    await this.families.migrateContactPayerLinksToMember(
      clubId,
      user.id,
      member.id,
    );
    return { memberId: member.id };
  }
}
