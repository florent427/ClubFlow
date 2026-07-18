import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Verrou à bail pour les tâches planifiées (cf. ADR-0009).
 *
 * Garantit qu'une tâche donnée ne tourne qu'une fois à la fois, même si :
 *  - un run précédent dure plus longtemps que son intervalle de
 *    déclenchement (cas réel d'un gros run de prélèvements) ;
 *  - l'API tourne un jour en plusieurs instances (ce n'est pas le cas
 *    aujourd'hui, mais le verrou évite d'avoir à y repenser plus tard).
 *
 * Le bail expire tout seul : si le process meurt en plein run, la tâche
 * redevient exécutable au bout de `leaseMs` sans intervention.
 */
@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);
  /** Identifie le détenteur pour diagnostiquer un verrou resté bloqué. */
  private readonly owner = `${process.pid}@${hostname()}`;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exécute `fn` uniquement si le verrou est libre.
   *
   * @returns le résultat de `fn`, ou `null` si le verrou était déjà tenu
   *          (dans ce cas `fn` n'est pas appelée du tout).
   *
   * ⚠️ `leaseMs` doit être confortablement supérieur à la durée maximale
   * attendue du traitement : si le bail expire pendant l'exécution, un autre
   * exécutant pourrait démarrer en parallèle.
   */
  async withLock<T>(
    key: string,
    leaseMs: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.acquire(key, leaseMs))) {
      this.logger.log(`[lock] ${key} déjà tenu — exécution ignorée`);
      return null;
    }
    try {
      return await fn();
    } finally {
      // Libération best-effort : même si elle échoue, le bail finira par
      // expirer. On ne veut surtout pas masquer l'erreur métier de `fn`.
      await this.release(key).catch((err: unknown) => {
        this.logger.warn(
          `[lock] libération de ${key} impossible : ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * Prend le verrou si personne ne le tient (ou si le bail précédent a
   * expiré). L'opération est atomique : c'est le `updateMany` conditionnel
   * qui arbitre, pas une lecture suivie d'une écriture.
   */
  private async acquire(key: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const until = new Date(now.getTime() + leaseMs);

    const taken = await this.prisma.schedulerLock.updateMany({
      where: { key, lockedUntil: { lt: now } },
      data: { lockedUntil: until, lockedBy: this.owner },
    });
    if (taken.count === 1) return true;

    // Aucune ligne mise à jour : soit le verrou est tenu, soit il n'a jamais
    // existé. On tente la création ; une violation d'unicité signifie qu'il
    // existe et qu'il est donc tenu par quelqu'un d'autre.
    try {
      await this.prisma.schedulerLock.create({
        data: { key, lockedUntil: until, lockedBy: this.owner },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Ne libère que si l'on est toujours le détenteur légitime. */
  private async release(key: string): Promise<void> {
    await this.prisma.schedulerLock.updateMany({
      where: { key, lockedBy: this.owner },
      data: { lockedUntil: new Date(0) },
    });
  }
}
