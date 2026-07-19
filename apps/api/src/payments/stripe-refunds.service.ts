import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClubPaymentMethod, Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import {
  SCHEDULER_LOCK_KEYS,
  SCHEDULING_TIMEZONE,
} from '../scheduling/scheduling.constants';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import { CreditNotesService } from './credit-notes.service';

/**
 * Fenêtre de rapprochement des remboursements. Au-delà, un remboursement non
 * enregistré relève de l'anomalie à traiter à la main, pas du rattrapage
 * automatique.
 */
const REFUND_RECONCILE_DAYS = 45;

/**
 * Remboursement d'un encaissement Stripe (Phase 2).
 *
 * Jusqu'ici l'avoir existait — document, écriture comptable, export FEC — mais
 * aucun euro n'était jamais rendu : la comptabilité disait « remboursé »,
 * la banque de l'adhérent disait le contraire.
 *
 * TROIS PRINCIPES, et le deuxième est le moins évident.
 *
 * 1. L'argent part du COMPTE CONNECTÉ du club (direct charges, ADR-0008).
 *    On rembourse depuis le compte où l'encaissement est tombé, jamais depuis
 *    la plateforme — d'où `Payment.stripeAccountId`, figé à l'encaissement
 *    précisément pour survivre à un changement de compte connecté.
 *
 * 2. UN REMBOURSEMENT S'ACCOMPAGNE TOUJOURS D'UN AVOIR. Ce n'est pas une
 *    commodité comptable, c'est ce qui empêche un second débit. Un
 *    remboursement se matérialise par un Payment négatif (convention de
 *    invoice-totals.ts), qui fait REMONTER le solde de la facture. Sans avoir
 *    du même montant pour l'absorber, la facture redeviendrait due, et le
 *    moteur de prélèvement reprélèverait l'adhérent qu'on vient de rembourser.
 *    L'avoir n'est donc pas un paramètre : il est structurel.
 *
 * 3. Rien n'est écrit en base avant que Stripe ait confirmé. Enregistrer un
 *    remboursement qui n'a pas eu lieu créerait une créance fantôme au
 *    détriment du club.
 */
