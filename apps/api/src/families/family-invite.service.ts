import { createHmac, randomBytes } from 'crypto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyInviteRole,
  FamilyMemberLinkRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FamiliesService } from './families.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';

const INVITE_TTL_DAYS = 14;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export type ActiveProfileRef = {
  memberId: string | null;
  contactId: string | null;
};

export type FamilyInvitePreview = {
  role: FamilyInviteRole;
  familyLabel: string | null;
  inviterFirstName: string | null;
  inviterLastName: string | null;
  clubName: string | null;
  expiresAt: Date;
};

export type FamilyInviteAcceptResult = {
  success: boolean;
  message: string;
  familyId: string;
  familyLabel: string | null;
};

export type FamilyInviteCreateResult = {
  code: string;
  rawToken: string;
  expiresAt: Date;
  familyId: string;
};

@Injectable()
export class FamilyInviteService {
  private readonly logger = new Logger(FamilyInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    @Inject(forwardRef(() => TransactionalMailService))
    private readonly mail: TransactionalMailService,
  ) {}

  private getPepper(): string {
    return (
      process.env.EMAIL_VERIFICATION_SECRET ??
      process.env.JWT_SECRET ??
      'change-me-in-development'
    );
  }

  private hashRawToken(raw: string): string {
    return createHmac('sha256', this.getPepper()).update(raw).digest('hex');
  }

