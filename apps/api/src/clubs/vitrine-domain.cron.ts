import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { VitrineDomainStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubsService } from './clubs.service';

/**
 * Job en arrière-plan : re-vérifie périodiquement les domaines custom
 * en PENDING_DNS pour basculer auto en ACTIVE dès que la propa DNS a eu lieu.
 *
 * - Au boot : 1× tour de check (tous les PENDING_DNS)
 * - Toutes les VITRINE_DOMAIN_CHECK_INTERVAL_MS (default 10 min) : re-check
 *
 * Pas de dépendance @nestjs/schedule pour rester léger — setInterval natif suffit.
 */
@Injectable()
export class VitrineDomainCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VitrineDomainCron.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('NODE_ENV=test → cron désactivé');
      return;
    }
    if (process.env.VITRINE_DOMAIN_CRON_DISABLED === 'true') {
      this.logger.log('VITRINE_DOMAIN_CRON_DISABLED=true → cron désactivé');
      return;
    }

    const intervalMs = Number(
      process.env.VITRINE_DOMAIN_CHECK_INTERVAL_MS ?? 600_000,
    );
    this.logger.log(
      `Démarrage cron vitrine domain : interval=${intervalMs}ms`,
    );

    // Run au boot (asynchrone, on n'attend pas)
    void this.runOnce().catch((err) =>
      this.logger.error(`runOnce boot a échoué : ${(err as Error).message}`),
    );

    // Puis périodique
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) =>
        this.logger.error(`runOnce a échoué : ${(err as Error).message}`),
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
   * Une itération : trouve tous les clubs PENDING_DNS et tente la vérif.
   * Si verify passe → ACTIVE. Sinon reste PENDING_DNS ou bascule ERROR.
   */
  async runOnce(): Promise<{ checked: number; activated: number }> {
    const candidates = await this.prisma.club.findMany({
      where: {
        customDomain: { not: null },
        customDomainStatus: VitrineDomainStatus.PENDING_DNS,
      },
      select: { id: true, customDomain: true },
    });

    let activated = 0;
    for (const c of candidates) {
      try {
        const state = await this.clubs.verifyVitrineDomain(c.id);
        if (state.status === VitrineDomainStatus.ACTIVE) {
          activated++;
          this.logger.log(`✅ ${c.customDomain} → ACTIVE`);
        }
      } catch (err) {
        this.logger.warn(
          `verify ${c.customDomain} a échoué : ${(err as Error).message}`,
        );
      }
    }
    if (candidates.length > 0) {
      this.logger.log(
        `Cron tour : ${activated}/${candidates.length} clubs activés`,
      );
    }
    return { checked: candidates.length, activated };
  }
}
