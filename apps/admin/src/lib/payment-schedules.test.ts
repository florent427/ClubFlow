import { describe, expect, it } from 'vitest';
import {
  firstSettleableInstallment,
  installmentMonthLabel,
  previewSettlement,
  scheduleStatusLabel,
  type AdminPaymentSchedule,
  type AdminPaymentScheduleInstallment,
} from './payment-schedules';

function inst(
  seq: number,
  dueOn: string,
  over: Partial<AdminPaymentScheduleInstallment> = {},
): AdminPaymentScheduleInstallment {
  return {
    id: `i${seq}`,
    seq,
    dueOn: `${dueOn}T00:00:00.000Z`,
    amountCents: 2500,
    status: 'SCHEDULED',
    overdue: false,
    settleableByPayment: true,
    ...over,
  };
}

/** Cas réel : octobre réglé par l'avance, novembre et la suite à payer. */
function schedule(
  installments: AdminPaymentScheduleInstallment[],
): AdminPaymentSchedule {
  return {
    id: 's1',
    invoiceId: 'inv-1',
    invoiceLabel: 'Cotisation mensuelle — octobre 2026 à août 2027',
    invoiceStatus: 'OPEN',
    payerLabel: 'Famille RIVIERE',
    method: 'CARD',
    status: 'PENDING_SETUP',
    totalCents: 7500,
    installmentCount: installments.length,
    paidCount: 0,
    paidCents: 0,
    remainingCents: 0,
    overdueCount: 0,
    overdueCents: 0,
    nextDueOn: null,
    nextDueCents: null,
    createdAt: '2026-10-08T00:00:00.000Z',
    installments,
  };
}

const RIVIERE = schedule([
  inst(1, '2026-10-08', { status: 'PAID', settleableByPayment: false }),
  inst(2, '2026-11-10', { overdue: true }),
  inst(3, '2026-12-10'),
]);

describe('installmentMonthLabel', () => {
  it('lit le mois sans décalage de fuseau (date à minuit UTC)', () => {
    expect(installmentMonthLabel('2026-11-01T00:00:00.000Z')).toBe(
      'novembre 2026',
    );
  });
});

describe('previewSettlement', () => {
  it('25 € au club règlent novembre, pas août', () => {
    expect(previewSettlement(RIVIERE, 2500, 5000)).toEqual({
      kind: 'months',
      months: ['novembre 2026'],
      leftoverCents: 0,
    });
  });

  it('un acompte qui ne couvre pas une mensualité entière n’en règle aucune', () => {
    expect(previewSettlement(RIVIERE, 2000, 5000)).toEqual({ kind: 'partial' });
  });

  it('un surplus inférieur à une mensualité est signalé', () => {
    const three = schedule([
      inst(1, '2026-11-10'),
      inst(2, '2026-12-10'),
      inst(3, '2027-01-10'),
    ]);
    expect(previewSettlement(three, 6000, 7500)).toEqual({
      kind: 'months',
      months: ['novembre 2026', 'décembre 2026'],
      leftoverCents: 1000,
    });
  });

  it('saute une échéance non soldable sans s’arrêter, comme le moteur', () => {
    // settleEarliestInstallments ne charge que les échéances soldables : un
    // échec définitif est ignoré, la suivante est prise.
    const s = schedule([
      inst(1, '2026-10-10', {
        status: 'FAILED_FINAL',
        settleableByPayment: false,
      }),
      inst(2, '2026-11-10'),
    ]);
    expect(previewSettlement(s, 2500, 5000)).toEqual({
      kind: 'months',
      months: ['novembre 2026'],
      leftoverCents: 0,
    });
  });

  it('le reste dû entier solde la facture et termine l’échéancier', () => {
    expect(previewSettlement(RIVIERE, 5000, 5000)).toEqual({ kind: 'closes' });
  });

  it('rien à annoncer sans échéancier ou sans montant', () => {
    expect(previewSettlement(null, 2500, 5000)).toEqual({ kind: 'none' });
    expect(previewSettlement(RIVIERE, 0, 5000)).toEqual({ kind: 'none' });
  });
});

describe('firstSettleableInstallment', () => {
  it('donne la mensualité que le prochain règlement paiera', () => {
    expect(firstSettleableInstallment(RIVIERE)?.seq).toBe(2);
    expect(firstSettleableInstallment(null)).toBeNull();
  });
});

describe('scheduleStatusLabel', () => {
  it('dit que rien n’est prélevé tant que la carte manque', () => {
    expect(scheduleStatusLabel('PENDING_SETUP', 'CARD')).toBe(
      'Carte non enregistrée — rien n’est prélevé',
    );
  });
});
