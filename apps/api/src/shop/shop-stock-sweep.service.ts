import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import {
  SCHEDULER_LOCK_KEYS,
  SCHEDULING_TIMEZONE,
} from '../scheduling/scheduling.constants';
import {
  ShopLowStockNotifierService,
  type LowStockItem,
} from './shop-low-stock-notifier.service';

/** Compte-rendu chiffré d'un passage. */
export type ShopStockSweepReport = {
  /** Déclinaisons suivies et seuillées passées en revue. */
  examined: number;
  /** Alertes réclamées ET effectivement parties. */
  alerted: number;
  /** Marqueurs remis à zéro : le stock est repassé au-dessus du seuil. */
  rearmed: number;
  /** Alertes réclamées mais perdues faute d'envoi possible. */
  failed: number;
};

const EMPTY_REPORT: ShopStockSweepReport = {
  examined: 0,
  alerted: 0,
  rearmed: 0,
  failed: 0,
};

/** Bail large : le passage dépend d'un SMTP tiers, pas de notre seule base. */
const LEASE_MS = 10 * 60_000;

/**
 * Balayage quotidien des seuils de réapprovisionnement (ADR-0012 §7).
 *
 * POURQUOI UN CRON ET PAS LA COMMANDE
 *
 * Évaluer les seuils dans la transaction de vente rejouerait
 * `garantie-derriere-effet-de-bord` en miroir : un SMTP en panne ferait soit
 * échouer une vente parfaitement valide, soit disparaître l'alerte dans un
 * `try/catch` sans que personne ne sache qu'elle est morte. Une latence allant
 * jusqu'à 24 h ne coûte rien — on réapprovisionne en jours, pas en secondes.
 *
 * L'ANTI-SPAM EST TENU PAR LA BASE
 *
 * Le passage RÉCLAME l'alerte par un `updateMany` conditionnel sur
 * `lowStockAlertedAt: null` AVANT d'envoyer quoi que ce soit, et ne poursuit
 * que si `count === 1`. Deux passages concurrents — le cron et un rejeu
 * manuel tombant à la même seconde — ne peuvent donc pas alerter deux fois :
 * le second voit le marqueur déjà posé et sort. Un `if (déjàAlerté)` lu avant
 * l'écriture laisserait au contraire une fenêtre entre la lecture et la pose.
 *
 * MARQUAGE AVANT ENVOI, ET C'EST UN ARBITRAGE ASSUMÉ
 *
 * Si le courrier échoue après la pose du marqueur, l'alerte est perdue jusqu'à
 * la prochaine remontée de stock. C'est le bon sens de la perte : perdre une
 * alerte vaut mieux qu'en envoyer cent. L'inverse — envoyer puis marquer —
 * transformerait une panne SMTP intermittente en boucle de courriers.
 */
@Injectable()
export class ShopStockSweepService {
  private readonly logger = new Logger(ShopStockSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: ShopLowStockNotifierService,
    private readonly lock: SchedulerLockService,
  ) {}

  /**
   * 7h00, avant l'ouverture du bureau : le trésorier trouve l'alerte en
   * arrivant, et le passage ne croise ni le prélèvement de 8h00 ni les jobs
   * Stripe. Les verrous sont distincts, mais mieux vaut ne pas empiler.
   */
  @Cron('0 7 * * *', { timeZone: SCHEDULING_TIMEZONE })
  async dailySweep(): Promise<void> {
    if (process.env.SHOP_STOCK_SWEEP_DISABLED === 'true') {
      // Bruyant à dessein, et c'est toute la raison d'être de cette ligne :
      // un interrupteur d'urgence oublié ne se signale par rien d'autre. Sans
      // ce log, un balayage coupé « le temps de l'incident » laisse tous les
      // clubs sans aucune alerte de rupture, en silence, et pour aussi
      // longtemps que personne n'y repense.
      this.logger.warn(
        '[boutique] balayage des seuils DÉSACTIVÉ par SHOP_STOCK_SWEEP_DISABLED — ' +
          'aucune alerte de réapprovisionnement ne partira.',
      );
      return;
    }
    await this.lock.withLock(
      SCHEDULER_LOCK_KEYS.shopStockThresholdSweep,
      LEASE_MS,
      async () => {
        const report = await this.sweep();
        if (report.alerted > 0 || report.failed > 0 || report.rearmed > 0) {
          this.logger.log(
            `[boutique] balayage des seuils : ${JSON.stringify(report)}`,
          );
        }
      },
    );
  }

