import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
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
import { lockInvoiceInTx } from './settlement-locks';

/**
 * Fenêtre de rapprochement des remboursements. Au-delà, un remboursement non
 * enregistré relève de l'anomalie à traiter à la main, pas du rattrapage
 * automatique.
 */
const REFUND_RECONCILE_DAYS = 45;

/**
 * Un remboursement abouti d'une charge. `fromApp` : créé par `refundPayment`,
 * qui désigne en metadata l'encaissement qu'il rend ; un remboursement fait
 * depuis le tableau de bord Stripe ne désigne rien.
 */
export type ChargeRefund = {
  id: string;
  amountCents: number;
  fromApp: boolean;
};

function isFromApp(refund: Stripe.Refund): boolean {
  const paymentId = refund.metadata?.paymentId;
  return typeof paymentId === 'string' && paymentId.length > 0;
}

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
 * 2. UN REMBOURSEMENT ÉTEINT LA CRÉANCE CORRESPONDANTE. C'est un choix
 *    métier tranché, pas une commodité comptable (ADR-0011).
 *
 *    Un remboursement se matérialise par un Payment négatif (convention de
 *    invoice-totals.ts), qui fait REMONTER le solde de la facture. L'avoir
 *    émis en regard, TOUJOURS du montant remboursé, l'absorbe.
 *
 *    Sur une facture déjà soldée, l'avoir empêche un second débit : sans lui
 *    la facture redeviendrait due et le moteur reprélèverait l'adhérent qu'on
 *    vient de rembourser.
 *
 *    Sur une facture ENCORE DUE — un échéancier de 300 € dont la première
 *    échéance de 100 € est remboursée — l'avoir fait davantage : il abandonne
 *    100 € de créance, et l'adhérent paiera 200 € au total. Ce n'est PAS un
 *    effet de bord, c'est l'invariant retenu : rendre l'argent éteint la
 *    dette correspondante. L'alternative — ressusciter la dette — laisserait
 *    100 € dus sans échéance pour les porter, donc un reliquat orphelin que
 *    personne ne recouvrerait davantage. Si un jour il faut rembourser SANS
 *    éteindre, ce sera un paramètre explicite de `refundClubPayment`, jamais
 *    un comportement implicite.
 *
 *    L'invariant est verrouillé par un test sur une facture PARTIELLEMENT
 *    réglée — le cas où il est faux si on se trompe. Un test sur facture
 *    soldée ne prouverait rien : il y est vrai par construction.
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
    //
    // On NE SE REPLIE PAS sur notre base quand Stripe est illisible, et le
    // commentaire qui vivait ici prétendait exactement l'inverse : il
    // affirmait qu'un repli ne pouvait que sous-estimer le déjà-remboursé,
    // donc « refuser un remboursement légitime plutôt qu'en autoriser un de
    // trop ». Le raisonnement est inversé — sous-estimer le déjà-remboursé
    // SUR-estime le remboursable (montant − déjà rendu), donc autorise plus.
    //
    // Le dommage n'est pas le dépassement, que Stripe refuse de toute façon,
    // mais la CLÉ D'IDEMPOTENCE ci-dessous, qui intègre `alreadyRefunded`.
    // Calculée sur une base en retard, elle rejoue la clé du remboursement
    // précédent : Stripe renvoie alors le PREMIER remboursement au lieu d'en
    // créer un second, et l'appel réussit. Le trésorier voit deux
    // remboursements de 40 € réussis ; l'adhérent en a reçu un seul. C'est
    // très exactement le scénario que cette lecture existe pour empêcher.
    //
    // Cette lecture n'est donc pas un accessoire dont on peut se passer :
    // elle EST le plafond et la clé. Si elle échoue, on refuse.
    const refunded = await this.stripeAmountRefunded(stripe, payment);
    if (refunded === null) {
      throw new ServiceUnavailableException(
        'Montant déjà remboursé indisponible chez Stripe — remboursement ' +
          'refusé par prudence. Réessayez dans un instant.',
      );
    }
    const alreadyRefunded = refunded.totalCents;
    // Ce qui a rendu l'excédent de la charge, sans paiement en base (ENCAISSEMENT
    // ORPHELIN PARTIEL), n'a rien rendu de l'encaissement.
    const refundable =
      payment.amountCents - (alreadyRefunded - refunded.excessCents);
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
   * Montant déjà remboursé d'après Stripe : en tout (`totalCents`), et sur
   * l'excédent de la charge que le webhook n'a pas enregistré (`excessCents`,
   * cf. `excessRefundedInTx`).
   *
   * `null` signifie STRICTEMENT « la lecture a échoué », et rien d'autre :
   * l'appelant refuse alors le remboursement, cette valeur servant à la fois
   * de plafond et de composante de la clé d'idempotence.
   *
   * La distinction compte, et elle a failli être manquée. Confondre « pas de
   * charge » avec « illisible » rendrait impossible un remboursement
   * parfaitement légitime dès que Stripe répond correctement mais que le
   * PaymentIntent n'a pas de charge rattachée : ce n'est pas une panne, c'est
   * un fait — rien n'a été remboursé. Le cas se règle plus loin, à la création
   * du remboursement, où Stripe refusera clairement si l'encaissement n'est
   * pas remboursable.
   */
  private async stripeAmountRefunded(
    stripe: Stripe,
    payment: {
      amountCents: number;
      externalRef: string | null;
      stripeAccountId: string | null;
    },
  ): Promise<{ totalCents: number; excessCents: number } | null> {
    // L'appelant garde déjà ces deux champs ; on ne peut simplement rien
    // demander à Stripe sans eux.
    if (!payment.externalRef || !payment.stripeAccountId) return null;
    try {
      const pi = await stripe.paymentIntents.retrieve(
        payment.externalRef,
        { expand: ['latest_charge'] },
        { stripeAccount: payment.stripeAccountId },
      );
      const charge = pi.latest_charge;
      // Charge absente : le PaymentIntent existe et Stripe a répondu. Rien
      // n'a donc été remboursé — c'est une information, pas une panne.
      if (!charge) return { totalCents: 0, excessCents: 0 };
      // Charge renvoyée comme simple identifiant : l'expansion n'a pas eu
      // lieu, et on ignore le montant remboursé. Là, c'est bien illisible.
      if (typeof charge === 'string') {
        this.logger.warn(
          `[remboursement] latest_charge non expansé pour ${payment.externalRef} — ` +
            `montant déjà remboursé inconnu.`,
        );
        return null;
      }
      const totalCents = charge.amount_refunded ?? 0;
      // Encaissé au-delà de l'encaissement enregistré : un remboursement créé
      // hors de ClubFlow rend cet excédent d'abord. Une liste illisible n'en
      // compte aucun : le plafond baisse, il ne monte jamais.
      const excess = charge.amount_captured - payment.amountCents;
      if (!(excess > 0) || totalCents === 0) {
        return { totalCents, excessCents: 0 };
      }
      const refunds = await this.listRefundsForCharge(
        charge,
        payment.stripeAccountId,
      );
      const outside = refunds
        .filter(
          (r) =>
            !isFromApp(r) && r.status !== 'failed' && r.status !== 'canceled',
        )
        .reduce((sum, r) => sum + r.amount, 0);
      return { totalCents, excessCents: Math.min(excess, outside) };
    } catch (err) {
      this.logger.warn(
        `[remboursement] montant déjà remboursé illisible chez Stripe pour ` +
          `${payment.externalRef} — remboursement refusé. ${(err as Error).message}`,
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
   * Enregistre les remboursements aboutis d'une charge : webhook
   * `charge.refunded`, et rattrapage quotidien. Rend le nombre de
   * remboursements écrits en base par cet appel.
   */
  async applyChargeRefunds(args: {
    clubId: string;
    paymentIntentId: string;
    stripeAccountId: string | null;
    /** Ce que Stripe a encaissé sur la charge (`amount_captured`). */
    capturedCents: number;
    refunds: Stripe.Refund[];
  }): Promise<number> {
    // Un remboursement `pending` ou `failed` n'a rien rendu : l'inscrire
    // créerait un avoir pour de l'argent qui n'est jamais parti.
    const succeeded = args.refunds.filter((r) => r.status === 'succeeded');
    const charge = {
      capturedCents: args.capturedCents,
      refunds: succeeded.map((r) => ({
        id: r.id,
        amountCents: r.amount,
        fromApp: isFromApp(r),
      })),
    };
    let written = 0;
    for (const r of succeeded) {
      const recorded = await this.applyRefundConfirmed({
        clubId: args.clubId,
        paymentIntentId: args.paymentIntentId,
        refundId: r.id,
        amountCents: r.amount,
        stripeAccountId: args.stripeAccountId,
        reason:
          typeof r.metadata?.reason === 'string' ? r.metadata.reason : null,
        charge,
      });
      if (recorded) written += 1;
    }
    return written;
  }

  /**
   * Enregistre en base un remboursement confirmé par Stripe.
   *
   * Appelé depuis le webhook `charge.refunded`, et non depuis `refundPayment` :
   * un remboursement peut aussi être déclenché depuis le dashboard Stripe par
   * le club lui-même. Le webhook est le seul point de passage commun, donc le
   * seul endroit où l'enregistrement est garanti quelle que soit l'origine.
   *
   * Idempotent par `externalRef` : Stripe rejoue ses livraisons. Rend `true`
   * si cet appel a écrit le remboursement en base.
   */
  async applyRefundConfirmed(args: {
    clubId: string;
    paymentIntentId: string;
    refundId: string;
    amountCents: number;
    stripeAccountId: string | null;
    /** Motif saisi par le trésorier, repris tel quel sur l'avoir. */
    reason?: string | null;
    /**
     * La charge qui porte ce remboursement : ce que Stripe a encaissé, et ses
     * remboursements aboutis, celui-ci compris (cf. `excessRefundedInTx`).
     */
    charge: { capturedCents: number; refunds: ChargeRefund[] };
  }): Promise<boolean> {
    // Lecture préalable : évite un aller-retour et des logs inutiles dans le
    // cas courant du rejeu. Elle ne SUFFIT pas — deux livraisons concurrentes
    // la passeraient toutes les deux — c'est la contrainte d'unicité en base
    // qui tranche, plus bas.
    const already = await this.prisma.payment.findFirst({
      where: { clubId: args.clubId, stripeRefundId: args.refundId },
      select: { id: true },
    });
    if (already) return false;

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
      return false;
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
      return false;
    }

    let outcome: { excessCents: number; creditNote: { id: string } | null };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
      // Sous le verrou de la facture (ADR-0022, §3), avant d'écrire. Une saisie,
      // une imputation, un avoir ou une annulation relit la facture en plusieurs
      // requêtes, puis écrit : ce remboursement ne s'intercale plus entre ces
      // requêtes, ni entre la relecture et son commit. Rien n'est relu ici :
      // l'argent est rendu, il s'enregistre quel que soit l'état de la facture.
      await lockInvoiceInTx(tx, original.invoiceId);

      // La part qui rend l'excédent de la charge ne rembourse pas la facture.
      // Relue sous le verrou : ce que les autres remboursements en ont écrit ne
      // change plus avant le commit.
      const excessCents = await this.excessRefundedInTx(tx, original, args);
      const amountCents = args.amountCents - excessCents;
      if (amountCents <= 0) return { excessCents, creditNote: null };

      // Le Payment négatif matérialise la sortie de trésorerie, rattaché à
      // l'encaissement qu'il rembourse.
      await tx.payment.create({
        data: {
          clubId: args.clubId,
          invoiceId: original.invoiceId,
          amountCents: -amountCents,
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
      const creditNote = await this.creditNotes.create({
        tx,
        clubId: args.clubId,
        parentInvoiceId: original.invoiceId,
        amountCents,
        reason: args.reason?.trim()
          ? args.reason.trim()
          : `Remboursement Stripe ${args.refundId}`,
      });
      return { excessCents, creditNote };
      });
    } catch (err) {
      // P2002 = violation d'unicité sur (clubId, stripeRefundId) : une autre
      // livraison du même webhook a gagné la course. Le remboursement est
      // enregistré, il n'y a rien à faire ni à signaler.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }

    const { excessCents, creditNote } = outcome;
    if (!creditNote) {
      this.logger.log(
        `[remboursement] ${args.refundId} : ${args.amountCents} cts rendus sur ` +
          `l'excédent non enregistré de ${args.paymentIntentId}, sans paiement ` +
          `négatif ni avoir.`,
      );
      return false;
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
      `[remboursement] ${args.refundId} enregistré : ${args.amountCents - excessCents} cts ` +
        `sur la facture ${original.invoiceId}, avoir émis` +
        (excessCents > 0
          ? ` ; ${excessCents} cts rendus sur l'excédent non enregistré.`
          : '.'),
    );
    return true;
  }

  /**
   * La part d'un remboursement qui rend l'excédent de sa charge, sans
   * rembourser la facture (ADR-0022, §3).
   *
   * Un encaissement carte supérieur au reste dû n'enregistre que ce reste, et
   * signale le surplus en ENCAISSEMENT ORPHELIN PARTIEL : cet excédent est chez
   * le club sans paiement. Le rendre ne doit écrire ni paiement négatif, ni
   * avoir, qui éteindrait sur la facture une dette qu'elle n'a jamais portée.
   *
   * - Un remboursement de `refundPayment` rend l'encaissement qu'il désigne :
   *   aucune part d'excédent.
   * - Un autre (tableau de bord Stripe) rend d'abord l'excédent, moins ce que
   *   les autres remboursements hors ClubFlow en ont déjà rendu. Ce qu'un
   *   remboursement a rendu de l'excédent, c'est ce qu'il n'a pas écrit en
   *   base : la part ne dépend ni de l'ordre des livraisons, ni d'un rejeu.
   */
  private async excessRefundedInTx(
    tx: Prisma.TransactionClient,
    original: { id: string; amountCents: number },
    args: {
      refundId: string;
      amountCents: number;
      charge: { capturedCents: number; refunds: ChargeRefund[] };
    },
  ): Promise<number> {
    const excessCents = args.charge.capturedCents - original.amountCents;
    // Un montant encaissé illisible ne fait pas d'excédent.
    if (!(excessCents > 0)) return 0;
    // Absent de la liste, il s'écrit en entier : une erreur se voit en base au
    // lieu de se taire.
    const self = args.charge.refunds.find((r) => r.id === args.refundId);
    if (!self || self.fromApp) return 0;
    const others = args.charge.refunds.filter(
      (r) => r.id !== args.refundId && !r.fromApp,
    );
    const recorded =
      others.length > 0
        ? await tx.payment.findMany({
            where: { refundedPaymentId: original.id },
            select: { stripeRefundId: true, amountCents: true },
          })
        : [];
    const takenByOthers = others.reduce((sum, r) => {
      const written = recorded
        .filter((p) => p.stripeRefundId === r.id)
        .reduce((total, p) => total - p.amountCents, 0);
      return sum + Math.max(0, r.amountCents - written);
    }, 0);
    return Math.min(args.amountCents, Math.max(0, excessCents - takenByOthers));
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
        // tous, l'enregistrement étant idempotent. Un remboursement qui n'a
        // rendu que l'excédent de la charge n'écrit rien, et l'écart demeure :
        // rien n'est alors rattrapé.
        const refunds = await this.listRefundsForCharge(
          charge,
          p.stripeAccountId as string,
        );
        const written = await this.applyChargeRefunds({
          clubId: p.clubId,
          paymentIntentId: p.externalRef as string,
          stripeAccountId: p.stripeAccountId,
          capturedCents: charge.amount_captured,
          refunds,
        });
        if (written === 0) continue;
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
    if (process.env.STRIPE_REFUND_RECONCILE_DISABLED === 'true') {
      // Un interrupteur d'urgence oublié ne se signale par rien d'autre.
      // Ici l'oubli coûte cher : sans rapprochement, un webhook
      // `charge.refunded` manqué laisse de l'argent parti du compte du club
      // sans aucune trace en base.
      this.logger.warn(
        '[remboursements] rapprochement DÉSACTIVÉ par ' +
          'STRIPE_REFUND_RECONCILE_DISABLED — les remboursements non ' +
          'enregistrés ne seront pas rattrapés.',
      );
      return;
    }
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
