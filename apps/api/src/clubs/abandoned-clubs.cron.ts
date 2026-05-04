import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Job d'hygiène : détecte les clubs créés via signup mais jamais utilisés
 * (0 membre + aucune activité depuis 90j) et :
 *  1. Log un warning structuré
 *  2. (Optionnel) envoie un mail de courtoisie à l'admin du club
 *
 * Pour MVP, on **ne supprime rien automatiquement** — la détection seule
 * suffit à alerter Florent (SUPER_ADMIN). La suppression effective est
 * une action manuelle (sensible : risque de perte de données).
 *
 * Critères "abandonné" :
 *  - Club.createdAt > ABANDON_GRACE_DAYS jours (default 14j de grâce)
 *  - 0 Member dans le club
 *  - Club.updatedAt < ABANDON_INACTIVITY_DAYS jours (default 90j)
 *  - customDomain == null (les clubs avec domaine custom = engagement)
 *
 * Désactivable via env `ABANDONED_CLUBS_CRON_DISABLED=true`.
 * Tour : 1×/jour à minuit local serveur (interval 24h).
 */
@Injectable()
export class AbandonedClubsCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AbandonedClubsCron.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get graceDays(): number {
    return Number(process.env.ABANDON_GRACE_DAYS ?? 14);
  }

  private get inactivityDays(): number {
    return Number(process.env.ABANDON_INACTIVITY_DAYS ?? 90);
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.ABANDONED_CLUBS_CRON_DISABLED === 'true') {
      this.logger.log('ABANDONED_CLUBS_CRON_DISABLED=true → cron désactivé');
      return;
    }

    const intervalMs = Number(
      process.env.ABANDONED_CLUBS_CHECK_INTERVAL_MS ?? 86_400_000,
    ); // 24h
    this.logger.log(
      `Démarrage cron clubs abandonnés : interval=${intervalMs}ms, grace=${this.graceDays}j, inactivity=${this.inactivityDays}j`,
    );

    // Run au boot après 5 min (laisse l'API se stabiliser, autres crons d'abord)
    setTimeout(() => {
      void this.runOnce().catch((err) =>
        this.logger.error(`runOnce boot échoué : ${(err as Error).message}`),
      );
    }, 300_000);

    // Puis périodique
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) =>
        this.logger.error(`runOnce échoué : ${(err as Error).message}`),
      );
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Une itération : trouve tous les clubs abandonnés et les log.
   *
   * @returns liste des club IDs détectés (pour test).
   */
  async runOnce(): Promise<string[]> {
    const now = Date.now();
    const graceMs = this.graceDays * 86_400_000;
    const inactivityMs = this.inactivityDays * 86_400_000;
    const createdBefore = new Date(now - graceMs);
    const updatedBefore = new Date(now - inactivityMs);

    // Clubs qui matchent les critères d'abandon (count == 0 sur members)
    const candidates = await this.prisma.club.findMany({
      where: {
        createdAt: { lt: createdBefore },
        updatedAt: { lt: updatedBefore },
        customDomain: null,
        members: { none: {} },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { role: 'CLUB_ADMIN' },
          select: { user: { select: { email: true } } },
          take: 1,
        },
      },
    });

    if (candidates.length === 0) {
      this.logger.log('Cron clubs abandonnés : 0 candidat');
      return [];
    }

    const ids: string[] = [];
    for (const c of candidates) {
      const adminEmail = c.memberships[0]?.user?.email ?? '<aucun admin>';
      const ageDays = Math.floor((now - c.createdAt.getTime()) / 86_400_000);
      const inactiveDays = Math.floor(
        (now - c.updatedAt.getTime()) / 86_400_000,
      );
      this.logger.warn(
        `🪦 Club abandonné détecté — id=${c.id} slug="${c.slug}" name="${c.name}" admin=${adminEmail} ageDays=${ageDays} inactiveDays=${inactiveDays}`,
      );
      ids.push(c.id);
    }

    this.logger.log(
      `Cron clubs abandonnés : ${candidates.length} club(s) détecté(s). Pas de suppression auto — action manuelle requise.`,
    );

    return ids;
  }
}
