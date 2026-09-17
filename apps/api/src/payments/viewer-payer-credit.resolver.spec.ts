import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ClubPaymentMethod, InvoiceStatus, type Club } from '@prisma/client';
import { camillePayeuse, CLUB, compte, monde, portail } from '../../test/payer-credit-world';
import { REQUIRE_CLUB_MODULE_KEY } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PayerCreditMovementKind } from './payer-credit-movements';
import { ViewerPayerCreditResolver } from './viewer-payer-credit.resolver';

/**
 * Le crédit au portail et dans l'appli (ADR-0022, lot 3), sur le vrai calcul
 * du crédit, le vrai périmètre payeur et la vraie imputation.
 *
 * Le crédit est celui du COMPTE connecté. Un payeur voit les profils de tous
 * les membres de son foyer et peut en activer un : le crédit de cet adulte ne
 * doit ni s'afficher, ni se dépenser.
 */

const club = { id: CLUB } as Club;

describe('viewerPayerCredit — le crédit du compte connecté (ADR-0022, lot 3)', () => {
  it('membre et contact du compte réunis : chaque mouvement porte son effet, et leur somme est le crédit', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    w.avance({ contactId: 'c-camille' }, 1000);
    const cotisation = w.facture({ amountCents: 3000, label: 'Cotisation 2026' });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: cotisation, memberId: 'm-camille' });
    const stage = w.facture({ amountCents: 2000, label: 'Stage' });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: stage, contactId: 'c-camille' });
    await w.svc.createCreditNote(CLUB, stage, 'Stage annulé', 2000);

    const vu = await portail(w).viewerPayerCredit(
      compte('u-camille', { memberId: 'm-camille' }),
      club,
    );

    expect(vu.movements.map((m) => [m.kind, m.amountCents, m.label, m.method])).toEqual([
      [PayerCreditMovementKind.USE_RETURN, 2000, 'Stage', null],
      [PayerCreditMovementKind.USE, -2000, 'Stage', null],
      [PayerCreditMovementKind.USE, -3000, 'Cotisation 2026', null],
      [PayerCreditMovementKind.DEPOSIT, 1000, 'Avance', ClubPaymentMethod.MANUAL_CASH],
      [PayerCreditMovementKind.DEPOSIT, 5000, 'Avance', ClubPaymentMethod.MANUAL_CASH],
    ]);
    expect(vu.balanceCents).toBe(3000);
    expect(vu.movements.reduce((s, m) => s + m.amountCents, 0)).toBe(vu.balanceCents);
    expect(await w.credit({ contactId: 'c-camille' })).toBe(3000);
  });

  it('le profil actif d’un autre adulte du foyer ne montre pas son crédit : c’est celui du compte', async () => {
    const w = monde();
    camillePayeuse(w);
    w.avance({ memberId: 'm-camille' }, 5000);
    w.avance({ contactId: 'c-paul' }, 1200);

    const vu = await portail(w).viewerPayerCredit(
      compte('u-paul', { memberId: 'm-camille' }),
      club,
    );

    expect(vu.balanceCents).toBe(1200);
    expect(vu.movements.map((m) => m.amountCents)).toEqual([1200]);
  });

  it('les fiches du compte dans un autre club ne masquent pas son crédit ici ; sans fiche ici, aucun crédit', async () => {
    const w = monde();
    w.members.push({
      id: 'm-paul-ailleurs',
      clubId: 'club-2',
      userId: 'u-paul',
      firstName: 'Paul',
      lastName: 'Ailleurs',
      status: 'ACTIVE',
    });
    w.contacts.unshift({
      id: 'c-paul-ailleurs',
      clubId: 'club-2',
      userId: 'u-paul',
      firstName: 'Paul',
      lastName: 'Ailleurs',
    });
    w.avance({ contactId: 'c-paul' }, 1200);

    await expect(
      portail(w).viewerPayerCredit(compte('u-paul', { contactId: 'c-paul' }), club),
    ).resolves.toMatchObject({ balanceCents: 1200 });
    await expect(
      portail(w).viewerPayerCredit(compte('u-inconnu', { contactId: 'c-paul' }), club),
    ).resolves.toEqual({ balanceCents: 0, movements: [], cardTopUpAvailable: false });
  });
});

