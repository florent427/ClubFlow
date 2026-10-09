import {
  InvoicePurpose,
  InvoiceStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
} from '@prisma/client';
import { MonthlyContinuationService } from './monthly-continuation.service';

/**
 * Le service sur un double de Prisma. Le double filtre `findFirst` sur l'id ET
 * le club, comme la requête : un double qui ignorerait le club laisserait le
 * service l'oublier (pitfall double-ignore-une-clause-du-where).
 */

const CLUB = 'club-sksr';
const NOW = new Date('2026-10-08T06:00:00Z'); // 8 octobre, 10h à La Réunion

type Line = {
  memberId: string;
  membershipProductId: string | null;
  dynamicGroupId: string | null;
  baseAmountCents: number;
  adjustments: Array<{ amountCents: number }>;
};

function adhesion(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-adhesion',
    clubId: CLUB,
    familyId: 'fam-1',
    householdGroupId: null,
    clubSeasonId: 'season-26',
    label: 'Adhésion 2026-2027 — Christelle CALIAMA',
    status: InvoiceStatus.PAID,
    purpose: InvoicePurpose.CHARGE,
    isCreditNote: false,
    monthlyContinuationOfId: null,
    createdAt: new Date('2026-08-24T08:00:00Z'),
    clubSeason: {
      startsOn: new Date('2026-09-01T00:00:00Z'),
      endsOn: new Date('2027-08-31T00:00:00Z'),
    },
    monthlyContinuation: null,
    creditNotes: [],
    lines: [
      {
        memberId: 'm-christelle',
        membershipProductId: 'p-enfant',
        dynamicGroupId: null,
        baseAmountCents: 3000,
        adjustments: [],
      },
      {
        memberId: 'm-frere',
        membershipProductId: 'p-enfant',
        dynamicGroupId: 'g-1',
        baseAmountCents: 3000,
        // Remise exceptionnelle sur la mensualité : elle vaut chaque mois.
        adjustments: [{ amountCents: -500 }],
      },
    ] as Line[],
    ...over,
  };
}

