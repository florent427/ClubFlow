import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PaymentScheduleInstallmentStatus as InstallmentStatus,
  PaymentScheduleStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import {
  SCHEDULER_LOCK_KEYS,
  SCHEDULING_TIMEZONE,
} from '../scheduling/scheduling.constants';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import { PaymentScheduleNotifierService } from './payment-schedule-notifier.service';

/** Résumé d'un passage du moteur, pour les logs et le déclenchement manuel. */
export type ScheduleRunReport = {
  examined: number;
  charged: number;
  failed: number;
  requiresAction: number;
  skipped: number;
};

/**
 * Moteur de prélèvement des échéances (cf. ADR-0009, lot 3).
 *
 * Tourne une fois par jour et prélève, off-session, toutes les échéances
 * dues. Trois garde-fous contre le DOUBLE DÉBIT, qui est le risque majeur :
 *
 *  1. La réservation d'une échéance (SCHEDULED → PROCESSING) est un
 *     `updateMany` conditionnel : deux exécutions concurrentes ne peuvent pas
 *     réserver la même ligne.
 *  2. Chaque tentative porte une clé d'idempotence Stripe déterministe, donc
 *     un rejeu (cron relancé, webhook rejoué) ne crée pas un second paiement.
 *  3. Le moteur n'écrit JAMAIS de ligne `Payment` : c'est le webhook
 *     `payment_intent.succeeded` qui le fait, par un chemin unique et déjà
 *     idempotent. Le moteur ne gère que l'état de l'échéance.
 */
@Injectable()
export class PaymentScheduleEngineService {
  private readonly logger = new Logger(PaymentScheduleEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: SchedulerLockService,
    private readonly notifier: PaymentScheduleNotifierService,
  ) {}

