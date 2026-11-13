import {
  PaymentScheduleInstallmentStatus as S,
  PaymentScheduleStatus,
} from '@prisma/client';
import { summarizeSchedule } from './payment-schedule-admin-view';

/**
 * Vue admin d'un échéancier : ce que le trésorier lit pour une famille qui
 * paie au mois (cas réel : adhésion de septembre, suite octobre → août,
 * octobre réglé par une avance, novembre dû le 10).
 */

function inst(seq: number, dueOn: string, status: S = S.SCHEDULED) {
  return {
    id: `i${seq}`,
    seq,
    dueOn: new Date(`${dueOn}T00:00:00.000Z`),
    amountCents: 2500,
    status,
  };
}

const NOV_13 = { year: 2026, month: 10, day: 13 };

describe('summarizeSchedule', () => {
  it('novembre non payé au 13 est en retard ; décembre est la prochaine échéance', () => {
    const s = summarizeSchedule(
      {
        status: PaymentScheduleStatus.PENDING_SETUP,
        installments: [
          inst(3, '2026-12-10'),
          inst(1, '2026-10-08', S.PAID),
          inst(2, '2026-11-10'),
        ],
      },
      NOV_13,
    );

    expect(s.installments.map((i) => i.seq)).toEqual([1, 2, 3]);
    expect(s.installments.map((i) => i.overdue)).toEqual([false, true, false]);
    expect(s.paidCount).toBe(1);
    expect(s.paidCents).toBe(2500);
    expect(s.remainingCents).toBe(5000);
    expect(s.overdueCount).toBe(1);
    expect(s.overdueCents).toBe(2500);
    expect(s.nextDueOn?.toISOString().slice(0, 10)).toBe('2026-12-10');
    expect(s.nextDueCents).toBe(2500);
  });

  it('une échéance exigible aujourd’hui n’est pas encore en retard', () => {
    const s = summarizeSchedule(
      {
        status: PaymentScheduleStatus.ACTIVE,
        installments: [inst(1, '2026-11-13')],
      },
      NOV_13,
    );
    expect(s.installments[0].overdue).toBe(false);
    expect(s.nextDueOn?.toISOString().slice(0, 10)).toBe('2026-11-13');
  });

  it('une échéance en cours de prélèvement n’est pas en retard, mais reste due', () => {
    const s = summarizeSchedule(
      {
        status: PaymentScheduleStatus.ACTIVE,
        installments: [inst(1, '2026-11-10', S.PROCESSING)],
      },
      NOV_13,
    );
    expect(s.installments[0].overdue).toBe(false);
    expect(s.installments[0].settleableByPayment).toBe(false);
    expect(s.remainingCents).toBe(2500);
  });

  it('un échec définitif passé est en retard, et un règlement au club ne le solde pas', () => {
    // Même règle que settleEarliestInstallments : FAILED_FINAL n'est pas prise.
    const s = summarizeSchedule(
      {
        status: PaymentScheduleStatus.ACTIVE,
        installments: [inst(1, '2026-10-10', S.FAILED_FINAL), inst(2, '2026-11-10')],
      },
      NOV_13,
    );
    expect(s.installments.map((i) => i.overdue)).toEqual([true, true]);
    expect(s.installments.map((i) => i.settleableByPayment)).toEqual([false, true]);
  });

  it('annulées et payées ne sont ni dues ni en retard', () => {
    const s = summarizeSchedule(
      {
        status: PaymentScheduleStatus.CANCELLED,
        installments: [inst(1, '2026-09-10', S.PAID), inst(2, '2026-10-10', S.CANCELLED)],
      },
      NOV_13,
    );
    expect(s.remainingCents).toBe(0);
    expect(s.overdueCount).toBe(0);
    expect(s.nextDueOn).toBeNull();
    expect(s.nextDueCents).toBeNull();
  });

  it('un échéancier clos ne laisse rien solder par un règlement au club', () => {
    for (const status of [
      PaymentScheduleStatus.CANCELLED,
      PaymentScheduleStatus.COMPLETED,
    ]) {
      const s = summarizeSchedule(
        { status, installments: [inst(1, '2026-12-10')] },
        NOV_13,
      );
      expect(s.installments[0].settleableByPayment).toBe(false);
    }
    const open = summarizeSchedule(
      {
        status: PaymentScheduleStatus.PENDING_SETUP,
        installments: [inst(1, '2026-12-10')],
      },
      NOV_13,
    );
    expect(open.installments[0].settleableByPayment).toBe(true);
  });
});
