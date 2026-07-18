import { Test, TestingModule } from '@nestjs/testing';
import { PaymentScheduleInstallmentStatus as St } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleNotifierService } from './payment-schedule-notifier.service';

/**
 * Politique d'échec de l'ADR-0009 : tentative initiale, puis J+3, puis J+7,
 * puis échec définitif.
 *
 * Testée ici de façon déterministe plutôt qu'en bout de chaîne : un test
 * end-to-end n'exerce qu'UNE tentative, alors que le risque porte justement
 * sur l'enchaînement des trois et sur ce qui se passe après la dernière.
 */
describe('Échéancier / politique d’échec', () => {
  const DAY = 86_400_000;
  const NOW = new Date('2026-07-18T10:00:00.000Z');

  let engine: PaymentScheduleEngineService;
  let prisma: {
    paymentScheduleInstallment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    paymentSchedule: { update: jest.Mock };
    payment: { findFirst: jest.Mock };
  };
  let notifier: {
    notifyInstallmentFailed: jest.Mock;
    notifyTreasurerFinalFailure: jest.Mock;
    notifyRequiresAction: jest.Mock;
  };

  /** Échéance rattachée au compte connecté `acct_ok`. */
  const installment = (attemptCount: number, status: St = St.PROCESSING) => ({
    id: 'inst-1',
    clubId: 'club-1',
    attemptCount,
    status,
    stripePaymentIntentId: 'pi_1',
    schedule: { stripeAccountId: 'acct_ok' },
  });

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = {
      paymentScheduleInstallment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ scheduleId: 'sch-1' }),
        count: jest.fn().mockResolvedValue(1),
      },
      paymentSchedule: { update: jest.fn().mockResolvedValue({}) },
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    notifier = {
      notifyInstallmentFailed: jest.fn().mockResolvedValue(undefined),
      notifyTreasurerFinalFailure: jest.fn().mockResolvedValue(undefined),
      notifyRequiresAction: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentScheduleEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchedulerLockService, useValue: { withLock: jest.fn() } },
        { provide: PaymentScheduleNotifierService, useValue: notifier },
      ],
    }).compile();
    engine = moduleRef.get(PaymentScheduleEngineService);
  });

  afterEach(() => jest.useRealTimers());

  const fail = () =>
    engine.applyAsyncFailure({
      paymentIntentId: 'pi_1',
      stripeAccountId: 'acct_ok',
      code: 'card_declined',
      message: 'Carte refusée',
    });

  it('1re tentative échouée : reprise programmée à J+3', async () => {
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(1),
    );
    await fail();

    const data = prisma.paymentScheduleInstallment.update.mock.calls[0]![0].data;
    expect(data.status).toBe(St.FAILED_RETRYABLE);
    expect(data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 3 * DAY));
    expect(data.lastFailureCode).toBe('card_declined');
    expect(notifier.notifyInstallmentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ definitive: false }),
    );
    // Le club n'est pas dérangé tant qu'une reprise est prévue.
    expect(notifier.notifyTreasurerFinalFailure).not.toHaveBeenCalled();
  });

  it('2e tentative échouée : reprise programmée à J+7', async () => {
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(2),
    );
    await fail();

    const data = prisma.paymentScheduleInstallment.update.mock.calls[0]![0].data;
    expect(data.status).toBe(St.FAILED_RETRYABLE);
    expect(data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
  });

  it('3e tentative échouée : échec définitif, plus de reprise, club alerté', async () => {
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(3),
    );
    await fail();

    const data = prisma.paymentScheduleInstallment.update.mock.calls[0]![0].data;
    expect(data.status).toBe(St.FAILED_FINAL);
    expect(data.nextAttemptAt).toBeNull();
    expect(notifier.notifyInstallmentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ definitive: true, nextAttemptAt: null }),
    );
    // C'est le moment où l'automatisme s'arrête : un humain doit reprendre.
    expect(notifier.notifyTreasurerFinalFailure).toHaveBeenCalledWith('inst-1');
  });

  it('ignore un échec tardif sur une échéance déjà encaissée', async () => {
    // Sinon un webhook en retard rouvrirait une échéance payée.
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(1, St.PAID),
    );
    await fail();
    expect(prisma.paymentScheduleInstallment.update).not.toHaveBeenCalled();
    expect(notifier.notifyInstallmentFailed).not.toHaveBeenCalled();
  });

  it('ignore un échec provenant d’un autre compte connecté', async () => {
    // Garde-fou multi-tenant : un club ne peut pas influencer l'échéancier
    // d'un autre en rejouant un événement.
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(1),
    );
    await engine.applyAsyncFailure({
      paymentIntentId: 'pi_1',
      stripeAccountId: 'acct_intrus',
      code: 'card_declined',
      message: 'Carte refusée',
    });
    expect(prisma.paymentScheduleInstallment.update).not.toHaveBeenCalled();
  });

  it('3-D Secure : sort de PROCESSING et sollicite l’adhérent', async () => {
    prisma.paymentScheduleInstallment.findFirst.mockResolvedValue(
      installment(1),
    );
    await engine.applyRequiresAction('pi_1', 'acct_ok');

    expect(prisma.paymentScheduleInstallment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: St.REQUIRES_ACTION },
      }),
    );
    expect(notifier.notifyRequiresAction).toHaveBeenCalledWith('inst-1');
  });
});
