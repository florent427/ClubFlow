import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import {
  InvoiceStatus,
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
  type Club,
} from '@prisma/client';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import type { PrismaService } from '../prisma/prisma.service';
import { PaymentScheduleAdminQueryResolver } from './payment-schedule-admin-query.resolver';

const CLUB = { id: 'club-1' } as Club;

function scheduleRow(clubId: string, invoiceId: string) {
  return {
    id: `s-${invoiceId}`,
    clubId,
    invoiceId,
    method: PaymentScheduleMethod.CARD,
    status: PaymentScheduleStatus.PENDING_SETUP,
    totalCents: 5000,
    installmentCount: 2,
    createdAt: new Date('2026-10-08T00:00:00.000Z'),
    installments: [
      {
        id: 'i1',
        seq: 1,
        dueOn: new Date('2000-01-10T00:00:00.000Z'),
        amountCents: 2500,
        status: PaymentScheduleInstallmentStatus.PAID,
      },
      {
        id: 'i2',
        seq: 2,
        dueOn: new Date('2999-02-10T00:00:00.000Z'),
        amountCents: 2500,
        status: PaymentScheduleInstallmentStatus.SCHEDULED,
      },
    ],
    invoice: {
      label: 'Cotisation mensuelle — octobre 2026 à août 2027',
      status: InvoiceStatus.OPEN,
      householdGroup: null,
      family: {
        label: null,
        familyMembers: [
          { member: { lastName: 'RIVIERE', firstName: 'V' }, contact: null },
        ],
      },
    },
  };
}

/**
 * Double écrit EN FACE de la requête : il applique lui-même chaque clause du
 * `where` (club ET facture). S'il ignorait `clubId`, le résolveur pourrait
 * l'oublier et un admin lirait l'échéancier d'un autre club.
 */
function makeResolver() {
  const rows = [scheduleRow('club-1', 'inv-1'), scheduleRow('club-2', 'inv-2')];
  const match = (where: { clubId?: string; invoiceId?: string }) =>
    rows.filter(
      (r) =>
        (where.clubId === undefined || r.clubId === where.clubId) &&
        (where.invoiceId === undefined || r.invoiceId === where.invoiceId),
    );
  const prisma = {
    paymentSchedule: {
      findMany: jest.fn(async ({ where }) => match(where)),
      findFirst: jest.fn(async ({ where }) => match(where)[0] ?? null),
    },
  };
  const resolver = new PaymentScheduleAdminQueryResolver(
    prisma as unknown as PrismaService,
  );
  return { resolver, prisma };
}

describe('PaymentScheduleAdminQueryResolver', () => {
  it('liste uniquement les échéanciers du club courant', async () => {
    const { resolver, prisma } = makeResolver();
    const list = await resolver.clubPaymentSchedules(CLUB);

    expect(list.map((s) => s.invoiceId)).toEqual(['inv-1']);
    expect(prisma.paymentSchedule.findMany.mock.calls[0][0].where).toEqual({
      clubId: 'club-1',
    });
  });

  it('ne livre pas l’échéancier d’une facture d’un autre club', async () => {
    const { resolver } = makeResolver();
    expect(await resolver.clubInvoicePaymentSchedule(CLUB, 'inv-2')).toBeNull();
    expect(
      (await resolver.clubInvoicePaymentSchedule(CLUB, 'inv-1'))?.id,
    ).toBe('s-inv-1');
  });

  it('résume l’échéancier et nomme la famille', async () => {
    const { resolver } = makeResolver();
    const s = await resolver.clubInvoicePaymentSchedule(CLUB, 'inv-1');

    expect(s).toMatchObject({
      payerLabel: 'Famille RIVIERE',
      invoiceStatus: InvoiceStatus.OPEN,
      paidCount: 1,
      paidCents: 2500,
      remainingCents: 2500,
      overdueCount: 0,
      nextDueCents: 2500,
    });
    expect(s?.installments.map((i) => i.settleableByPayment)).toEqual([
      false,
      true,
    ]);
  });
});

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Échéanciers admin — schéma GraphQL', () => {
  it('expose la liste et l’échéancier d’une facture', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(
      await factory.create([PaymentScheduleAdminQueryResolver]),
    );

    expect(sdl).toContain('clubPaymentSchedules: [AdminPaymentScheduleGraph!]!');
    expect(sdl).toContain(
      'clubInvoicePaymentSchedule(invoiceId: ID!): AdminPaymentScheduleGraph',
    );
    expect(sdl).toContain('payerLabel: String');
    expect(sdl).toContain('nextDueOn: DateTime');
    expect(sdl).toContain('settleableByPayment: Boolean!');
    expect(sdl).toContain('invoiceStatus: InvoiceStatus!');
  });
});
