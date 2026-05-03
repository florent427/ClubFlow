import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Construit un addendum de system prompt injecté dans une conversation
 * `AgentConversation` lorsqu'elle est scopée sur un projet
 * (`AgentConversation.projectId` non-null).
 *
 * **v1 (contexte minimal)** : le bloc contient le titre, le pitch, les
 * dates, les sections actuelles et une synthèse des items live validés.
 * L'objectif est que l'agent ait assez de contexte pour répondre à
 * « résume ce projet », « qui sont les contributeurs », « combien de
 * photos validées », sans avoir besoin de faire lui-même des queries
 * à chaque tour.
 *
 * Le filtrage des outils par `scope === 'PROJECT'` est volontairement
 * reporté en v1.1 : les outils existants sont déjà gatés par rôle, et
 * l'ajout d'une dimension de scope demande de toucher toutes les
 * classifications — risque jugé excessif pour le périmètre actuel.
 */
@Injectable()
export class ProjectAgentContextService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSystemPromptAddendum(projectId: string): Promise<string | null> {
    const project = await this.prisma.clubProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        summary: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        showContributorCredits: true,
        sections: {
          select: { kind: true, label: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        livePhases: {
          select: {
            id: true,
            label: true,
            state: true,
            startsAt: true,
            endsAt: true,
          },
          orderBy: { startsAt: 'asc' },
        },
      },
    });
    if (!project) return null;

    const [contributorsCount, approvedItemsCount, pendingItemsCount] =
      await Promise.all([
        this.prisma.projectContributor.count({
          where: { projectId, revokedAt: null },
        }),
        this.prisma.projectLiveItem.count({
          where: { projectId, humanDecision: 'APPROVED' },
        }),
        this.prisma.projectLiveItem.count({
          where: { projectId, humanDecision: 'PENDING' },
        }),
      ]);

    const lines: string[] = [
      '',
      '────────────────────────────────────────',
      '📁 CONTEXTE PROJET ACTIF',
      '────────────────────────────────────────',
      `Titre : ${project.title}`,
      `Statut : ${project.status}`,
    ];
    if (project.summary) lines.push(`Pitch : ${project.summary}`);
    if (project.description) {
      lines.push(`Description : ${project.description.slice(0, 500)}`);
    }
    if (project.startsAt) {
      const end = project.endsAt
        ? ` → ${project.endsAt.toISOString().slice(0, 10)}`
        : '';
      lines.push(
        `Période : ${project.startsAt.toISOString().slice(0, 10)}${end}`,
      );
    }
    if (project.sections.length > 0) {
      lines.push(
        `Sections : ${project.sections.map((s) => s.label).join(', ')}`,
      );
    }
    if (project.livePhases.length > 0) {
      lines.push(
        `Phases LIVE : ${project.livePhases.map((p) => `« ${p.label} » (${p.state})`).join(', ')}`,
      );
    }
    lines.push(
      `Contributeurs actifs : ${contributorsCount}`,
      `Items live : ${approvedItemsCount} validés, ${pendingItemsCount} en attente`,
    );
    lines.push('');
    lines.push(
      'Reste **strictement dans le périmètre de ce projet**. Si l’utilisateur demande une action hors projet (ex. envoyer un mail à tout le club, modifier un autre projet), indique que tu es scopée sur ce projet uniquement et redirige-le vers la vue club générale.',
    );
    lines.push('────────────────────────────────────────');
    return lines.join('\n');
  }
}