  private getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn(
        '[echeancier] STRIPE_SECRET_KEY absente — aucun prélèvement possible.',
      );
      return null;
    }
    return new Stripe(key);
  }

  /**
   * Passage quotidien. L'heure est exprimée dans le fuseau des clubs : le
   * serveur tourne en UTC, sans quoi « 8h » tomberait à 4h du matin sur place.
   *
   * Le verrou évite qu'un passage encore en cours soit doublé par le suivant.
   */
  @Cron('0 8 * * *', { timeZone: SCHEDULING_TIMEZONE })
  async dailyRun(): Promise<void> {
    if (process.env.PAYMENT_SCHEDULE_CRON_DISABLED === 'true') return;
    await this.lock.withLock(
      SCHEDULER_LOCK_KEYS.paymentScheduleRun,
      15 * 60_000,
      async () => {
        const report = await this.runDue();
        this.logger.log(
          `[echeancier] passage quotidien : ${JSON.stringify(report)}`,
        );
      },
    );
  }

  /**
   * Prélève toutes les échéances exigibles. Exposé publiquement pour pouvoir
   * être rejoué à la main (mutation admin) sans attendre le cron.
   *
   * Un échec sur une échéance n'interrompt pas le passage : chaque ligne est
   * traitée isolément, sinon un club en erreur bloquerait tous les autres.
   */
  async runDue(opts?: { now?: Date; clubId?: string }): Promise<ScheduleRunReport> {
    const now = opts?.now ?? new Date();
    // Avant de prélever, on rattrape les échéances restées bloquées : sinon
    // de l'argent encaissé resterait invisible pour l'échéancier.
    await this.reconcileStuckProcessing(opts?.clubId, now);
    const report: ScheduleRunReport = {
      examined: 0,
      charged: 0,
      failed: 0,
      requiresAction: 0,
      skipped: 0,
    };

    const due = await this.prisma.paymentScheduleInstallment.findMany({
      where: {
        ...(opts?.clubId ? { clubId: opts.clubId } : {}),
        OR: [
          // Jamais tentée et exigible.
          { status: InstallmentStatus.SCHEDULED, dueOn: { lte: now } },
          // Échec précédent dont la reprise est programmée.
          {
            status: InstallmentStatus.FAILED_RETRYABLE,
            nextAttemptAt: { lte: now },
          },
        ],
        // Seuls les échéanciers réellement prélevables.
        schedule: { status: PaymentScheduleStatus.ACTIVE },
      },
      include: { schedule: true },
      orderBy: [{ dueOn: 'asc' }, { seq: 'asc' }],
      take: 500,
    });

    report.examined = due.length;
    if (due.length === 0) return report;

    const stripe = this.getStripe();
    if (!stripe) {
      report.skipped = due.length;
      return report;
    }

    for (const inst of due) {
      try {
        const outcome = await this.chargeOne(stripe, inst, inst.schedule, now);
        if (outcome === 'charged') report.charged += 1;
        else if (outcome === 'requires_action') report.requiresAction += 1;
        else if (outcome === 'failed') report.failed += 1;
        else report.skipped += 1;
      } catch (err) {
        report.failed += 1;
        this.logger.error(
          `[echeancier] échéance ${inst.id} : erreur inattendue — ${(err as Error).message}`,
        );
      }
    }
    return report;
  }

  /**
   * Traite une échéance. Renvoie l'issue pour le rapport.
   *
   * `schedule` est passé en paramètre plutôt que rechargé : il vient du même
   * `findMany`, donc cohérent avec l'échéance traitée.
   */
  private async chargeOne(
    stripe: Stripe,
    inst: { id: string; amountCents: number; attemptCount: number; seq: number },
    schedule: {
      id: string;
      invoiceId: string;
      clubId: string;
      stripeAccountId: string | null;
      stripeCustomerId: string | null;
      stripePaymentMethodId: string | null;
    },
    now: Date,
  ): Promise<'charged' | 'failed' | 'requires_action' | 'skipped'> {
    if (
      !schedule.stripeAccountId ||
      !schedule.stripeCustomerId ||
      !schedule.stripePaymentMethodId
    ) {
      this.logger.warn(
        `[echeancier] échéance ${inst.id} ignorée : moyen de paiement incomplet.`,
      );
      return 'skipped';
    }

    // Numéro de la tentative qui va être faite. Sert à construire une clé
    // d'idempotence stable : rejouer CETTE tentative ne débite pas deux fois.
    const attemptNo = inst.attemptCount + 1;
    const idempotencyKey = `sched-inst-${inst.id}-attempt-${attemptNo}`;

    // Réservation atomique : seule l'exécution qui obtient la ligne poursuit.
    const claimed = await this.prisma.paymentScheduleInstallment.updateMany({
      where: {
        id: inst.id,
        status: {
          in: [InstallmentStatus.SCHEDULED, InstallmentStatus.FAILED_RETRYABLE],
        },
      },
      data: {
        status: InstallmentStatus.PROCESSING,
        attemptCount: attemptNo,
        lastAttemptAt: now,
        lastIdempotencyKey: idempotencyKey,
      },
    });
    if (claimed.count !== 1) {
      // Une autre exécution l'a prise entre le SELECT et l'UPDATE.
      return 'skipped';
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: inst.amountCents,
          currency: 'eur',
          customer: schedule.stripeCustomerId,
          payment_method: schedule.stripePaymentMethodId,
          // Le porteur n'est pas devant son écran : Stripe s'appuie sur
          // l'authentification faite au moment du SetupIntent.
          off_session: true,
          confirm: true,
          metadata: {
            invoiceId: schedule.invoiceId,
            clubId: schedule.clubId,
            scheduleId: schedule.id,
            installmentId: inst.id,
          },
        },
        { stripeAccount: schedule.stripeAccountId, idempotencyKey },
      );

      await this.prisma.paymentScheduleInstallment.update({
        where: { id: inst.id },
        data: { stripePaymentIntentId: pi.id },
      });

      if (pi.status === 'requires_action') {
        // 3-D Secure : il faudra solliciter l'adhérent (lot 4).
        await this.prisma.paymentScheduleInstallment.update({
          where: { id: inst.id },
          data: { status: InstallmentStatus.REQUIRES_ACTION },
        });
        return 'requires_action';
      }

      if (pi.status === 'succeeded') {
        // On NE crée pas le Payment ici : le webhook s'en charge, puis
        // marque l'échéance PAID. L'échéance reste PROCESSING d'ici là.
        return 'charged';
      }

      // Tout autre état (processing pour le SEPA, requires_payment_method…)
      // sera tranché par les webhooks.
      return 'skipped';
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError;
      await this.markFailed(
        inst.id,
        stripeErr.code ?? stripeErr.type ?? 'unknown',
        stripeErr.message ?? 'Échec du prélèvement',
        attemptNo,
        now,
      );
      return 'failed';
    }
  }

  /**
   * Applique la politique d'échec de l'ADR-0009 : reprise à J+3 puis J+7,
   * puis échec définitif. Au-delà, la facture reste due et le trésorier
   * devra reprendre la main (alerte : lot 4).
   */
  private async markFailed(
    installmentId: string,
    code: string,
    message: string,
    attemptNo: number,
    now: Date,
  ): Promise<void> {
    const RETRY_OFFSETS_DAYS = [3, 7];
    const nextOffset = RETRY_OFFSETS_DAYS[attemptNo - 1];
    const definitive = nextOffset === undefined;

    await this.prisma.paymentScheduleInstallment.update({
      where: { id: installmentId },
      data: {
        status: definitive
          ? InstallmentStatus.FAILED_FINAL
          : InstallmentStatus.FAILED_RETRYABLE,
        lastFailureCode: code,
        lastFailureMessage: message.slice(0, 500),
        nextAttemptAt: definitive
          ? null
          : new Date(now.getTime() + nextOffset * 86_400_000),
      },
    });

    this.logger.warn(
      `[echeancier] échéance ${installmentId} en échec (${code}) — ` +
        (definitive
          ? 'échec définitif après 3 tentatives'
          : `nouvelle tentative dans ${nextOffset} jours`),
    );

    // Prévenir l'adhérent. L'envoi ne peut pas faire échouer le traitement
    // financier : le notificateur avale ses propres erreurs.
    await this.notifier.notifyInstallmentFailed({
      installmentId,
      definitive,
      nextAttemptAt: definitive
        ? null
        : new Date(now.getTime() + nextOffset * 86_400_000),
    });
  }

  /**
   * Échec de prélèvement signalé APRÈS coup par Stripe
   * (`payment_intent.payment_failed`).
   *
   * Indispensable pour le SEPA : un rejet y survient plusieurs jours après
   * l'ordre, bien après le retour de l'appel API. Sans ce point d'entrée,
   * l'échéance resterait bloquée en PROCESSING indéfiniment.
   */
  async applyAsyncFailure(args: {
    paymentIntentId: string;
    stripeAccountId: string | null;
    code: string;
    message: string;
  }): Promise<void> {
    const inst = await this.prisma.paymentScheduleInstallment.findFirst({
      where: { stripePaymentIntentId: args.paymentIntentId },
      include: { schedule: { select: { stripeAccountId: true } } },
    });
    if (!inst) return;

    // Garde-fou multi-tenant : l'événement doit venir du compte du club.
    if (
      args.stripeAccountId &&
      inst.schedule.stripeAccountId &&
      inst.schedule.stripeAccountId !== args.stripeAccountId
    ) {
      this.logger.warn(
        `[echeancier] échec reçu du compte ${args.stripeAccountId} pour une ` +
          `échéance rattachée à ${inst.schedule.stripeAccountId} — ignoré.`,
      );
      return;
    }
    // Un encaissement déjà constaté prime sur un échec tardif.
    if (inst.status === InstallmentStatus.PAID) return;

    await this.markFailed(
      inst.id,
      args.code,
      args.message,
      inst.attemptCount,
      new Date(),
    );
  }

  /**
   * Le prélèvement exige une authentification 3-D Secure. L'échéance sort de
   * PROCESSING pour ne pas rester bloquée ; solliciter l'adhérent reste à
   * faire (il peut déjà régler la facture depuis son espace).
   */
  async applyRequiresAction(
    paymentIntentId: string,
    stripeAccountId: string | null,
  ): Promise<void> {
    const inst = await this.prisma.paymentScheduleInstallment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { schedule: { select: { stripeAccountId: true } } },
    });
    if (!inst) return;
    if (
      stripeAccountId &&
      inst.schedule.stripeAccountId &&
      inst.schedule.stripeAccountId !== stripeAccountId
    ) {
      return;
    }
    if (inst.status === InstallmentStatus.PAID) return;

    await this.prisma.paymentScheduleInstallment.updateMany({
      where: { id: inst.id, status: { not: InstallmentStatus.PAID } },
      data: { status: InstallmentStatus.REQUIRES_ACTION },
    });
    this.logger.warn(
      `[echeancier] échéance ${inst.id} en attente d'authentification 3-D Secure.`,
    );
  }

  /**
   * Rattrape les échéances restées en PROCESSING.
   *
   * Une échéance entre en PROCESSING au moment du prélèvement et n'en sort
   * que par le webhook. Si celui-ci se perd (échec de livraison, erreur en
   * cours de traitement, redémarrage), l'échéance reste bloquée alors que
   * l'argent a bel et bien été encaissé — l'échéancier ne le sait pas.
   *
   * On ne devine rien : on se raccroche au `Payment` réellement enregistré
   * pour ce PaymentIntent. Sans lui, on se contente d'alerter, car créer un
   * encaissement ici violerait la règle du chemin d'écriture unique.
   *
   * Le délai de grâce évite de traiter une échéance dont le webhook est
   * simplement en route.
   */
  async reconcileStuckProcessing(
    clubId?: string,
    now: Date = new Date(),
    graceMs = 5 * 60_000,
  ): Promise<number> {
    const stuck = await this.prisma.paymentScheduleInstallment.findMany({
      where: {
        ...(clubId ? { clubId } : {}),
        status: InstallmentStatus.PROCESSING,
        lastAttemptAt: { lt: new Date(now.getTime() - graceMs) },
        stripePaymentIntentId: { not: null },
      },
      select: { id: true, clubId: true, stripePaymentIntentId: true },
      take: 200,
    });

    let repaired = 0;
    for (const inst of stuck) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          clubId: inst.clubId,
          externalRef: inst.stripePaymentIntentId!,
        },
        select: { id: true },
      });
      if (!payment) {
        this.logger.warn(
          `[echeancier] échéance ${inst.id} bloquée en PROCESSING sans Payment ` +
            `pour ${inst.stripePaymentIntentId} — à vérifier côté Stripe.`,
        );
        continue;
      }
      await this.markInstallmentPaid(inst.id, payment.id);
      repaired += 1;
      this.logger.log(
        `[echeancier] échéance ${inst.id} rattachée au paiement ${payment.id} (rattrapage)`,
      );
    }
    return repaired;
  }

  /**
   * Marque une échéance encaissée et la relie à son `Payment`.
   * Appelé depuis le webhook, une fois le Payment créé.
   *
   * Idempotent : rejouer l'événement ne change rien si l'échéance est déjà
   * PAID.
   */
  async markInstallmentPaid(
    installmentId: string,
    paymentId: string,
  ): Promise<void> {
    const updated = await this.prisma.paymentScheduleInstallment.updateMany({
      where: { id: installmentId, status: { not: InstallmentStatus.PAID } },
      data: {
        status: InstallmentStatus.PAID,
        paymentId,
        nextAttemptAt: null,
      },
    });
    if (updated.count === 0) return;

    // Si plus aucune échéance n'est en attente, l'échéancier est terminé.
    const inst = await this.prisma.paymentScheduleInstallment.findUnique({
      where: { id: installmentId },
      select: { scheduleId: true },
    });
    if (!inst) return;

    const remaining = await this.prisma.paymentScheduleInstallment.count({
      where: {
        scheduleId: inst.scheduleId,
        status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.CANCELLED] },
      },
    });
    if (remaining === 0) {
      await this.prisma.paymentSchedule.update({
        where: { id: inst.scheduleId },
        data: { status: PaymentScheduleStatus.COMPLETED },
      });
      this.logger.log(`[echeancier] ${inst.scheduleId} soldé`);
    }
  }
}
