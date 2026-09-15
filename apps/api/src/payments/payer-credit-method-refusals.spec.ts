import { BadRequestException } from '@nestjs/common';
import { ClubPaymentMethod, PricingAdjustmentType } from '@prisma/client';
import { ClubPaymentRoutesService } from '../accounting/club-payment-routes.service';
import { MembershipCartService } from '../membership/membership-cart.service';
import { MembershipService } from '../membership/membership.service';
import { ViewerService } from '../viewer/viewer.service';
import { PaymentsService } from './payments.service';

/**
 * Le crédit du payeur ne fait entrer aucun argent (ADR-0022, §6). Aucun chemin
 * qui choisit, verrouille, tarife ou route un moyen de paiement ne l'accepte.
 * Chaque refus précède toute lecture : la base du double lève au premier accès,
 * si bien qu'un refus manquant se voit à l'erreur qui remonte.
 */
function baseInterdite(): never {
  const modele = (nom: string) =>
    new Proxy(
      {},
      {
        get: (_cible, operation) => () => {
          throw new Error(`Accès base inattendu : ${nom}.${String(operation)}`);
        },
      },
    );
  return new Proxy({}, { get: (_cible, nom) => modele(String(nom)) }) as never;
}

const aucun = {} as never;

function paiements(prisma: never): PaymentsService {
  return new PaymentsService(prisma, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun);
}

async function refuse(promesse: Promise<unknown>, motif: RegExp): Promise<void> {
  await expect(promesse).rejects.toBeInstanceOf(BadRequestException);
  await expect(promesse).rejects.toThrow(motif);
}

describe('Le crédit ne se choisit nulle part (ADR-0022, §6)', () => {
  it('pas de route de paiement vers un compte', async () => {
    await refuse(
      new ClubPaymentRoutesService(baseInterdite()).upsert('club-1', ClubPaymentMethod.PAYER_CREDIT, 'fa-1'),
      /aucun compte/,
    );
  });

  it('pas de règle tarifaire', async () => {
    await refuse(
      paiements(baseInterdite()).upsertPricingRule('club-1', {
        method: ClubPaymentMethod.PAYER_CREDIT,
        adjustmentType: PricingAdjustmentType.PERCENT_BP,
        adjustmentValue: -500,
      }),
      /règle tarifaire/,
    );
  });

  it('pas de tarif sur une facture libre', async () => {
    await refuse(
      paiements(baseInterdite()).createInvoice('club-1', {
        label: 'Stage d’été',
        baseAmountCents: 12000,
        pricingMethod: ClubPaymentMethod.PAYER_CREDIT,
      }),
      /règle tarifaire/,
    );
  });

  it('pas de saisie manuelle d’un encaissement', async () => {
    await refuse(
      paiements(baseInterdite()).recordManualPayment('club-1', {
        invoiceId: 'facture-1',
        amountCents: 5000,
        method: ClubPaymentMethod.PAYER_CREDIT,
      }),
      /ne s’encaisse pas à la main/,
    );
  });

  it('pas de moyen verrouillé à la finalisation d’une adhésion', async () => {
    await refuse(
      new MembershipService(baseInterdite()).finalizeMembershipInvoice(
        'club-1',
        'facture-1',
        ClubPaymentMethod.PAYER_CREDIT,
      ),
      /s’utilise depuis la facture/,
    );
  });

  it('pas de validation de panier par crédit, avant d’en créer les membres et la facture', async () => {
    await refuse(
      new MembershipCartService(baseInterdite(), aucun, aucun, aucun, aucun, aucun).validateCart(
        'club-1',
        'user-1',
        'panier-1',
        ClubPaymentMethod.PAYER_CREDIT,
      ),
      /s’utilise depuis la facture/,
    );
  });

  it('pas de choix du crédit comme mode de règlement au portail', async () => {
    const viewer = new ViewerService(
      baseInterdite(),
      aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun, aucun,
    );

    await refuse(
      viewer.viewerLockInvoicePaymentChoice({
        clubId: 'club-1',
        invoiceId: 'facture-1',
        activeProfile: { memberId: 'membre-1', contactId: null },
        viewerUserId: 'user-1',
        method: ClubPaymentMethod.PAYER_CREDIT,
      }),
      /s’utilise depuis la facture/,
    );
  });
});

describe('Témoins : un moyen ordinaire franchit les mêmes contrôles', () => {
  it('une route vers la caisse s’enregistre', async () => {
    const upsert = jest.fn(async (args: unknown) => args);
    const prisma = {
      clubFinancialAccount: {
        findFirst: jest.fn(async () => ({ id: 'fa-caisse', isActive: true })),
      },
      clubPaymentRoute: { upsert },
    };

    await new ClubPaymentRoutesService(prisma as never).upsert('club-1', ClubPaymentMethod.MANUAL_CASH, 'fa-caisse');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clubId_method: { clubId: 'club-1', method: ClubPaymentMethod.MANUAL_CASH } } }),
    );
  });

  it('la finalisation verrouille un moyen ordinaire', async () => {
    const update = jest.fn(async (args: unknown) => args);
    const prisma = {
      invoice: {
        findFirst: jest.fn(async () => ({ id: 'facture-1', clubId: 'club-1', status: 'DRAFT', amountCents: 5000 })),
        update,
      },
      clubPricingRule: { findUnique: jest.fn(async () => null) },
    };

    await new MembershipService(prisma as never).finalizeMembershipInvoice(
      'club-1',
      'facture-1',
      ClubPaymentMethod.MANUAL_CHECK,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'facture-1' },
      data: { status: 'OPEN', lockedPaymentMethod: ClubPaymentMethod.MANUAL_CHECK, amountCents: 5000 },
    });
  });
});
