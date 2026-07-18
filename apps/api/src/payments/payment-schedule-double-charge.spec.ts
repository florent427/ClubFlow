import { InvoiceStatus } from '@prisma/client';
import { resolveInvoiceBalance } from './invoice-balance';

/**
 * Régression du double encaissement (audit pré-prod du 2026-07-18).
 *
 * Scénario d'origine : un adhérent souscrit un échéancier, puis règle sa
 * facture autrement — chèque saisi par le trésorier, paiement depuis une app
 * mobile ancienne, ou avoir. Le plan d'échéances, lui, l'ignorait : le moteur
 * continuait de prélever, et le webhook de succès jetait silencieusement
 * l'encaissement parce qu'il ne cherche que des factures OPEN.
 *
 * `resolveInvoiceBalance` est le point de vérité de ce garde-fou : c'est lui
 * que le moteur interroge juste avant de créer le PaymentIntent.
 */

type Row = { _sum: { amountCents: number | null } };

function makePrisma(args: {
  invoice: {
    amountCents: number;
    status: InvoiceStatus;
    isCreditNote?: boolean;
  } | null;
  paidCents?: number | null;
  creditNoteCents?: number | null;
  /** Échéances déjà parties chez Stripe, webhook non revenu. */
  inFlightCents?: number | null;
}) {
  const invoiceRow = args.invoice
    ? {
        id: 'inv-1',
        amountCents: args.invoice.amountCents,
        status: args.invoice.status,
        isCreditNote: args.invoice.isCreditNote ?? false,
      }
    : null;

  return {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(invoiceRow),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: args.creditNoteCents ?? null },
      } as Row),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: args.paidCents ?? null },
      } as Row),
    },
    paymentScheduleInstallment: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: args.inFlightCents ?? null },
      } as Row),
    },
  };
}

const call = (p: ReturnType<typeof makePrisma>) =>
  resolveInvoiceBalance(p as never, 'inv-1', 'club-1');

