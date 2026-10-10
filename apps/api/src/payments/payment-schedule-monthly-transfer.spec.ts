import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import {
  PaymentScheduleInstallmentStatus as S,
  PaymentScheduleMethod as M,
  PaymentScheduleStatus as St,
} from '@prisma/client';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleResolver } from './payment-schedule.resolver';
import { PaymentScheduleService } from './payment-schedule.service';

/**
 * Virement mensuel : la famille règle chaque échéance elle-même. Le moteur ne
 * doit plus rien prélever, et une carte enregistrée ensuite doit le relancer.
 */
type Sched = { id: string; clubId: string; method: M; status: St; stripeAccountId: string | null };

function service(sched: Sched) {
  const row = { ...sched };
  const prisma = {
    paymentSchedule: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; clubId: string } }) =>
        where.id === row.id && where.clubId === row.clubId ? { ...row } : null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === row.id ? { ...row } : null,
      ),
      update: jest.fn(async ({ data }: { data: Partial<Sched> }) => {
        Object.assign(row, data);
        return { ...row, installments: [] };
      }),
    },
    club: { findUnique: jest.fn(async () => ({ name: 'SKSR' })) },
    clubFinancialAccount: {
      findFirst: jest.fn(async ({ where }: { where: { clubId: string; kind: string; isActive: boolean } }) =>
        where.clubId === 'club-1' && where.kind === 'BANK' && where.isActive
          ? { iban: 'FR7612345000010000000000123', bic: 'BFCORERXXXX' }
          : null,
      ),
    },
  };
  const svc = new PaymentScheduleService(prisma as never, {} as never, {} as never);
  return { svc, row };
}

const base: Sched = {
  id: 'sched-1',
  clubId: 'club-1',
  method: M.CARD,
  status: St.PENDING_SETUP,
  stripeAccountId: null,
};

describe('Virement mensuel — choix et retour à la carte', () => {
  it('le choix du virement rend l’échéancier actif, sans carte', async () => {
    const { svc, row } = service(base);

    await svc.chooseMonthlyTransfer('club-1', 'sched-1');

    expect(row).toMatchObject({ method: M.MANUAL_TRANSFER, status: St.ACTIVE });
  });

  it('refusé pour l’échéancier d’un autre club, ou terminé, ou sous mandat SEPA', async () => {
    await expect(service(base).svc.chooseMonthlyTransfer('autre', 'sched-1')).rejects.toThrow();
    await expect(
      service({ ...base, status: St.COMPLETED }).svc.chooseMonthlyTransfer('club-1', 'sched-1'),
    ).rejects.toThrow();
    await expect(
      service({ ...base, method: M.SEPA_DEBIT, status: St.ACTIVE }).svc.chooseMonthlyTransfer(
        'club-1',
        'sched-1',
      ),
    ).rejects.toThrow();
  });

  it('une carte enregistrée ensuite repasse l’échéancier en carte', async () => {
    const { svc, row } = service({ ...base, method: M.MANUAL_TRANSFER, status: St.ACTIVE });

    await svc.applySetupCompleted({
      scheduleId: 'sched-1',
      stripeAccountId: 'acct_1',
      paymentMethodId: 'pm_1',
    });

    // Sans ce retour à CARD, le moteur continuerait d'ignorer l'échéancier.
    expect(row).toMatchObject({ method: M.CARD, status: St.ACTIVE });
  });

  it('un échéancier ne se crée pas directement en virement', async () => {
    const { svc } = service(base);
    await expect(
      svc.createForInvoice({
        clubId: 'club-1',
        invoiceId: 'inv-1',
        method: M.MANUAL_TRANSFER,
        installmentCount: 3,
      }),
    ).rejects.toThrow('Le virement mensuel se choisit sur un échéancier existant.');
  });

  it('coordonnées : le compte bancaire du club et une référence courte', async () => {
    const { svc } = service(base);

    expect(await svc.transferInstructions('club-1', '6c427327-aaaa-bbbb')).toEqual({
      beneficiary: 'SKSR',
      iban: 'FR7612345000010000000000123',
      bic: 'BFCORERXXXX',
      reference: 'COTIS-6C427327',
    });
  });
});

describe('Virement mensuel — le moteur ne prélève pas', () => {
  it('runDue exclut les échéanciers en virement', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      paymentScheduleInstallment: { findMany },
    };
    const engine = new PaymentScheduleEngineService(prisma as never, {} as never, {} as never);
    jest
      .spyOn(engine as unknown as { reconcileStuckProcessing: () => Promise<void> }, 'reconcileStuckProcessing')
      .mockResolvedValue(undefined);

    await engine.runDue({ now: new Date('2026-10-10T08:00:00Z') });

    const where = findMany.mock.calls[0]![0].where;
    expect(where.schedule).toEqual({
      status: St.ACTIVE,
      method: { not: M.MANUAL_TRANSFER },
    });
  });
});

describe('Virement mensuel — schéma GraphQL', () => {
  it('expose le choix, les coordonnées et la méthode', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const sdl = printSchema(
      await moduleRef.get(GraphQLSchemaFactory).create([PaymentScheduleResolver]),
    );
    expect(sdl).toContain('viewerChooseMonthlyTransfer(scheduleId: String!): PaymentScheduleGraph!');
    expect(sdl).toContain('transfer: MonthlyTransferInstructionsGraph');
    expect(sdl).toMatch(/enum PaymentScheduleMethod \{[^}]*MANUAL_TRANSFER/);
  });
});