  /**
   * Rejeu manuel, sous LE MÊME verrou que le cron.
   *
   * Partager le verrou est le point : sans lui, un double-clic sur le bouton
   * de rejeu lancerait deux passages, et si tous deux réclamaient une alerte
   * on retomberait sur l'anti-spam applicatif qu'on cherche à éviter. Le
   * `updateMany` conditionnel protège déjà ; le verrou évite en amont la
   * course et les envois inutiles.
   *
   * Renvoie `null` quand le verrou est déjà tenu, et surtout PAS un rapport
   * à zéro.
   *
   * Un rapport `{ examined: 0, alerted: 0 }` est indistinguable d'un passage
   * qui n'a rien trouvé à signaler : le trésorier d'un club comptant douze
   * déclinaisons sous seuil cliquerait « rejouer » à 7 h 02, pendant que le
   * cron tient le bail, et recevrait un message vert lui disant que zéro
   * déclinaison a été examinée. Il en conclurait que son catalogue va bien.
   *
   * `null` force l'appelant à distinguer « je n'ai rien pu faire » de « je
   * n'ai rien eu à faire ».
   */
  async triggerForClub(clubId: string): Promise<ShopStockSweepReport | null> {
    return this.lock.withLock(
      SCHEDULER_LOCK_KEYS.shopStockThresholdSweep,
      LEASE_MS,
      () => this.sweep(clubId),
    );
  }

  /**
   * Le passage lui-même. `clubId` absent = tous les clubs (cron).
   */
  async sweep(clubId?: string): Promise<ShopStockSweepReport> {
    const scope = clubId ? { clubId } : {};
    const report: ShopStockSweepReport = { ...EMPTY_REPORT };

    // --- 1. Réarmement, AVANT d'alerter ---
    //
    // Filet de sécurité, et non le chemin principal : la remontée de stock
    // réarme déjà dans ShopStockService, et le changement de seuil dans
    // ShopVariantsService. Ce passage rattrape ce qui aurait échappé aux deux
    // — une variante désactivée, un suivi de stock coupé, un seuil retiré.
    // Le faire avant l'alerte permet à une variante réarmée puis toujours
    // sous un nouveau seuil d'alerter dès CE passage plutôt que le lendemain.
    const marked = await this.prisma.shopProductVariant.findMany({
      where: { ...scope, lowStockAlertedAt: { not: null } },
      select: {
        id: true,
        clubId: true,
        active: true,
        trackStock: true,
        available: true,
        reorderThreshold: true,
      },
    });
    for (const v of marked) {
      const stillLow =
        v.active &&
        v.trackStock &&
        v.reorderThreshold !== null &&
        v.available <= v.reorderThreshold;
      if (stillLow) continue;
      const cleared = await this.prisma.shopProductVariant.updateMany({
        where: { id: v.id, clubId: v.clubId, lowStockAlertedAt: { not: null } },
        data: { lowStockAlertedAt: null },
      });
      if (cleared.count === 1) report.rearmed += 1;
    }

    // --- 2. Candidats ---
    //
    // Le filtre « sous le seuil » est appliqué en mémoire : comparer deux
    // colonnes de la même ligne demanderait une référence de champ Prisma,
    // dont le comportement face aux NULL est exactement le piège que
    // l'ADR-0012 §2 ferme. Le `where` restreint déjà aux variantes suivies,
    // actives et seuillées — quelques dizaines de lignes par club.
    const candidates = await this.prisma.shopProductVariant.findMany({
      where: {
        ...scope,
        trackStock: true,
        active: true,
        reorderThreshold: { not: null },
        product: { active: true },
      },
      include: { product: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    report.examined = candidates.length;

    // --- 3. Réclamation puis envoi, groupés par club ---
    const now = new Date();
    const byClub = new Map<string, LowStockItem[]>();

    for (const v of candidates) {
      const threshold = v.reorderThreshold!;
      if (v.available > threshold) continue;

      // LA garantie anti-doublon. Même forme que le décrément de stock : le
      // prédicat EST l'arbitrage, et `count` en est le verdict. Le
      // `available: { lte: threshold }` est réévalué par PostgreSQL sur la
      // version committée, donc une vente concurrente qui aurait remonté le
      // stock entre la lecture et ici ne déclenche pas d'alerte fantôme.
      const claimed = await this.prisma.shopProductVariant.updateMany({
        where: {
          id: v.id,
          clubId: v.clubId,
          trackStock: true,
          active: true,
          lowStockAlertedAt: null,
          available: { lte: threshold },
        },
        data: { lowStockAlertedAt: now },
      });
      if (claimed.count !== 1) continue;

      const bucket = byClub.get(v.clubId) ?? [];
      bucket.push({
        productName: v.product.name,
        label: v.label,
        sku: v.sku,
        available: v.available,
        reorderThreshold: threshold,
        reorderTargetQty: v.reorderTargetQty,
      });
      byClub.set(v.clubId, bucket);
    }

    for (const [club, items] of byClub) {
      // `notifyLowStock` ne lève jamais : il journalise et renvoie false. On
      // compte donc la perte au lieu d'interrompre le balayage des autres
      // clubs — un club sans domaine d'envoi vérifié ne doit pas priver les
      // trente autres de leurs alertes.
      const sent = await this.notifier.notifyLowStock(club, items);
      if (sent) report.alerted += items.length;
      else report.failed += items.length;
    }

    return report;
  }
}
