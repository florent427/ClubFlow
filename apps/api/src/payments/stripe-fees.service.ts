import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SCHEDULER_LOCK_KEYS,
  SCHEDULING_TIMEZONE,
} from '../scheduling/scheduling.constants';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';

/**
 * Au-delà de ce délai, un encaissement dont les frais restent inconnus n'est
 * plus repris : l'échec n'est plus une question de latence bancaire.
 */
const FEES_SWEEP_GIVE_UP_DAYS = 30;

/**
 * Récupération et comptabilisation des frais Stripe (Phase 2).
 *
 * Stripe verse au club le NET : le brut encaissé moins sa commission. Sans
 * cette charge, le résultat affiché à chaque club est surévalué du total exact
 * de ses frais, et le solde bancaire dérive sans que rien ne le signale.
 *
 * Deux principes gouvernent ce service.
 *
 * 1. TOUT EST « BEST EFFORT ». Un encaissement acquis ne doit JAMAIS être
 *    remis en cause parce que Stripe est lent ou indisponible. Aucune méthode
 *    ne relance d'exception vers son appelant.
 *
 * 2. LES FRAIS ARRIVENT APRÈS. En carte ils sont connus presque tout de suite,
 *    mais en SEPA la balance transaction n'existe qu'au dénouement, plusieurs
 *    jours plus tard. L'absence de frais au moment de l'encaissement est donc
 *    le cas NOMINAL, pas une erreur : le balayage quotidien repasse derrière.
 */
@Injectable()
export class StripeFeesService {
  private readonly logger = new Logger(StripeFeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly lock: SchedulerLockService,
  ) {}