describe('viewerApplyPayerCredit — « Utiliser mon crédit » (ADR-0022, lot 3)', () => {
  it('règle une facture du foyer avec le crédit du compte, au montant confirmé', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 5000);
    const f = w.facture({ amountCents: 5000 });

    const res = await portail(w).viewerApplyPayerCredit(
      compte('u-paul', { contactId: 'c-paul' }),
      club,
      f,
      2000,
    );

    expect(res).toMatchObject({
      invoiceId: f,
      amountCents: 2000,
      creditBalanceCents: 3000,
      invoiceStatus: InvoiceStatus.OPEN,
      invoiceBalanceCents: 3000,
    });
    expect(w.imputations(f).map((p) => [p.amountCents, p.paidByContactId, p.paidByMemberId])).toEqual([
      [2000, 'c-paul', null],
    ]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(3000);
  });

  it('sans montant : le plus petit du crédit et du reste dû, et la facture est soldée', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 8000);
    const f = w.facture({ amountCents: 5000 });

    const res = await portail(w).viewerApplyPayerCredit(
      compte('u-paul', { contactId: 'c-paul' }),
      club,
      f,
    );

    expect(res).toMatchObject({ amountCents: 5000, invoiceStatus: InvoiceStatus.PAID });
    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(3000);
  });

  it('dépense le crédit du compte, jamais celui du profil actif', async () => {
    const w = monde();
    camillePayeuse(w);
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 5000 });
    const paulSurLeProfilDeCamille = compte('u-paul', { memberId: 'm-camille' });

    await expect(
      portail(w).viewerApplyPayerCredit(paulSurLeProfilDeCamille, club, f),
    ).rejects.toThrow(BadRequestException);
    expect(w.imputations()).toEqual([]);
    expect(w.statut(f)).toBe(InvoiceStatus.OPEN);

    w.avance({ contactId: 'c-paul' }, 2000);
    await portail(w).viewerApplyPayerCredit(paulSurLeProfilDeCamille, club, f);

    expect(w.imputations(f).map((p) => [p.amountCents, p.paidByContactId, p.paidByMemberId])).toEqual([
      [2000, 'c-paul', null],
    ]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(5000);
  });

  it('hors du périmètre du portail, une facture est introuvable, même quand le compte pourrait la régler', async () => {
    const w = monde();
    camillePayeuse(w);
    w.avance({ memberId: 'm-camille' }, 5000);
    // Adhésion sans foyer au nom de Camille : l'admin peut la régler avec son
    // crédit, mais le portail ne l'affiche pas.
    const f = w.facture({ familyId: null, amountCents: 3000, label: 'Stage d’été' });
    w.invoiceLines.push({ invoiceId: f, memberId: 'm-camille' });
    expect(await w.svc.listPayerCreditCandidates(CLUB, f)).toEqual([
      expect.objectContaining({ memberId: 'm-camille' }),
    ]);

    await expect(
      portail(w).viewerApplyPayerCredit(compte('u-camille', { memberId: 'm-camille' }), club, f),
    ).rejects.toThrow(NotFoundException);
    expect(w.imputations()).toEqual([]);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(5000);
  });

  it('un profil qui ne paie pour aucun foyer ne règle rien, même une facture de son foyer', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 3000 });
    expect(await w.svc.listPayerCreditCandidates(CLUB, f)).toEqual(
      expect.arrayContaining([expect.objectContaining({ memberId: 'm-camille' })]),
    );

    await expect(
      portail(w).viewerApplyPayerCredit(compte('u-camille', { memberId: 'm-camille' }), club, f),
    ).rejects.toThrow(BadRequestException);
    expect(w.imputations()).toEqual([]);
  });

  it('les gardes du portail : jeton, club, profil actif du compte, module Paiement', () => {
    // Configuration de sécurité : sans ces gardes, un profil actif périmé ou un
    // club sans module Paiement passeraient.
    expect(Reflect.getMetadata(GUARDS_METADATA, ViewerPayerCreditResolver)).toEqual([
      GqlJwtAuthGuard,
      ClubContextGuard,
      ViewerActiveProfileGuard,
      ClubModuleEnabledGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRE_CLUB_MODULE_KEY, ViewerPayerCreditResolver)).toBe(
      ModuleCode.PAYMENT,
    );
  });
});
