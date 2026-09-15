import { ClubPaymentMethod } from '@prisma/client';
import { DashboardService } from './dashboard.service';

/**
 * L'encaissé du tableau de bord compte l'argent reçu. Une avance y entre à son
 * versement ; son imputation sur une facture (PAYER_CREDIT) ne fait entrer
 * aucun argent, et la compter reviendrait à encaisser deux fois (ADR-0022, §6).
 *
 * Le double applique le `where` comme Prisma : une clause absente ne filtre
 * rien, une clause inconnue lève.
 */

const CLUB = 'club-1';
const DAY_MS = 86_400_000;

type PaymentRow = {
  clubId: string;
  amountCents: number;
  method: ClubPaymentMethod;
  createdAt: Date;
};

function service(rows: PaymentRow[]) {
  const aggregate = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    for (const cle of Object.keys(where)) {
      if (!['clubId', 'createdAt', 'method'].includes(cle)) {
        throw new Error(`Clause non simulée : ${cle}`);
      }
    }
    const periode = where.createdAt as { gte: Date; lt: Date };
    const moyen = where.method as { not: ClubPaymentMethod } | undefined;
    const retenus = rows.filter(
      (p) =>
        p.clubId === where.clubId &&
        p.createdAt >= periode.gte &&
        p.createdAt < periode.lt &&
        (moyen === undefined || p.method !== moyen.not),
    );
    return {
      _sum: {
        amountCents: retenus.length ? retenus.reduce((s, p) => s + p.amountCents, 0) : null,
      },
    };
  });
  const zero = jest.fn(async () => 0);
  const aucune = jest.fn(async () => []);
  const prisma = {
    payment: { aggregate },
    member: { count: zero },
    clubModule: { count: zero },
    courseSlot: { count: zero },
    invoice: { count: zero, findMany: aucune },
    clubEvent: { count: zero },
    clubAnnouncement: { count: zero },
    shopOrder: { count: zero },
    grantApplication: { count: zero },
    sponsorshipDeal: { count: zero },
    accountingEntry: { findMany: aucune },
    vitrinePage: { count: zero },
    vitrineArticle: { count: zero },
    contact: { count: zero },
  };
  return new DashboardService(prisma as never);
}

describe('Tableau de bord — encaissé, hors règlements par crédit (ADR-0022)', () => {
  it('l’encaissé du mois compte l’argent reçu, pas le crédit imputé', async () => {
    const now = new Date();
    const debutDuMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 1));
    const dashboard = service([
      { clubId: CLUB, amountCents: 5000, method: ClubPaymentMethod.MANUAL_CASH, createdAt: debutDuMois },
      { clubId: CLUB, amountCents: 3000, method: ClubPaymentMethod.PAYER_CREDIT, createdAt: debutDuMois },
      { clubId: 'club-2', amountCents: 2000, method: ClubPaymentMethod.MANUAL_CHECK, createdAt: debutDuMois },
    ]);

    const resume = await dashboard.summary(CLUB);

    // Compté, le crédit imputé porterait l'encaissé à 80 €.
    expect(resume.revenueCentsMonth).toBe(5000);
  });

  it('la tendance sur 30 jours écarte aussi le crédit imputé, sur les deux périodes', async () => {
    const ilYa = (jours: number) => new Date(Date.now() - jours * DAY_MS);
    const dashboard = service([
      { clubId: CLUB, amountCents: 4000, method: ClubPaymentMethod.MANUAL_TRANSFER, createdAt: ilYa(1) },
      { clubId: CLUB, amountCents: 4000, method: ClubPaymentMethod.PAYER_CREDIT, createdAt: ilYa(1) },
      { clubId: CLUB, amountCents: 2500, method: ClubPaymentMethod.MANUAL_CASH, createdAt: ilYa(40) },
      { clubId: CLUB, amountCents: 1000, method: ClubPaymentMethod.PAYER_CREDIT, createdAt: ilYa(40) },
    ]);

    const tendance = await dashboard.trends(CLUB);

    expect([tendance.revenueLast30Cents, tendance.revenuePrev30Cents]).toEqual([4000, 2500]);
  });
});