  private generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH * 2);
    let s = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return s;
  }

  /** Retourne l’id du foyer où le profil actif est PAYER (ou seul membre d’un foyer). */
  private async findPayerFamilyForActiveProfile(
    clubId: string,
    profile: ActiveProfileRef,
  ): Promise<string | null> {
    if (profile.memberId) {
      const fm = await this.prisma.familyMember.findFirst({
        where: {
          memberId: profile.memberId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      if (fm) return fm.familyId;
      const anyLink = await this.prisma.familyMember.findFirst({
        where: { memberId: profile.memberId, family: { clubId } },
        select: { familyId: true },
      });
      if (anyLink) {
        const count = await this.prisma.familyMember.count({
          where: { familyId: anyLink.familyId },
        });
        if (count === 1) return anyLink.familyId;
      }
      return null;
    }
    if (profile.contactId) {
      const fm = await this.prisma.familyMember.findFirst({
        where: {
          contactId: profile.contactId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      return fm?.familyId ?? null;
    }
    return null;
  }

  async createInvite(
    clubId: string,
    createdByUserId: string,
    activeProfile: ActiveProfileRef,
    role: FamilyInviteRole,
  ): Promise<FamilyInviteCreateResult> {
    const familyId = await this.findPayerFamilyForActiveProfile(
      clubId,
      activeProfile,
    );
    if (!familyId) {
      throw new BadRequestException(
        'Vous devez être payeur d’un foyer pour inviter un proche. Contactez le club si nécessaire.',
      );
    }
    let code = '';
    for (let i = 0; i < 10; i++) {
      const candidate = this.generateCode();
      const clash = await this.prisma.familyInvite.findUnique({
        where: { code: candidate },
      });
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new BadRequestException(
        'Impossible de générer un code unique, réessayez.',
      );
    }
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashRawToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.familyInvite.create({
      data: {
        clubId,
        familyId,
        createdByUserId,
        role,
        code,
        tokenHash,
        expiresAt,
      },
    });
    return { code, rawToken, expiresAt, familyId };
  }

  /**
   * Envoie par email une invitation déjà créée (par son code). Le
   * destinataire reçoit un mail avec le bouton d'acceptation + le code
   * de secours. L'invitation elle-même n'est pas modifiée, juste notifiée.
   *
   * @param inviteUrl URL absolue du portail membre (ex. https://membres.clubflow.fr/rejoindre?token=XXX)
   *                   — construite côté resolver à partir de headers / env.
   */
  async sendExistingInviteByEmail(
    clubId: string,
    createdByUserId: string,
    code: string,
    recipientEmail: string,
    inviteUrl: string,
  ): Promise<{ success: boolean; message: string }> {
    const trimmedEmail = recipientEmail.trim();
    if (!trimmedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      throw new BadRequestException('Adresse e-mail invalide.');
    }
    const invite = await this.prisma.familyInvite.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        family: { select: { label: true } },
      },
    });
    if (!invite || invite.clubId !== clubId) {
      throw new NotFoundException('Invitation introuvable.');
    }
    if (invite.createdByUserId !== createdByUserId) {
      throw new BadRequestException(
        "Cette invitation n'a pas été créée par vous.",
      );
    }
    if (invite.consumedAt) {
      throw new BadRequestException(
        'Cette invitation a déjà été acceptée.',
      );
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException(
        'Cette invitation a expiré. Générez-en une nouvelle.',
      );
    }

    // Récupère le nom du club + nom de l'inviteur pour personnaliser l'email
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    });
    const inviterUser = await this.prisma.user.findUnique({
      where: { id: createdByUserId },
      select: { displayName: true, email: true },
    });
    const inviterName =
      inviterUser?.displayName?.trim() ||
      inviterUser?.email ||
      'Un membre du club';

    try {
      await this.mail.sendFamilyInviteEmail(clubId, trimmedEmail, {
        clubName: club?.name ?? 'Votre club',
        inviterName,
        role: invite.role === 'COPAYER' ? 'COPAYER' : 'VIEWER',
        inviteUrl,
        code: invite.code,
        expiresAt: invite.expiresAt,
      });
      // Enregistre l'email destinataire sur l'invite : le destinataire
      // verra l'invitation dès qu'il se connectera (notification in-app),
      // sans avoir à cliquer sur le lien du mail.
      const normalizedEmail = trimmedEmail.toLowerCase();
      await this.prisma.familyInvite.update({
        where: { id: invite.id },
        data: { recipientEmail: normalizedEmail },
      });
      this.logger.log(
        `Invite ${invite.code} envoyée par email à ${trimmedEmail} par user ${createdByUserId}.`,
      );
      return {
        success: true,
        message: `Invitation envoyée à ${trimmedEmail}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Échec envoi email invite ${invite.code} à ${trimmedEmail} : ${msg}`,
      );
      throw new BadRequestException(
        `Échec de l'envoi : ${msg}. Vérifiez que le domaine d'envoi est configuré (Paramètres → Emails).`,
      );
    }
  }

  private async findActiveInvite(codeOrToken: string) {
    const trimmed = codeOrToken.trim();
    if (!trimmed) return null;
    const now = new Date();
    const byCode = await this.prisma.familyInvite.findFirst({
      where: {
        code: trimmed.toUpperCase(),
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (byCode) return byCode;
    const tokenHash = this.hashRawToken(trimmed);
    return this.prisma.familyInvite.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
  }

  async previewInvite(codeOrToken: string): Promise<FamilyInvitePreview> {
    const invite = await this.findActiveInvite(codeOrToken);
    if (!invite) {
      throw new NotFoundException('Invitation introuvable ou expirée.');
    }
    const [family, club, inviter] = await Promise.all([
      this.prisma.family.findUnique({
        where: { id: invite.familyId },
        select: { label: true },
      }),
      this.prisma.club.findUnique({
        where: { id: invite.clubId },
        select: { name: true },
      }),
      this.prisma.familyMember.findFirst({
        where: {
          familyId: invite.familyId,
          OR: [
            { member: { userId: invite.createdByUserId } },
            { contact: { userId: invite.createdByUserId } },
          ],
        },
        include: {
          member: { select: { firstName: true, lastName: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    return {
      role: invite.role,
      familyLabel: family?.label ?? null,
      clubName: club?.name ?? null,
      inviterFirstName:
        inviter?.member?.firstName ?? inviter?.contact?.firstName ?? null,
      inviterLastName:
        inviter?.member?.lastName ?? inviter?.contact?.lastName ?? null,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(
    codeOrToken: string,
    clubId: string,
    userId: string,
    activeProfile: ActiveProfileRef,
  ): Promise<FamilyInviteAcceptResult> {
    const invite = await this.findActiveInvite(codeOrToken);
    if (!invite) {
      throw new NotFoundException('Invitation introuvable ou expirée.');
    }
    if (invite.clubId !== clubId) {
      throw new BadRequestException('Invitation émise pour un autre club.');
    }

    const payerFamilyId = invite.familyId;
    let resolvedFamilyId: string;
    let message: string;

    if (invite.role === FamilyInviteRole.COPAYER) {
      if (activeProfile.memberId) {
        const { newFamilyId } =
          await this.families.linkMemberAsCoParentResidenceFromPayerFamily(
            clubId,
            activeProfile.memberId,
            payerFamilyId,
          );
        resolvedFamilyId = newFamilyId;
        message =
          'Invitation acceptée en co-payeur. Un nouveau foyer « résidence » a été créé dans l’espace partagé.';
      } else if (activeProfile.contactId) {
        const { newFamilyId } =
          await this.families.linkContactAsCoParentResidenceFromPayerFamily(
            clubId,
            activeProfile.contactId,
            payerFamilyId,
          );
        resolvedFamilyId = newFamilyId;
        message =
          'Invitation acceptée en co-payeur. Votre espace contact est lié à l’espace familial partagé.';
      } else {
        throw new BadRequestException('Sélection de profil requise');
      }
    } else {
      if (activeProfile.memberId) {
        // VIEWER = observateur en lecture : on autorise plusieurs familles
        // par membre (ex. un assistant coach qui voit plusieurs foyers, un
        // grand-parent rattaché à deux foyers de petits-enfants).
        // On vérifie juste l'idempotency (pas déjà lié à CETTE famille).
        const alreadyInThisFamily =
          await this.prisma.familyMember.findFirst({
            where: {
              memberId: activeProfile.memberId,
              familyId: payerFamilyId,
            },
          });
        if (alreadyInThisFamily) {
          resolvedFamilyId = payerFamilyId;
          message =
            'Vous êtes déjà rattaché à ce foyer — invitation marquée comme acceptée.';
        } else {
          await this.prisma.familyMember.create({
            data: {
              familyId: payerFamilyId,
              memberId: activeProfile.memberId,
              linkRole: FamilyMemberLinkRole.MEMBER,
            },
          });
          resolvedFamilyId = payerFamilyId;
          message =
            'Invitation acceptée en observateur : vous rejoignez ce foyer.';
        }
      } else if (activeProfile.contactId) {
        const existing = await this.prisma.familyMember.findFirst({
          where: {
            contactId: activeProfile.contactId,
            familyId: payerFamilyId,
          },
        });
        if (!existing) {
          await this.prisma.familyMember.create({
            data: {
              familyId: payerFamilyId,
              contactId: activeProfile.contactId,
              linkRole: FamilyMemberLinkRole.MEMBER,
            },
          });
        }
        resolvedFamilyId = payerFamilyId;
        message =
          'Invitation acceptée en observateur : votre compte contact a accès à ce foyer.';
      } else {
        throw new BadRequestException('Sélection de profil requise');
      }
    }

    await this.prisma.familyInvite.update({
      where: { id: invite.id },
      data: { consumedAt: new Date(), consumedByUserId: userId },
    });

    const fam = await this.prisma.family.findUnique({
      where: { id: resolvedFamilyId },
      select: { label: true },
    });
    return {
      success: true,
      message,
      familyId: resolvedFamilyId,
      familyLabel: fam?.label ?? null,
    };
  }

  /**
   * Liste les invitations encore valides (non consommées, non expirées)
   * adressées à un email donné dans un club donné. Utilisé par le portail
   * membre pour afficher une notification in-app après connexion — pas
   * besoin pour le destinataire de passer par le mail.
   */
  async listPendingForEmail(
    clubId: string,
    email: string,
  ): Promise<
    Array<{
      id: string;
      code: string;
      role: FamilyInviteRole;
      familyLabel: string | null;
      inviterName: string;
      expiresAt: Date;
    }>
  > {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return [];
    const rows = await this.prisma.familyInvite.findMany({
      where: {
        clubId,
        recipientEmail: normalized,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        family: { select: { label: true } },
      },
    });
    if (rows.length === 0) return [];
    // Récupère les inviteurs en batch
    const inviterIds = [...new Set(rows.map((r) => r.createdByUserId))];
    const inviters = await this.prisma.user.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, displayName: true, email: true },
    });
    const inviterMap = new Map(
      inviters.map((u) => [
        u.id,
        u.displayName?.trim() || u.email || 'Un membre du club',
      ]),
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      role: r.role,
      familyLabel: r.family.label ?? null,
      inviterName: inviterMap.get(r.createdByUserId) ?? 'Un membre du club',
      expiresAt: r.expiresAt,
    }));
  }
}
