import {
  PaymentScheduleInstallmentStatus as S,
  PaymentScheduleStatus,
} from '@prisma/client';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';

/**
 * Un règlement hors échéancier (crédit, espèces) paie les échéances les plus
 * anciennes. Vu en prod le 2026-10-08 : des familles ont réglé octobre en
 * avance ; sans cette règle, la carte les aurait redébitées d'octobre et
 * c'est août qui aurait sauté.
 *
 * Le double applique les clauses de la requête (facture, statuts à prélever,
 * mise à jour conditionnelle sur le statut) : un double qui les ignorerait
 * laisserait le service les oublier.
 */
type Inst = { id: string; seq: number; amountCents: number; status: S; paymentId: string | null };

function world(opts: { scheduleStatus?: PaymentScheduleStatus; installments: Inst[] }) {
  const rows = opts.installments.map((i) => ({ ...i }));
  const debitable: S[] = [S.SCHEDULED, S.FAILED_RETRYABLE, S.REQUIRES_ACTION];
  const prisma = {
    paymentSchedule: {
      findUnique: jest.fn(async ({ where }: { where: { invoiceId: string } }) =>
        where.invoiceId === 'inv-suite'
          ? {
              id: 'sched-1',
              status: opts.scheduleStatus ?? PaymentScheduleStatus.PENDING_SETUP,
              installments: rows
                .filter((r) => debitable.includes(r.status))
                .sort((a, b) => a.seq - b.seq)
                .map((r) => ({ ...r })),
            }
          : null,
      ),
    },
    paymentScheduleInstallment: {
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; status: S }; data: { status: S; paymentId: string | null } }) => {
          const row = rows.find((r) => r.id === where.id && r.status === where.status);
          if (!row) return { count: 0 };
          row.status = data.status;
          row.paymentId = data.paymentId;
          return { count: 1 };
        },
      ),
    },
  };
  const engine = new PaymentScheduleEngineService(prisma as never, {} as never, {} as never);
  return { engine, rows };
}

const inst = (seq: number, status: S = S.SCHEDULED): Inst => ({
  id: `i${seq}`,
  seq,
  amountCents: 3000,
  status,
  paymentId: null,
});

describe('PaymentScheduleEngineService.settleEarliestInstallments', () => {
  it('une avance d’un mois paie octobre, pas août', async () => {
    const { engine, rows } = world({ installments: [1, 2, 3].map((s) => inst(s)) });

    const n = await engine.settleEarliestInstallments('inv-suite', 'pay-avance', 3000);

    expect(n).toBe(1);
    expect(rows.map((r) => r.status)).toEqual([S.PAID, S.SCHEDULED, S.SCHEDULED]);
    expect(rows[0]!.paymentId).toBe('pay-avance');
  });

  it('deux mois réglés d’un coup : les deux premières, reliées une seule fois', async () => {
    const { engine, rows } = world({ installments: [1, 2, 3].map((s) => inst(s)) });

    expect(await engine.settleEarliestInstallments('inv-suite', 'pay-2', 6500)).toBe(2);
    expect(rows.map((r) => r.status)).toEqual([S.PAID, S.PAID, S.SCHEDULED]);
    expect(rows.map((r) => r.paymentId)).toEqual(['pay-2', null, null]);
  });

  it('un acompte qui ne couvre pas une échéance entière n’en solde aucune', async () => {
    const { engine, rows } = world({ installments: [1, 2].map((s) => inst(s)) });

    expect(await engine.settleEarliestInstallments('inv-suite', 'pay-p', 2000)).toBe(0);
    expect(rows.every((r) => r.status === S.SCHEDULED)).toBe(true);
  });

  it('saute ce qui est déjà payé ou en cours de prélèvement', async () => {
    const { engine, rows } = world({
      scheduleStatus: PaymentScheduleStatus.ACTIVE,
      installments: [inst(1, S.PAID), inst(2, S.PROCESSING), inst(3), inst(4)],
    });

    expect(await engine.settleEarliestInstallments('inv-suite', 'pay-x', 3000)).toBe(1);
    expect(rows.map((r) => r.status)).toEqual([S.PAID, S.PROCESSING, S.PAID, S.SCHEDULED]);
  });

  it('rien sur un échéancier terminé, ni sur une facture sans échéancier', async () => {
    const done = world({
      scheduleStatus: PaymentScheduleStatus.COMPLETED,
      installments: [inst(1)],
    });
    expect(await done.engine.settleEarliestInstallments('inv-suite', 'p', 3000)).toBe(0);
    expect(await done.engine.settleEarliestInstallments('autre-facture', 'p', 3000)).toBe(0);
    expect(done.rows[0]!.status).toBe(S.SCHEDULED);
  });
});
