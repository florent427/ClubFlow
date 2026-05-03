import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProjectContributor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gestion des contributeurs d'un projet — polymorphe Member OU Contact.
 *
 * Un contributeur :
 *   - est scopé au projet (pas global club)
 *   - a un rôle unique `CONTRIBUTOR` en v1
 *   - peut être révoqué manuellement (`revokedAt` + raison)
 *   - est désactivé automatiquement quand son `Member.status` passe à
 *     INACTIVE (via le hook `autoRevokeForInactiveMember`, appelé par les
 *     services membres quand ils passent un membre en inactif).
 *
 * L'appartenance polymorphe est validée côté service : exactement un des
 * deux (memberId, contactId) doit être renseigné.
 */
@Injectable()
export class ProjectContributorService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(
    clubId: string,
    projectId: string,
    { includeRevoked = false } = {},
  ): Promise<ProjectContributor[]> {
    return this.prisma.projectContributor.findMany({
      where: {
        projectId,
        project: { clubId },
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            telegramChatId: true,
            email: true,
            userId: true,
            status: true,
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            userId: true,
          },
        },
      },
      orderBy: { addedAt: 'asc' },
    });
  }

  /**
   * Ajoute un contributeur. Rejette si un Member actif OU un Contact du
   * club est déjà contributeur actif du projet (pas de doublon).
   */
  async invite(
    clubId: string,
    projectId: string,
    addedByUserId: string,
    target: { memberId?: string | null; contactId?: string | null },
  ): Promise<ProjectContributor> {
    const memberId = target.memberId ?? null;
    const contactId = target.contactId ?? null;
    if ((memberId && contactId) || (!memberId && !contactId)) {
      throw new BadRequestException(
        'Fournir exactement un des deux : memberId ou contactId.',
      );
    }
    const project = await this.prisma.clubProject.findFirst({
      where: { id: projectId, clubId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    if (memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: memberId, clubId },
        select: { id: true, status: true },
      });
      if (!member) {
        throw new NotFoundException(
          'Membre introuvable ou rattaché à un autre club.',
        );
      }
      if (member.status !== 'ACTIVE') {
        throw new BadRequestException(
          "Impossible d'ajouter un membre inactif comme contributeur.",
        );
      }
      const existingActive = await this.prisma.projectContributor.findFirst({
        where: { projectId, memberId, revokedAt: null },
        select: { id: true },
      });
      if (existingActive) {
        throw new BadRequestException(
          'Ce membre est déjà contributeur actif sur ce projet.',
        );
      }
    } else if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, clubId },
        select: { id: true },
      });
      if (!contact) {
        throw new NotFoundException(
          'Contact introuvable ou rattaché à un autre club.',
        );
      }
      const existingActive = await this.prisma.projectContributor.findFirst({
        where: { projectId, contactId, revokedAt: null },
        select: { id: true },
      });
      if (existingActive) {
        throw new BadRequestException(
          'Ce contact est déjà contributeur actif sur ce projet.',
        );
      }
    }

    return this.prisma.projectContributor.create({
      data: {
        projectId,
        memberId,
        contactId,
        addedByUserId,
      },
    });
  }

  async revoke(
    clubId: string,
    contributorId: string,
    reason?: string | null,
  ): Promise<ProjectContributor> {
    const contributor = await this.prisma.projectContributor.findFirst({
      where: { id: contributorId, project: { clubId } },
    });
    if (!contributor) {
      throw new NotFoundException('Contributeur introuvable.');
    }
    if (contributor.revokedAt) return contributor;
    return this.prisma.projectContributor.update({
      where: { id: contributor.id },
      data: {
        revokedAt: new Date(),
        revokedReason: reason?.trim() || null,
      },
    });
  }

  /**
   * Hook appelé depuis le service membres quand un `Member.status` passe
   * à INACTIVE / SUSPENDED. Désactive automatiquement tous ses liens
   * contributeurs actifs pour éviter qu'il puisse continuer à uploader.
   */
  async autoRevokeForInactiveMember(memberId: string): Promise<number> {
    const result = await this.prisma.projectContributor.updateMany({
      where: { memberId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: 'Auto : membre passé en statut inactif',
      },
    });
    return result.count;
  }

  /**
   * Vérifie si un utilisateur est contributeur actif d'un projet.
   *
   * Trois chemins acceptés :
   *   1. via `Member.userId` (cas nominal)
   *   2. via `Contact.userId`
   *   3. fallback par email : si le Member a été créé sans lien `userId`
   *      mais que son `email` correspond à celui du user connecté, on
   *      l'accepte. Cela évite de bloquer les contributeurs alors que
   *      le lien Member↔User n'a pas été synchronisé (typique : Member
   *      importé en annuaire avant que l'utilisateur ne crée son compte).
   *
   * @param userEmail optionnel — requis pour activer le fallback email.
   */
  async isActiveContributor(
    userId: string,
    projectId: string,
    userEmail?: string | null,
  ): Promise<ProjectContributor | null> {
    const queries: Array<Promise<ProjectContributor | null>> = [
      this.prisma.projectContributor.findFirst({
        where: {
          projectId,
          revokedAt: null,
          member: { userId },
        },
      }),
      this.prisma.projectContributor.findFirst({
        where: {
          projectId,
          revokedAt: null,
          contact: { userId },
        },
      }),
    ];
    const normalizedEmail = userEmail?.trim().toLowerCase();
    if (normalizedEmail) {
      queries.push(
        this.prisma.projectContributor.findFirst({
          where: {
            projectId,
            revokedAt: null,
            member: {
              userId: null,
              email: { equals: normalizedEmail, mode: 'insensitive' },
            },
          },
        }),
      );
    }
    const results = await Promise.all(queries);
    for (const r of results) {
      if (r) return r;
    }
    return null;
  }
}
