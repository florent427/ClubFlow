import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { Club, Prisma } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULING_TIMEZONE } from '../scheduling/scheduling.constants';
import { AdminPaymentScheduleGraph } from './models/payment-schedule-admin.model';
import { dateInZone } from './monthly-continuation-plan';
import { summarizeSchedule } from './payment-schedule-admin-view';
import { deriveFamilyLabel } from './payments.service';

const scheduleInclude = {
  installments: { orderBy: { seq: 'asc' } },
  invoice: {
    select: {
      label: true,
      status: true,
      householdGroup: { select: { label: true } },
      family: {
        select: {
          label: true,
          familyMembers: {
            include: {
              member: { select: { lastName: true, firstName: true } },
              contact: { select: { lastName: true, firstName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentScheduleInclude;

type ScheduleRow = Prisma.PaymentScheduleGetPayload<{
  include: typeof scheduleInclude;
}>;

/**
 * Échéanciers — lecture BACK-OFFICE.
 *
 * Sans cette vue, le trésorier ne voyait qu'une facture « octobre à août »
 * avec un gros reste dû : rien ne disait que la famille paie au mois, quels
 * mois sont réglés, lesquels sont en retard, ni si la carte est enregistrée.
 *
 * Lecture seule. Toujours scopée au club courant : l'identifiant d'une
 * facture ne prouve aucun droit sur elle.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class PaymentScheduleAdminQueryResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [AdminPaymentScheduleGraph], {
    name: 'clubPaymentSchedules',
    description:
      'Échéanciers du club, du plus récent au plus ancien, avec l’état de chaque échéance.',
  })
  async clubPaymentSchedules(
    @CurrentClub() club: Club,
  ): Promise<AdminPaymentScheduleGraph[]> {
    const rows = await this.prisma.paymentSchedule.findMany({
      where: { clubId: club.id },
      include: scheduleInclude,
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((r) => toGraph(r, now));
  }

  @Query(() => AdminPaymentScheduleGraph, {
    name: 'clubInvoicePaymentSchedule',
    nullable: true,
    description: 'Échéancier de la facture, ou null si elle n’en a pas.',
  })
  async clubInvoicePaymentSchedule(
    @CurrentClub() club: Club,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<AdminPaymentScheduleGraph | null> {
    const row = await this.prisma.paymentSchedule.findFirst({
      where: { invoiceId, clubId: club.id },
      include: scheduleInclude,
    });
    return row ? toGraph(row, new Date()) : null;
  }
}

function toGraph(row: ScheduleRow, now: Date): AdminPaymentScheduleGraph {
  const summary = summarizeSchedule(
    row,
    dateInZone(now, SCHEDULING_TIMEZONE),
  );
  const { invoice } = row;
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceLabel: invoice.label,
    invoiceStatus: invoice.status,
    payerLabel:
      invoice.householdGroup?.label ??
      invoice.family?.label ??
      deriveFamilyLabel(invoice.family) ??
      null,
    method: row.method,
    status: row.status,
    totalCents: row.totalCents,
    installmentCount: row.installmentCount,
    createdAt: row.createdAt,
    ...summary,
    installments: summary.installments.map((i) => ({
      id: i.id,
      seq: i.seq,
      dueOn: i.dueOn,
      amountCents: i.amountCents,
      status: i.status,
      overdue: i.overdue,
      settleableByPayment: i.settleableByPayment,
    })),
  };
}
