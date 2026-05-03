import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ProjectLivePhase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApiService } from '../telegram/telegram-api.service';

/**
 * Cycle de vie d'une phase LIVE d'un projet.
 *
 * Transitions légales : UPCOMING → LIVE → CLOSED (irreversible).
 * Plusieurs phases par projet possibles (stage 3 jours = 3 phases).
 *
 * À l'ouverture (UPCOMING → LIVE), une notification est envoyée à chaque
 * contributeur actif du projet via Telegram (si telegramChatId renseigné)
 * + email transactionnel en best-effort (pas bloquant si échec).
 */
@Injectable()
export class ProjectLivePhaseService {
  private readonly logger = new Logger(ProjectLivePhaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramApiService,
  ) {}

  async listForProject(
    clubId: string,
    projectId: string,
  ): Promise<ProjectLivePhase[]> {
    return this.prisma.projectLivePhase.findMany({
      where: { projectId, project: { clubId } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async create(
    clubId: string,
    projectId: string,
    input: { label: string; startsAt: Date; endsAt: Date },
  ): Promise<ProjectLivePhase> {
    const project = await this.prisma.clubProject.findFirst({
      where: { id: projectId, clubId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début.',
      );
    }
    return this.prisma.projectLivePhase.create({
      data: {
        projectId,
        label: input.label.trim() || 'Phase live',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });
  }

  async update(
    clubId: string,
    phaseId: string,
    patch: {
      label?: string;
      startsAt?: Date;
      endsAt?: Date;
    },
  ): Promise<ProjectLivePhase> {
    const phase = await this.getForClub(clubId, phaseId);
    return this.prisma.projectLivePhase.update({
      where: { id: phase.id },
      data: {
        label: patch.label?.trim() ?? undefined,
        startsAt: patch.startsAt,
        endsAt: patch.endsAt,
      },
    });
  }

  async delete(clubId: string, phaseId: string): Promise<boolean> {
    const phase = await this.prisma.projectLivePhase.findFirst({
      where: { id: phaseId, project: { clubId } },
      select: { id: true },
    });
    if (!phase) return false;
    await this.prisma.projectLivePhase.delete({ where: { id: phase.id } });
    return true;
  }

  async open(clubId: string, phaseId: string): Promise<ProjectLivePhase> {
    const phase = await this.getForClub(clubId, phaseId);
    if (phase.state === 'CLOSED') {
      throw new BadRequestException(
        'Impossible d’ouvrir une phase déjà fermée.',
      );
    }
    if (phase.state === 'LIVE') return phase;
    const opened = await this.prisma.projectLivePhase.update({
      where: { id: phase.id },
      data: { state: 'LIVE', openedAt: new Date() },
    });
    // Fire-and-forget : notifs aux contributeurs. En cas d'échec mail /
    // telegram, on log mais on ne fait pas échouer la mutation — l'UI
    // aura déjà affiché la phase comme ouverte.
    void this.notifyContributorsPhaseOpened(clubId, phase.projectId, opened);
    return opened;
  }

  async close(clubId: string, phaseId: string): Promise<ProjectLivePhase> {
    const phase = await this.getForClub(clubId, phaseId);
    if (phase.state === 'CLOSED') return phase;
    return this.prisma.projectLivePhase.update({
      where: { id: phase.id },
      data: { state: 'CLOSED', closedAt: new Date() },
    });
  }

  /**
   * Phase active à un instant T pour un projet (pour rattacher un item
   * live uploadé). On prend la phase LIVE dont la fenêtre couvre maintenant,
   * ou null si aucune. Permet à l'UI contributeur d'afficher la phase
   * courante + de compter le quota sur cette phase.
   */
  async currentLivePhase(
    clubId: string,
    projectId: string,
    at: Date = new Date(),
  ): Promise<ProjectLivePhase | null> {
    return this.prisma.projectLivePhase.findFirst({
      where: {
        projectId,
        project: { clubId },
        state: 'LIVE',
        startsAt: { lte: at },
        endsAt: { gte: at },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  // ---------- Private helpers ----------

  private async getForClub(
    clubId: string,
    phaseId: string,
  ): Promise<ProjectLivePhase> {
    const phase = await this.prisma.projectLivePhase.findFirst({
      where: { id: phaseId, project: { clubId } },
    });
    if (!phase) throw new NotFoundException('Phase LIVE introuvable.');
    return phase;
  }

  private async notifyContributorsPhaseOpened(
    clubId: string,
    projectId: string,
    phase: ProjectLivePhase,
  ): Promise<void> {
    try {
      const [project, contributors] = await Promise.all([
        this.prisma.clubProject.findUnique({
          where: { id: projectId },
          select: { title: true, slug: true },
        }),
        this.prisma.projectContributor.findMany({
          where: { projectId, revokedAt: null },
          include: {
            member: {
              select: {
                firstName: true,
                email: true,
                telegramChatId: true,
              },
            },
            contact: {
              select: {
                firstName: true,
                user: { select: { email: true } },
              },
            },
          },
        }),
      ]);
      if (!project) return;
      const subject = `Live ouvert : ${project.title} — ${phase.label}`;
      const body =
        `La phase « ${phase.label} » du projet « ${project.title} » ` +
        `est ouverte. Tu peux commencer à poster tes photos/vidéos ` +
        `depuis l'espace membre. Les uploads seront modérés avant ` +
        `publication.`;

      // V1 : notification Telegram uniquement (delivery instant, gratuit,
      // Bot existant). Les notifs email nécessitent d'exposer un
      // `TransactionalMailService.sendNotification()` générique — à ajouter
      // dans une itération suivante (le subject est prêt ci-dessous).
      void subject; // suppress "unused" côté lint en attendant le plumbing mail
      await Promise.all(
        contributors.map(async (c) => {
          const telegramChatId = c.member?.telegramChatId;
          if (!telegramChatId) return;
          try {
            await this.telegram.sendMessage(telegramChatId, body);
          } catch (err) {
            this.logger.warn(
              `Telegram push failed (contributor=${c.id}) : ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }),
      );
    } catch (err) {
      this.logger.warn(
        `notifyContributorsPhaseOpened failed : ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