@Injectable()
export class StripeRefundsService {
  private readonly logger = new Logger(StripeRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditNotes: CreditNotesService,
    private readonly lock: SchedulerLockService,
  ) {}

  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new BadRequestException(
        'Remboursement indisponible : STRIPE_SECRET_KEY non configurée.',
      );
    }
    return new Stripe(key);
  }

  /**
   * Rembourse tout ou partie d'un encaissement Stripe.
   *
   * @returns l'identifiant Stripe du remboursement et le montant rendu.
   */
  async refundPayment(args: {
    clubId: string;
    paymentId: string;
    /** Null = remboursement total du solde encore remboursable. */
    amountCents?: number | null;
    reason: string;
  }): Promise<{ refundId: string; amountCents: number }> {
    const reason = args.reason.trim();
    if (!reason) {
      throw new BadRequestException('Motif obligatoire pour un remboursement.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: args.paymentId, clubId: args.clubId },
      include: { invoice: { select: { id: true, isCreditNote: true } } },
    });
    if (!payment) throw new NotFoundException('Encaissement introuvable.');
    if (payment.amountCents <= 0) {
      throw new BadRequestException(
        "Cette ligne est déjà un remboursement : elle ne peut pas être remboursée.",
      );
    }
    if (payment.method !== ClubPaymentMethod.STRIPE_CARD) {
      throw new BadRequestException(
        'Seul un encaissement Stripe peut être remboursé automatiquement. ' +
          'Pour un chèque ou des espèces, émettez un avoir et rendez les fonds ' +
          'par vos propres moyens.',
      );
    }
    if (!payment.stripeAccountId || !payment.externalRef?.startsWith('pi_')) {
      throw new BadRequestException(
        "Cet encaissement n'a pas de référence Stripe exploitable.",
      );
    }

    const stripe = this.getStripe();

    // Ce qui a DÉJÀ été rendu, lu chez Stripe et non dans notre base.
    //
    // Notre base ne l'apprend qu'au retour du webhook. Entre l'appel et sa
    // livraison — quelques secondes — elle croit encore que rien n'a été
    // rendu. Deux remboursements partiels identiques enchaînés dans cette
    // fenêtre produiraient la même clé d'idempotence, et Stripe renverrait
    // simplement le PREMIER au lieu d'en créer un second : le trésorier
    // croirait avoir rendu 20 €, l'adhérent n'en aurait reçu que 10.
    //
    // `charge.amount_refunded` est mis à jour immédiatement et fait autorité.
    // On ne retombe sur notre base que si Stripe est illisible — auquel cas
    // l'estimation est prudente, jamais permissive : elle ne peut que
    // SOUS-estimer le déjà-remboursé, donc refuser un remboursement légitime
    // plutôt qu'en autoriser un de trop.
    const alreadyRefunded =
      (await this.stripeAmountRefunded(stripe, payment)) ??
      (await this.sumRefundedForPayment(payment.id));
    const refundable = payment.amountCents - alreadyRefunded;
    if (refundable <= 0) {
      throw new BadRequestException(
        'Cet encaissement a déjà été intégralement remboursé.',
      );
    }

    const amount = args.amountCents ?? refundable;
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (amount > refundable) {
      throw new BadRequestException(
        `Montant trop élevé : remboursable au plus ${refundable} cts (centimes).`,
      );
    }

    // Clé d'idempotence portant le montant : deux remboursements PARTIELS
    // successifs du même montant sont légitimes et ne doivent pas être
    // confondus, mais un double-clic sur le même geste ne doit rendre
    // l'argent qu'une fois.
    const idempotencyKey = `refund-${payment.id}-${alreadyRefunded}-${amount}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.externalRef,
        amount,
        metadata: {
          clubId: args.clubId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          // Conservé côté Stripe ET repris sur l'avoir : un motif exigé du
          // trésorier puis jeté ne sert qu'à l'agacer.
          reason,
        },
      },
      { stripeAccount: payment.stripeAccountId, idempotencyKey },
    );

    this.logger.log(
      `[remboursement] ${refund.id} — ${amount} cts rendus sur l'encaissement ${payment.id}.`,
    );

    return { refundId: refund.id, amountCents: amount };
  }

  /**
   * Montant déjà remboursé d'après Stripe, ou `null` s'il est illisible.
   *
   * Volontairement tolérant : l'appelant retombe alors sur la base. Faire
   * échouer un remboursement parce qu'une lecture accessoire a échoué serait
   * disproportionné.
   */
  private async stripeAmountRefunded(
    stripe: Stripe,
    payment: { externalRef: string | null; stripeAccountId: string | null },
  ): Promise<number | null> {
    if (!payment.externalRef || !payment.stripeAccountId) return null;
    try {
      const pi = await stripe.paymentIntents.retrieve(
        payment.externalRef,
        { expand: ['latest_charge'] },
        { stripeAccount: payment.stripeAccountId },
      );
      const charge = pi.latest_charge;
      if (!charge || typeof charge === 'string') return null;
      return charge.amount_refunded ?? 0;
    } catch (err) {
      this.logger.warn(
        `[remboursement] montant déjà remboursé illisible chez Stripe pour ` +
          `${payment.externalRef} — repli sur la base. ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Remboursements d'une charge, sans dépendre du payload du webhook.
   *
   * `charge.refunds` n'est plus inclus par défaut dans l'objet Charge depuis
   * l'API 2022-11-15. Nos destinations webhook sont aujourd'hui épinglées sur
   * une version antérieure, donc le champ arrive encore — mais faire dépendre
   * un chemin d'ARGENT d'une version d'API de cinq ans est intenable : le jour
   * où elle sera relevée, les remboursements cesseraient d'être enregistrés
   * sans le moindre bruit. On interroge donc Stripe explicitement, ce qui est
   * juste quelle que soit la version.
   *
   * Le champ est tout de même utilisé s'il est présent : cela évite un
   * aller-retour réseau dans le cas courant.
   */
  async listRefundsForCharge(
    charge: Stripe.Charge,
    stripeAccount: string,
  ): Promise<Stripe.Refund[]> {
    const inline = charge.refunds?.data;
    if (inline && inline.length > 0) return inline;

    try {
      const list = await this.getStripe().refunds.list(
        { charge: charge.id, limit: 100 },
        { stripeAccount },
      );
      return list.data;
    } catch (err) {
      this.logger.warn(
        `[remboursement] liste des remboursements illisible pour ${charge.id} — ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Enregistre en base un remboursement confirmé par Stripe.
   *
   * Appelé depuis le webhook `charge.refunded`, et non depuis `refundPayment` :
   * un remboursement peut aussi être déclenché depuis le dashboard Stripe par
   * le club lui-même. Le webhook est le seul point de passage commun, donc le
   * seul endroit où l'enregistrement est garanti quelle que soit l'origine.
   *
   * Idempotent par `externalRef` : Stripe rejoue ses livraisons.
   */
  async applyRefundConfirmed(args: {
    clubId: string;
    paymentIntentId: string;
    refundId: string;
    amountCents: number;
    stripeAccountId: string | null;
    /** Motif saisi par le trésorier, repris tel quel sur l'avoir. */
    reason?: string | null;
  }): Promise<void> {
    // Lecture préalable : évite un aller-retour et des logs inutiles dans le
    // cas courant du rejeu. Elle ne SUFFIT pas — deux livraisons concurrentes
    // la passeraient toutes les deux — c'est la contrainte d'unicité en base
    // qui tranche, plus bas.
    const already = await this.prisma.payment.findFirst({
      where: { clubId: args.clubId, stripeRefundId: args.refundId },
      select: { id: true },
    });
    if (already) return;

    const original = await this.prisma.payment.findFirst({
      where: {
        clubId: args.clubId,
        externalRef: args.paymentIntentId,
        amountCents: { gt: 0 },
      },
      include: { invoice: { select: { id: true, label: true, status: true } } },
    });
    if (!original) {
      this.logger.warn(
        `[remboursement] ${args.refundId} sans encaissement d'origine connu ` +
          `(${args.paymentIntentId}) — non enregistré.`,
      );
      return;
    }

    // Garde-fou multi-tenant : le remboursement doit venir du compte connecté
    // sur lequel l'encaissement a réellement eu lieu.
    if (
      args.stripeAccountId &&
      original.stripeAccountId &&
      original.stripeAccountId !== args.stripeAccountId
    ) {
      this.logger.warn(
        `[remboursement] ${args.refundId} reçu du compte ${args.stripeAccountId} ` +
          `alors que l'encaissement appartient à ${original.stripeAccountId} — ignoré.`,
      );
      return;
    }

    let creditNote: { id: string };
    try {
      creditNote = await this.prisma.$transaction(async (tx) => {
      // Le Payment négatif matérialise la sortie de trésorerie, rattaché à
      // l'encaissement qu'il rembourse.
      await tx.payment.create({
        data: {
          clubId: args.clubId,
          invoiceId: original.invoiceId,
          amountCents: -args.amountCents,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: args.refundId,
          stripeRefundId: args.refundId,
          refundedPaymentId: original.id,
          stripeAccountId: original.stripeAccountId,
          paidByMemberId: original.paidByMemberId,
          paidByContactId: original.paidByContactId,
        },
      });

      // …et l'avoir absorbe la dette qui vient de rouvrir. Sans lui, la
      // facture redeviendrait due du montant remboursé et le moteur de
      // prélèvement s'en saisirait. Les deux écritures partagent la même
      // transaction : l'une sans l'autre laisserait la facture réclamable.
      return this.creditNotes.create({
        tx,
        clubId: args.clubId,
        parentInvoiceId: original.invoiceId,
        amountCents: args.amountCents,
        reason: args.reason?.trim()
          ? args.reason.trim()
          : `Remboursement Stripe ${args.refundId}`,
      });
      });
    } catch (err) {
      // P2002 = violation d'unicité sur (clubId, stripeRefundId) : une autre
      // livraison du même webhook a gagné la course. Le remboursement est
      // enregistré, il n'y a rien à faire ni à signaler.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }

    // Contre-passation APRÈS le commit : un plan comptable incomplet ne doit
    // pas annuler un remboursement déjà versé à l'adhérent.
    await this.creditNotes
      .recordAccounting(args.clubId, creditNote.id, original.id)
      .catch((err: Error) => {
        this.logger.warn(
          `[remboursement] écriture d'avoir impossible pour ${args.refundId} — ${err.message}`,
        );
      });

    this.logger.log(
      `[remboursement] ${args.refundId} enregistré : ${args.amountCents} cts ` +
        `sur la facture ${original.invoiceId}, avoir émis.`,
    );
  }

  /**
   * Rattrape les remboursements dont le webhook n'est jamais arrivé.
   *
   * Un `charge.refunded` peut manquer pour trois raisons : l'événement n'était
   * pas abonné, la livraison a échoué au-delà des relances de Stripe, ou le
   * traitement a levé. Dans les trois cas l'argent a quitté le compte du club
   * et rien ne le dit — le pire état possible.
   *
   * On compare donc, chez Stripe, le montant réellement remboursé de chaque
   * encaissement récent à ce que la base en connaît. La source de vérité est
   * `charge.amount_refunded`, pas notre propre table.
   *
   * Borné aux encaissements récents : un remboursement intervient presque
   * toujours dans les semaines qui suivent, et interroger Stripe pour tout
   * l'historique chaque jour coûterait sans rien apprendre.
   */
  async reconcileMissedRefunds(opts?: {
    now?: Date;
    limit?: number;
  }): Promise<{ examined: number; recovered: number }> {
    const now = opts?.now ?? new Date();
    const since = new Date(now.getTime() - REFUND_RECONCILE_DAYS * 86_400_000);

    const candidates = await this.prisma.payment.findMany({
      where: {
        amountCents: { gt: 0 },
        stripeAccountId: { not: null },
        externalRef: { startsWith: 'pi_' },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        clubId: true,
        externalRef: true,
        stripeAccountId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 200,
    });

    let recovered = 0;
    for (const p of candidates) {
      try {
        const known = await this.sumRefundedForPayment(p.id);
        const pi = await this.getStripe().paymentIntents.retrieve(
          p.externalRef as string,
          { expand: ['latest_charge'] },
          { stripeAccount: p.stripeAccountId as string },
        );
        const charge = pi.latest_charge;
        if (!charge || typeof charge === 'string') continue;
        if ((charge.amount_refunded ?? 0) <= known) continue;

        // Écart : au moins un remboursement nous a échappé. On les reprend
        // tous, l'enregistrement étant idempotent.
        const refunds = await this.listRefundsForCharge(
          charge,
          p.stripeAccountId as string,
        );
        for (const r of refunds) {
          if (r.status !== 'succeeded') continue;
          await this.applyRefundConfirmed({
            clubId: p.clubId,
            paymentIntentId: p.externalRef as string,
            refundId: r.id,
            amountCents: r.amount,
            stripeAccountId: p.stripeAccountId,
            reason:
              typeof r.metadata?.reason === 'string' ? r.metadata.reason : null,
          });
        }
        recovered += 1;
        this.logger.warn(
          `[remboursement] rattrapage sur l'encaissement ${p.id} : ` +
            `${charge.amount_refunded} cts remboursés chez Stripe, ${known} cts connus.`,
        );
      } catch (err) {
        // Un encaissement illisible ne doit pas interrompre le balayage.
        this.logger.warn(
          `[remboursement] rapprochement impossible pour ${p.id} — ${(err as Error).message}`,
        );
      }
    }

    return { examined: candidates.length, recovered };
  }

  /**
   * Rapprochement quotidien. 9h30 : après le balayage des frais, verrou
   * distinct pour que l'un ne retarde jamais l'autre.
   */
  @Cron('30 9 * * *', { timeZone: SCHEDULING_TIMEZONE })
  async dailyReconcile(): Promise<void> {
    if (process.env.STRIPE_REFUND_RECONCILE_DISABLED === 'true') return;
    await this.lock.withLock(
      SCHEDULER_LOCK_KEYS.stripeRefundReconcile,
      10 * 60_000,
      async () => {
        const report = await this.reconcileMissedRefunds();
        if (report.recovered > 0) {
          this.logger.warn(
            `[remboursement] rapprochement quotidien : ${JSON.stringify(report)}`,
          );
        }
      },
    );
  }

  /**
   * Somme déjà remboursée SUR CET ENCAISSEMENT PRÉCIS, en valeur positive.
   *
   * Le rattachement passe par `refundedPaymentId` et non par la facture :
   * une facture peut porter plusieurs encaissements Stripe (acompte puis
   * solde, échéancier en plusieurs fois). Agréger au niveau de la facture
   * ferait croire qu'un encaissement est déjà remboursé parce qu'un AUTRE
   * l'a été, et bloquerait un remboursement légitime — ou pire, en
   * autoriserait un de trop sur le premier encaissement venu.
   */
  private async sumRefundedForPayment(paymentId: string): Promise<number> {
    const agg = await this.prisma.payment.aggregate({
      where: { refundedPaymentId: paymentId },
      _sum: { amountCents: true },
    });
    return Math.abs(agg._sum.amountCents ?? 0);
  }
}