describe('resolveInvoiceBalance — garde-fou anti double encaissement', () => {
  it('facture ouverte non réglée : encaissable pour le solde entier', async () => {
    const r = await call(
      makePrisma({ invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN } }),
    );

    expect(r.isCollectable).toBe(true);
    expect(r.balanceCents).toBe(60_000);
  });

  it('règlement manuel du solde : plus rien à prélever', async () => {
    // Le trésorier a saisi un chèque de 500 € sur une facture de 600 € dont
    // 100 € avaient déjà été prélevés. C'est LE scénario du double débit.
    const r = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.PAID },
        paidCents: 60_000,
      }),
    );

    expect(r.isCollectable).toBe(false);
    expect(r.balanceCents).toBe(0);
    expect(r.status).toBe(InvoiceStatus.PAID);
  });

  it('facture soldée mais restée OPEN : refuse quand même de prélever', async () => {
    // `recordManualPayment` ne bascule en PAID que sur une égalité stricte au
    // montant nominal : avec un avoir, la facture peut être soldée tout en
    // restant OPEN. Se fier au seul statut laisserait passer un prélèvement.
    const r = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN },
        paidCents: 40_000,
        creditNoteCents: 20_000,
      }),
    );

    expect(r.status).toBe(InvoiceStatus.OPEN);
    expect(r.balanceCents).toBe(0);
    expect(r.isCollectable).toBe(false);
  });

  it('déduit les avoirs du solde prélevable', async () => {
    // Sans cette déduction, l'adhérent serait prélevé du montant de l'avoir.
    const r = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN },
        paidCents: 10_000,
        creditNoteCents: 20_000,
      }),
    );

    expect(r.balanceCents).toBe(30_000);
    expect(r.isCollectable).toBe(true);
  });

  it('règlement PARTIEL : le solde restant devient le plafond du prélèvement', async () => {
    // 600 € facturés, 450 € déjà réglés, échéances de 100 € : la prochaine
    // doit être plafonnée à 150 €, sinon on encaisse plus que le dû.
    const r = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN },
        paidCents: 45_000,
      }),
    );

    expect(r.balanceCents).toBe(15_000);
    expect(Math.min(10_000, r.balanceCents)).toBe(10_000);

    const presqueSolde = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN },
        paidCents: 55_000,
      }),
    );
    expect(Math.min(10_000, presqueSolde.balanceCents)).toBe(5_000);
  });

  it('facture annulée : rien n’est prélevable', async () => {
    const r = await call(
      makePrisma({
        invoice: { amountCents: 60_000, status: InvoiceStatus.VOID },
      }),
    );

    expect(r.isCollectable).toBe(false);
    expect(r.status).toBe(InvoiceStatus.VOID);
  });

  it('facture disparue : rien n’est prélevable, et pas d’exception', async () => {
    // Le moteur tourne sans supervision : une facture supprimée ne doit pas
    // faire échouer tout le passage quotidien.
    const r = await call(makePrisma({ invoice: null }));

    expect(r.isCollectable).toBe(false);
    expect(r.status).toBeNull();
    expect(r.balanceCents).toBe(0);
  });

  it('déduit un prélèvement EN VOL du montant encore réclamable', async () => {
    // Le moteur n'écrit jamais de Payment : c'est le webhook de succès qui le
    // fait. Entre les deux — 3 à 5 jours en SEPA — l'argent est engagé mais
    // invisible des Payment. Sans cette déduction, une seconde échéance due le
    // même jour se croirait couverte par le solde entier.
    const r = await call(
      makePrisma({
        invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
        paidCents: 60_000,
        inFlightCents: 30_000,
      }),
    );

    expect(r.balanceCents).toBe(30_000);
    expect(r.inFlightCents).toBe(30_000);
    // Tout le solde est déjà couvert par le prélèvement en cours.
    expect(r.collectableCents).toBe(0);
    expect(r.isCollectable).toBe(false);
  });

  it('deux échéances dues le même jour : la seconde ne peut plus rien prélever', async () => {
    // Scénario exact remonté par la revue : cron coupé quelques jours, puis
    // deux échéances de 300 € exigibles ensemble sur un solde de 300 €.
    const avant = await call(
      makePrisma({
        invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
        paidCents: 60_000,
      }),
    );
    expect(Math.min(30_000, avant.collectableCents)).toBe(30_000);

    // La première est partie : 300 € désormais en vol.
    const apres = await call(
      makePrisma({
        invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
        paidCents: 60_000,
        inFlightCents: 30_000,
      }),
    );
    expect(Math.min(30_000, apres.collectableCents)).toBe(0);
    expect(apres.isCollectable).toBe(false);
  });

  it('prélèvement en vol partiel : le reste demeure réclamable', async () => {
    const r = await call(
      makePrisma({
        invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
        inFlightCents: 30_000,
      }),
    );

    expect(r.balanceCents).toBe(90_000);
    expect(r.collectableCents).toBe(60_000);
    expect(r.isCollectable).toBe(true);
  });

  it('ne compte comme en vol que ce qui est parti chez Stripe et non constaté', async () => {
    const p = makePrisma({
      invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
    });
    await call(p);

    // Une échéance sans PaymentIntent n'est pas engagée ; une déjà rattachée à
    // un Payment est déjà comptée dans les paiements — la compter deux fois
    // sous-estimerait le réclamable et bloquerait des prélèvements légitimes.
    expect(p.paymentScheduleInstallment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stripePaymentIntentId: { not: null },
          paymentId: null,
        }),
      }),
    );
  });

  it('collectableCents ne devient jamais négatif', async () => {
    const r = await call(
      makePrisma({
        invoice: { amountCents: 90_000, status: InvoiceStatus.OPEN },
        paidCents: 80_000,
        inFlightCents: 30_000,
      }),
    );

    expect(r.collectableCents).toBe(0);
  });

  it('isole par club : la facture d’un autre club est introuvable', async () => {
    const p = makePrisma({
      invoice: { amountCents: 60_000, status: InvoiceStatus.OPEN },
    });
    await call(p);

    expect(p.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'inv-1', clubId: 'club-1' }),
      }),
    );
  });
});
