import { BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { PaymentScheduleMethod, type Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePayerScopeService } from './invoice-payer-scope.service';
import { PaymentScheduleService } from './payment-schedule.service';
import {
  PaymentScheduleGraph,
  PaymentScheduleSetupSessionGraph,
} from './models/payment-schedule.model';

/** Bornes de saisie du portail (cf. ADR-0009) : de 2× à 12× (mensualisation). */
const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 12;

/**
 * Échéancier de paiement — surface PORTAIL MEMBRE (cf. ADR-0009).
 *
 * Mêmes garde-fous que `viewerCreateInvoiceCheckoutSession` : JWT, club
 * courant, profil actif cohérent, module Paiement activé. Le contrôle
 * « seul le payeur du foyer » est délégué à `InvoicePayerScopeService`,
 * partagé avec le portail — voir ce service pour le pourquoi.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class PaymentScheduleResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: PaymentScheduleService,
    private readonly payerScope: InvoicePayerScopeService,
  ) {}

  /**
   * Résout la facture visée en la restreignant au périmètre payeur du
   * visiteur. Toute facture hors périmètre est indiscernable d'une facture
   * inexistante : on ne révèle pas l'existence des factures d'un autre foyer.
   */
  private async requirePayableInvoiceId(
    club: Club,
    user: RequestUser,
    invoiceId: string,
  ): Promise<string> {
    const where = await this.payerScope.resolvePayerInvoiceWhere({
      clubId: club.id,
      activeProfile: {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      viewerUserId: user.userId,
    });
    if (!where) {
      throw new BadRequestException(
        'Seul le payeur du foyer peut régler une facture en ligne.',
      );
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { ...where, id: invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable.');
    }
    return invoice.id;
  }

  @Query(() => PaymentScheduleGraph, {
    name: 'viewerInvoicePaymentSchedule',
    nullable: true,
    description:
      'Échéancier de la facture, ou null si elle n’en a pas encore. Restreint aux factures du foyer dont le visiteur est payeur.',
  })
  async viewerInvoicePaymentSchedule(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('invoiceId') invoiceId: string,
  ): Promise<PaymentScheduleGraph | null> {
    const id = await this.requirePayableInvoiceId(club, user, invoiceId);
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { invoiceId: id, clubId: club.id },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
    return schedule ? toPaymentScheduleGraph(schedule) : null;
  }

  @Mutation(() => PaymentScheduleGraph, {
    name: 'viewerCreatePaymentSchedule',
    description:
      'Crée l’échéancier d’une facture ouverte du foyer. L’échelonnement porte sur le solde restant dû. Naît en PENDING_SETUP : appeler ensuite viewerStartPaymentScheduleSetup.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async viewerCreatePaymentSchedule(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('invoiceId') invoiceId: string,
    @Args('method', { type: () => PaymentScheduleMethod })
    method: PaymentScheduleMethod,
    @Args('installmentCount', { type: () => Int }) installmentCount: number,
  ): Promise<PaymentScheduleGraph> {
    assertInstallmentCountInRange(installmentCount);
    const id = await this.requirePayableInvoiceId(club, user, invoiceId);
    const schedule = await this.schedules.createForInvoice({
      clubId: club.id,
      invoiceId: id,
      method,
      installmentCount,
    });
    return toPaymentScheduleGraph(schedule);
  }

  @Mutation(() => PaymentScheduleSetupSessionGraph, {
    name: 'viewerStartPaymentScheduleSetup',
    description:
      'Ouvre le parcours Stripe d’enregistrement du moyen de paiement (mode setup, aucun euro débité). Rediriger le navigateur vers l’URL retournée.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async viewerStartPaymentScheduleSetup(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('scheduleId') scheduleId: string,
  ): Promise<PaymentScheduleSetupSessionGraph> {
    // `startSetup` ne filtre que sur le club : sans cette vérification, un
    // membre pourrait enregistrer SON moyen de paiement sur l'échéancier d'un
    // autre foyer. On repasse donc par le périmètre payeur via la facture.
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, clubId: club.id },
      select: { id: true, invoiceId: true },
    });
    if (!schedule) {
      throw new NotFoundException('Échéancier introuvable.');
    }
    await this.requirePayableInvoiceId(club, user, schedule.invoiceId);
    return this.schedules.startSetup(club.id, schedule.id);
  }
}

/**
 * Borne la saisie du portail. Le service refuse déjà les découpages dont le
 * montant par échéance est trop faible ; ici on borne le NOMBRE d'échéances,
 * qui n'a de sens que de 2 (sinon ce n'est pas un échéancier) à 12 (une
 * saison).
 */
function assertInstallmentCountInRange(count: number): void {
  if (!Number.isInteger(count)) {
    throw new BadRequestException(
      'Le nombre d’échéances doit être un nombre entier.',
    );
  }
  if (count < MIN_INSTALLMENTS) {
    throw new BadRequestException(
      `Un échéancier doit comporter au moins ${MIN_INSTALLMENTS} échéances. Pour un paiement comptant, réglez la facture en une fois.`,
    );
  }
  if (count > MAX_INSTALLMENTS) {
    throw new BadRequestException(
      `Un échéancier ne peut pas dépasser ${MAX_INSTALLMENTS} échéances.`,
    );
  }
}

/** Projection Prisma → GraphQL (les champs Stripe restent internes). */
function toPaymentScheduleGraph(schedule: {
  id: string;
  invoiceId: string;
  method: PaymentScheduleGraph['method'];
  status: PaymentScheduleGraph['status'];
  totalCents: number;
  installmentCount: number;
  installments: {
    id: string;
    seq: number;
    dueOn: Date;
    amountCents: number;
    status: PaymentScheduleGraph['installments'][number]['status'];
  }[];
}): PaymentScheduleGraph {
  return {
    id: schedule.id,
    invoiceId: schedule.invoiceId,
    method: schedule.method,
    status: schedule.status,
    totalCents: schedule.totalCents,
    installmentCount: schedule.installmentCount,
    installments: schedule.installments.map((i) => ({
      id: i.id,
      seq: i.seq,
      dueOn: i.dueOn,
      amountCents: i.amountCents,
      status: i.status,
    })),
  };
}