  /**
   * Renvoie `null` plutôt que de lever si la clé manque : l'absence de
   * configuration Stripe ne doit pas faire échouer un encaissement déjà
   * enregistré. Même choix que le moteur de prélèvement.
   */
  private getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn(
        '[frais] STRIPE_SECRET_KEY absente — frais non récupérables.',
      );
      return null;
    }
    return new Stripe(key);
  }

  /**
   * Récupère et enregistre les frais d'un encaissement. Ne lève jamais.
   *
   * Renvoie `true` si les frais sont désormais connus, `false` s'il faudra
   * repasser plus tard (charge non dénouée, Stripe indisponible, clé absente).
   */
  async syncFeesForPayment(paymentId: string): Promise<boolean> {
    try {
      return await this.syncFeesForPaymentOrThrow(paymentId);
    } catch (err) {
      // Volontairement avalé : voir le principe 1 en tête de classe.
      this.logger.warn(
        `[frais] récupération impossible pour le paiement ${paymentId} — ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async syncFeesForPaymentOrThrow(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        clubId: true,
        externalRef: true,
        stripeAccountId: true,
        stripeFeesSyncedAt: true,
      },
    });
    if (!payment) return false;

    // Déjà connus : ne pas redemander à Stripe ni redoubler l'écriture.
    if (payment.stripeFeesSyncedAt) return true;

    // Un encaissement manuel (espèces, chèque) n'a ni compte connecté ni
    // PaymentIntent : il n'y a tout simplement pas de frais à chercher.
    if (!payment.stripeAccountId || !payment.externalRef?.startsWith('pi_')) {
      return false;
    }

    const stripe = this.getStripe();
    if (!stripe) return false;

    const pi = await stripe.paymentIntents.retrieve(
      payment.externalRef,
      { expand: ['latest_charge.balance_transaction'] },
      { stripeAccount: payment.stripeAccountId },
    );

    const fee = extractStripeFee(pi);
    if (!fee) {
      // Cas nominal en SEPA : la charge n'est pas encore dénouée.
      return false;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeFeeCents: fee.feeCents,
        stripeFeeCurrency: fee.currency,
        stripeBalanceTransactionId: fee.balanceTransactionId,
        stripeFeesSyncedAt: new Date(),
      },
    });

    // La charge comptable vient APRÈS la persistance : si l'écriture échoue
    // (plan comptable incomplet), la donnée reste acquise sur le Payment et
    // le club la retrouvera en activant sa comptabilité.
    await this.accounting
      .recordStripeFeesFromPayment(payment.clubId, payment.id, fee.feeCents)
      .catch((err: Error) => {
        this.logger.warn(
          `[frais] écriture comptable impossible pour ${payment.id} — ${err.message}`,
        );
      });

    this.logger.log(
      `[frais] paiement ${payment.id} — ${fee.feeCents} cts (${fee.balanceTransactionId})`,
    );
    return true;
  }

  /**
   * Repasse sur les encaissements Stripe dont les frais restent inconnus.
   *
   * Nécessaire parce qu'un prélèvement SEPA se dénoue en plusieurs jours :
   * au moment du webhook de succès, la balance transaction n'existe pas encore.
   * Sans ce balayage, ces frais ne seraient JAMAIS comptabilisés.
   */
  async sweepPendingFees(opts?: {
    now?: Date;
    limit?: number;
  }): Promise<{ examined: number; resolved: number; abandoned: number }> {
    const now = opts?.now ?? new Date();
    // On laisse passer quelques minutes : inutile de réinterroger Stripe pour
    // un encaissement dont le webhook vient à peine d'échouer à lire les frais.
    const notBefore = new Date(now.getTime() - 10 * 60_000);
    // Au-delà, on cesse de réessayer. Un prélèvement SEPA se dénoue en
    // quelques jours ; passé ce délai, l'échec est structurel (PaymentIntent
    // supprimé, compte connecté déconnecté) et réinterroger Stripe chaque jour
    // pour l'éternité ne ferait qu'accumuler du bruit et des appels inutiles.
    const giveUpBefore = new Date(
      now.getTime() - FEES_SWEEP_GIVE_UP_DAYS * 86_400_000,
    );

    const pending = await this.prisma.payment.findMany({
      where: {
        stripeFeesSyncedAt: null,
        stripeAccountId: { not: null },
        // Un remboursement (montant négatif) n'a pas de frais propres :
        // l'inclure le ferait reprendre chaque jour en pure perte, puis
        // grossir le compteur d'abandons et déclencher une alerte perpétuelle.
        amountCents: { gt: 0 },
        createdAt: { lt: notBefore, gte: giveUpBefore },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: opts?.limit ?? 200,
    });

    let resolved = 0;
    for (const p of pending) {
      if (await this.syncFeesForPayment(p.id)) resolved += 1;
    }

    // Ceux qu'on a cessé de reprendre : comptés et journalisés, jamais tus.
    // Sans ce décompte, des frais définitivement perdus disparaîtraient en
    // silence — et le résultat du club resterait faux sans que rien ne le dise.
    const abandoned = await this.prisma.payment.count({
      where: {
        stripeFeesSyncedAt: null,
        stripeAccountId: { not: null },
        amountCents: { gt: 0 },
        createdAt: { lt: giveUpBefore },
      },
    });
    if (abandoned > 0) {
      this.logger.warn(
        `[frais] ${abandoned} encaissement(s) Stripe de plus de ${FEES_SWEEP_GIVE_UP_DAYS} jours ` +
          `restent sans frais connus — non repris, à examiner manuellement.`,
      );
    }

    return { examined: pending.length, resolved, abandoned };
  }

  /**
   * Balayage quotidien.
   *
   * 9h : après le run de prélèvement de 8h, pour que les frais des cartes
   * débitées le matin même soient récupérés dans la foulée. Verrou distinct,
   * pour ne jamais retarder un prélèvement.
   */
  @Cron('0 9 * * *', { timeZone: SCHEDULING_TIMEZONE })
  async dailySweep(): Promise<void> {
    if (process.env.STRIPE_FEES_SWEEP_DISABLED === 'true') return;
    await this.lock.withLock(
      SCHEDULER_LOCK_KEYS.stripeFeesSweep,
      10 * 60_000,
      async () => {
        const report = await this.sweepPendingFees();
        if (report.examined > 0) {
          this.logger.log(
            `[frais] balayage quotidien : ${JSON.stringify(report)}`,
          );
        }
      },
    );
  }
}

/**
 * Extrait les frais Stripe d'un PaymentIntent enrichi.
 *
 * Ne retient que les `fee_details` de type `stripe_fee`, et non le total
 * `balance_transaction.fee`. La distinction est aujourd'hui sans effet — les
 * deux valent la même chose — mais elle le deviendra le jour où une commission
 * plateforme ClubFlow sera prélevée : celle-ci apparaîtrait alors dans le total
 * et se retrouverait imputée aux « frais bancaires » DU CLUB, sans erreur, sans
 * log et sans test rouge.
 */
export function extractStripeFee(pi: Stripe.PaymentIntent): {
  feeCents: number;
  currency: string;
  balanceTransactionId: string;
} | null {
  const charge = pi.latest_charge;
  if (!charge || typeof charge === 'string') return null;

  const bt = charge.balance_transaction;
  // `null` tant que la charge est `pending` — cas nominal du SEPA.
  if (!bt || typeof bt === 'string') return null;

  const details = bt.fee_details ?? [];
  const feeCents = details
    .filter((d) => d.type === 'stripe_fee')
    .reduce((sum, d) => sum + d.amount, 0);

  if (feeCents <= 0) return null;

  return {
    feeCents,
    currency: bt.currency,
    balanceTransactionId: bt.id,
  };
}