function world(invoices: Array<ReturnType<typeof adhesion>>) {
  const created = {
    invoices: [] as Array<Record<string, unknown>>,
    schedules: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    invoice: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `inv-suite-${created.invoices.length + 1}`, ...data };
        created.invoices.push(row);
        return row;
      }),
    },
    paymentSchedule: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sched-${created.schedules.length + 1}`, ...data };
        created.schedules.push(row);
        return row;
      }),
    },
  };
  const prisma = {
    invoice: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; clubId: string } }) =>
          invoices.find((i) => i.id === where.id && i.clubId === where.clubId) ??
          null,
      ),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new MonthlyContinuationService(prisma as never, {} as never);
  return { service, created };
}

describe('MonthlyContinuationService.createFor — la suite d’une adhésion mensuelle', () => {
  it('facture octobre → août : 11 mensualités, remises comprises', async () => {
    const { service, created } = world([adhesion()]);

    const outcome = await service.createFor(CLUB, 'inv-adhesion', { now: NOW });

    expect(outcome).toMatchObject({ kind: 'created', active: false });
    const [invoice] = created.invoices;
    // 30 € + 25 € par mois, sur 11 mois.
    expect(invoice).toMatchObject({
      clubId: CLUB,
      familyId: 'fam-1',
      clubSeasonId: 'season-26',
      status: InvoiceStatus.OPEN,
      amountCents: 5500 * 11,
      baseAmountCents: 5500 * 11,
      installmentsCount: 11,
      monthlyContinuationOfId: 'inv-adhesion',
      label:
        'Cotisation mensuelle — octobre 2026 à août 2027 — Christelle CALIAMA',
    });
    const lines = (invoice!.lines as { create: Array<Record<string, unknown>> })
      .create;
    expect(lines.map((l) => [l.memberId, l.baseAmountCents])).toEqual([
      ['m-christelle', 3000 * 11],
      ['m-frere', 2500 * 11],
    ]);
  });

  it('sans carte : échéancier carte en attente, octobre dû aussitôt, la suite le 10', async () => {
    const { service, created } = world([adhesion()]);

    await service.createFor(CLUB, 'inv-adhesion', { now: NOW });

    const [schedule] = created.schedules;
    expect(schedule).toMatchObject({
      method: PaymentScheduleMethod.CARD,
      status: PaymentScheduleStatus.PENDING_SETUP,
      totalCents: 5500 * 11,
      installmentCount: 11,
      stripePaymentMethodId: null,
    });
    const installments = (
      schedule!.installments as {
        create: Array<{ dueOn: Date; amountCents: number }>;
      }
    ).create;
    expect(installments[0]!.dueOn.toISOString().slice(0, 10)).toBe('2026-10-08');
    expect(installments[1]!.dueOn.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(installments[10]!.dueOn.toISOString().slice(0, 10)).toBe('2027-08-10');
    expect(installments.every((i) => i.amountCents === 5500)).toBe(true);
  });

  it('avec la carte de l’adhésion : échéancier prélevable tout de suite', async () => {
    const { service, created } = world([adhesion()]);

    const outcome = await service.createFor(CLUB, 'inv-adhesion', {
      now: NOW,
      card: {
        stripeAccountId: 'acct_sksr',
        customerId: 'cus_1',
        paymentMethodId: 'pm_1',
      },
    });

    expect(outcome).toMatchObject({ kind: 'created', active: true });
    expect(created.schedules[0]).toMatchObject({
      status: PaymentScheduleStatus.ACTIVE,
      stripeAccountId: 'acct_sksr',
      stripeCustomerId: 'cus_1',
      stripePaymentMethodId: 'pm_1',
    });
  });

  it('une adhésion qui a déjà sa suite n’en reçoit pas une seconde', async () => {
    const { service, created } = world([
      adhesion({ monthlyContinuation: { id: 'inv-suite-existante' } }),
    ]);

    const outcome = await service.createFor(CLUB, 'inv-adhesion', { now: NOW });

    expect(outcome).toEqual({ kind: 'existing', invoiceId: 'inv-suite-existante' });
    expect(created.invoices).toHaveLength(0);
  });

  it.each([
    ['pas encore payée', { status: InvoiceStatus.OPEN }],
    ['un avoir la corrige', { creditNotes: [{ id: 'avoir-1' }] }],
    ['elle est elle-même une suite', { monthlyContinuationOfId: 'autre' }],
    ['elle n’a que de l’annuel', { lines: [] }],
    ['c’est un avoir', { isCreditNote: true }],
    [
      'la saison se termine avec le mois payé',
      { createdAt: new Date('2027-08-02T08:00:00Z') },
    ],
    [
      // Trouvé en recette staging : juin, juillet et août 2026 seraient
      // tombés dus d'un coup, saison finie.
      'appartient à une saison terminée',
      {
        createdAt: new Date('2026-05-12T08:00:00Z'),
        clubSeason: {
          startsOn: new Date('2025-09-01T00:00:00Z'),
          endsOn: new Date('2026-08-31T00:00:00Z'),
        },
      },
    ],
  ])('rien quand l’adhésion %s', async (_why, over) => {
    const { service, created } = world([adhesion(over)]);

    const outcome = await service.createFor(CLUB, 'inv-adhesion', { now: NOW });

    expect(outcome.kind).toBe('none');
    expect(created.invoices).toHaveLength(0);
    expect(created.schedules).toHaveLength(0);
  });

  it('jamais pour la facture d’un autre club', async () => {
    const { service, created } = world([adhesion()]);

    const outcome = await service.createFor('autre-club', 'inv-adhesion', {
      now: NOW,
    });

    expect(outcome.kind).toBe('none');
    expect(created.invoices).toHaveLength(0);
  });
});

describe('MonthlyContinuationService.consentForCheckout', () => {
  it('annonce les mensualités sur la page de paiement d’une adhésion ouverte', async () => {
    const { service } = world([
      adhesion({
        status: InvoiceStatus.OPEN,
        createdAt: new Date('2026-10-08T05:00:00Z'),
      }),
    ]);

    const text = await service.consentForCheckout(CLUB, 'inv-adhesion', 'SKSR', NOW);

    expect(text).toContain('55,00 € le 10 de chaque mois de novembre 2026 à août 2027');
  });

  it('rien à annoncer pour une facture sans cotisation mensuelle', async () => {
    const { service } = world([
      adhesion({ status: InvoiceStatus.OPEN, lines: [] }),
    ]);

    expect(
      await service.consentForCheckout(CLUB, 'inv-adhesion', 'SKSR', NOW),
    ).toBeNull();
  });
});

describe('PaymentScheduleNotifierService.notifyMonthlyCardSetup', () => {
  // Import tardif : ce bloc seul a besoin du notifier.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PaymentScheduleNotifierService } = require('./payment-schedule-notifier.service');

  async function mailFor(
    statuses: string[],
    opts: { reminder?: boolean } = {},
  ): Promise<{ sent: boolean; mail?: { to: string; subject: string; text: string } }> {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T06:00:00Z'));
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const installments = ['2026-10-08', '2026-11-10', '2026-12-10'].map((d, i) => ({
      seq: i + 1,
      dueOn: new Date(`${d}T00:00:00Z`),
      amountCents: 3000,
      status: statuses[i],
    }));
    const prisma = {
      paymentSchedule: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'sched-1'
            ? {
                id: 'sched-1',
                clubId: CLUB,
                installments,
                invoice: {
                  id: 'inv-suite-1',
                  label: 'Cotisation mensuelle — octobre 2026 à décembre 2026',
                  club: { name: 'SKSR' },
                  family: {
                    familyMembers: [
                      { member: null, contact: { firstName: 'Aurore', user: { email: 'aurore@example.test' } } },
                    ],
                  },
                },
              }
            : null,
        ),
      },
    };
    const notifier = new PaymentScheduleNotifierService(
      prisma as never,
      { getVerifiedMailProfile: async () => ({ from: 'SKSR <noreply@sksr.re>' }) } as never,
      { sendEmail } as never,
    );
    try {
      const sent = await notifier.notifyMonthlyCardSetup('sched-1', opts);
      return { sent, mail: sendEmail.mock.calls[0]?.[0] };
    } finally {
      jest.useRealTimers();
    }
  }

  it('invite le payeur à enregistrer sa carte, avec le calendrier réel', async () => {
    const { sent, mail } = await mailFor(['SCHEDULED', 'SCHEDULED', 'SCHEDULED']);

    expect(sent).toBe(true);
    expect(mail!.to).toBe('aurore@example.test');
    expect(mail!.subject).toBe('Cotisation mensuelle : enregistrez votre carte — SKSR');
    expect(mail!.text).toContain('3 mensualités de 30,00 €');
    expect(mail!.text).toContain("30,00 € déjà dus seront débités dès l'enregistrement de la carte");
    expect(mail!.text).toContain('le 10 de chaque mois');
    // Le lien ouvre la facture dépliée, pas la liste repliée.
    expect(mail!.text).toContain('/facturation?facture=inv-suite-1');
    expect(mail!.text).not.toContain('Créditer mon compte');
  });

  it('relance : octobre réglé par une avance n’est plus annoncé comme dû', async () => {
    const { mail } = await mailFor(['PAID', 'SCHEDULED', 'SCHEDULED'], { reminder: true });

    expect(mail!.subject).toBe('Rappel — Cotisation mensuelle : enregistrez votre carte — SKSR');
    expect(mail!.text).toContain('2 mensualités de 30,00 €');
    expect(mail!.text).not.toContain('déjà dus');
    expect(mail!.text).toContain('le 10 de chaque mois');
    // L'erreur vue le 2026-10-08 : l'avance prise pour l'enregistrement.
    expect(mail!.text).toContain('« Créditer mon compte » ne remplace pas');
  });

  it('rien à envoyer quand tout est réglé', async () => {
    const { sent, mail } = await mailFor(['PAID', 'PAID', 'PAID'], { reminder: true });

    expect(sent).toBe(false);
    expect(mail).toBeUndefined();
  });
});
