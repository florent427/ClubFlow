import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClubPaymentMethod, InvoicePurpose } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PayerCreditService } from './payer-credit.service';

/**
 * Le crédit d'une personne se calcule à partir des paiements (ADR-0022, §4) :
 * versements de ses reçus d'avance, moins ses paiements PAYER_CREDIT. Le
 * double applique chaque `where` comme Prisma : une clause absente ne filtre
 * rien, une clause qu'il ne connaît pas lève
 * (pitfalls/double-ignore-une-clause-du-where.md). Un service qui oublierait
 * `clubId`, `purpose` ou `method` compterait de l'argent qui n'est pas à la
 * personne.
 */

type Member = { id: string; clubId: string; userId: string | null; firstName: string; lastName: string };
type Contact = { id: string; clubId: string; userId: string; firstName: string; lastName: string };
type Receipt = {
  id: string;
  clubId: string;
  label: string;
  purpose: InvoicePurpose;
  payerCreditMemberId: string | null;
  payerCreditContactId: string | null;
  createdAt: Date;
  payments: Array<{ id: string; amountCents: number; method: ClubPaymentMethod; externalRef: string | null; createdAt: Date }>;
};
type Payment = {
  id: string;
  clubId: string;
  method: ClubPaymentMethod;
  amountCents: number;
  paidByMemberId: string | null;
  paidByContactId: string | null;
  createdAt: Date;
  invoice: { id: string; label: string };
};
type Family = { id: string; clubId: string };
type Link = { familyId: string; memberId: string | null; contactId: string | null; createdAt: Date };

function selon<T extends Record<string, unknown>>(
  rows: T[],
  where: Record<string, unknown>,
  champs: string[],
): T[] {
  for (const cle of Object.keys(where)) {
    if (!champs.includes(cle)) throw new Error(`Clause non simulée : ${cle}`);
  }
  return rows.filter((row) =>
    Object.entries(where).every(([cle, clause]) => {
      if (clause === undefined) return true;
      if (cle === 'OR') {
        return (clause as Record<string, unknown>[]).some((o) => selon([row], o, champs).length > 0);
      }
      if (clause !== null && typeof clause === 'object' && 'in' in clause) {
        return (clause as { in: unknown[] }).in.includes(row[cle]);
      }
      return row[cle] === clause;
    }),
  );
}

const jour = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`);

function base() {
  const members: Member[] = [
    { id: 'm-camille', clubId: 'club-1', userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
    { id: 'm-sans-compte', clubId: 'club-1', userId: null, firstName: 'Léo', lastName: 'Guichet' },
    { id: 'm-ailleurs', clubId: 'club-2', userId: 'u-autre', firstName: 'Nina', lastName: 'Ailleurs' },
    { id: 'm-sans-credit', clubId: 'club-1', userId: null, firstName: 'Zoé', lastName: 'Sanscrédit' },
    { id: 'm-litige', clubId: 'club-1', userId: null, firstName: 'Inès', lastName: 'Litige' },
  ];
  const contacts: Contact[] = [
    { id: 'c-camille', clubId: 'club-1', userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
    { id: 'c-autre', clubId: 'club-1', userId: 'u-autre', firstName: 'Paul', lastName: 'Autre' },
    // Même compte que Camille, mais dans un autre club : pas le même crédit.
    { id: 'c-camille-club2', clubId: 'club-2', userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
  ];
  const pay = (id: string, amountCents: number, day: number) => ({
    id,
    amountCents,
    method: ClubPaymentMethod.MANUAL_CASH,
    externalRef: null,
    createdAt: jour(day),
  });
  const receipt = (over: Partial<Receipt> & { id: string }): Receipt => ({
    clubId: 'club-1',
    label: 'Avance',
    purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
    payerCreditMemberId: null,
    payerCreditContactId: null,
    createdAt: jour(1),
    payments: [],
    ...over,
  });
  const invoices: Receipt[] = [
    receipt({ id: 'r-membre', payerCreditMemberId: 'm-camille', createdAt: jour(2), payments: [pay('p1', 2000, 2)] }),
    receipt({ id: 'r-contact', payerCreditContactId: 'c-camille', createdAt: jour(3), payments: [pay('p2', 3000, 3)] }),
    // Remboursé en partie : le remboursement compte en négatif.
    receipt({ id: 'r-rembourse', payerCreditMemberId: 'm-camille', createdAt: jour(4), payments: [pay('p3', 4000, 4), pay('p3-remb', -1500, 5)] }),
    // Une facture ordinaire de la même personne n'est pas du crédit.
    receipt({ id: 'f-cotisation', purpose: InvoicePurpose.CHARGE, payerCreditMemberId: 'm-camille', payments: [pay('p4', 9000, 6)] }),
    // Le crédit d'une autre personne du club.
    receipt({ id: 'r-autre', payerCreditContactId: 'c-autre', payments: [pay('p5', 5000, 7)] }),
    // Le même compte dans un autre club.
    receipt({ id: 'r-club2', clubId: 'club-2', payerCreditContactId: 'c-camille-club2', payments: [pay('p6', 7000, 8)] }),
    receipt({ id: 'r-guichet', payerCreditMemberId: 'm-sans-compte', payments: [pay('p7', 1000, 9)] }),
    // Avance utilisée, puis remboursée : le crédit devient négatif.
    receipt({ id: 'r-litige', payerCreditMemberId: 'm-litige', payments: [pay('p8', 1000, 10), pay('p8-litige', -1000, 15)] }),
  ];
  const cotisation = { id: 'f-cotisation', label: 'Cotisation 2026' };
  const payments: Payment[] = [
    // Imputation au nom du contact de Camille…
    { id: 'u-1', clubId: 'club-1', method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 1500, paidByMemberId: null, paidByContactId: 'c-camille', createdAt: jour(10), invoice: cotisation },
    // …dont une part lui est rendue, au nom de son membre (avoir).
    { id: 'u-rendu', clubId: 'club-1', method: ClubPaymentMethod.PAYER_CREDIT, amountCents: -500, paidByMemberId: 'm-camille', paidByContactId: null, createdAt: jour(11), invoice: cotisation },
    // Un encaissement ordinaire de Camille n'entame pas son crédit.
    { id: 'especes', clubId: 'club-1', method: ClubPaymentMethod.MANUAL_CASH, amountCents: 9000, paidByMemberId: 'm-camille', paidByContactId: null, createdAt: jour(6), invoice: cotisation },
    // L'imputation d'une autre personne.
    { id: 'u-guichet', clubId: 'club-1', method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 400, paidByMemberId: 'm-sans-compte', paidByContactId: null, createdAt: jour(12), invoice: cotisation },
    // Le même compte dans un autre club.
    { id: 'u-club2', clubId: 'club-2', method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 700, paidByMemberId: null, paidByContactId: 'c-camille-club2', createdAt: jour(13), invoice: cotisation },
    { id: 'u-litige', clubId: 'club-1', method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 300, paidByMemberId: 'm-litige', paidByContactId: null, createdAt: jour(12), invoice: cotisation },
  ];
  const families: Family[] = [
    { id: 'fam-1', clubId: 'club-1' },
    { id: 'fam-club2', clubId: 'club-2' },
  ];
  // Dans le désordre : le foyer les liste par date de rattachement.
  const links: Link[] = [
    { familyId: 'fam-1', memberId: null, contactId: 'c-autre', createdAt: jour(5) },
    { familyId: 'fam-1', memberId: 'm-camille', contactId: null, createdAt: jour(2) },
    { familyId: 'fam-1', memberId: 'm-litige', contactId: null, createdAt: jour(6) },
    { familyId: 'fam-1', memberId: 'm-sans-credit', contactId: null, createdAt: jour(4) },
    // Le contact du compte de Camille : la même personne, une seule ligne.
    { familyId: 'fam-1', memberId: null, contactId: 'c-camille', createdAt: jour(3) },
    // Une fiche d'un autre club rattachée par erreur : pas de crédit ici.
    { familyId: 'fam-1', memberId: 'm-ailleurs', contactId: null, createdAt: jour(7) },
    { familyId: 'fam-1', memberId: 'm-sans-compte', contactId: null, createdAt: jour(1) },
    { familyId: 'fam-club2', memberId: null, contactId: 'c-camille-club2', createdAt: jour(1) },
  ];

  const prisma = {
    family: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(families, where, ['id', 'clubId'])[0] ?? null,
      ),
    },
    familyMember: {
      findMany: jest.fn(
        async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
          const rows = selon(links, where, ['familyId']);
          if (!orderBy) return rows;
          const sens = orderBy.createdAt === 'asc' ? 1 : -1;
          return [...rows].sort((a, b) => sens * (a.createdAt.getTime() - b.createdAt.getTime()));
        },
      ),
    },
    member: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(members, where, ['id', 'clubId', 'userId'])[0] ?? null,
      ),
    },
    contact: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(contacts, where, ['id', 'clubId'])[0] ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(contacts, where, ['clubId', 'userId']),
      ),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(invoices, where, ['clubId', 'purpose', 'OR', 'payerCreditMemberId', 'payerCreditContactId'])
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((i) => ({ id: i.id, label: i.label, createdAt: i.createdAt, payments: i.payments })),
      ),
    },
    payment: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(payments, where, ['clubId', 'method', 'OR', 'paidByMemberId', 'paidByContactId'])
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((p) => ({ id: p.id, amountCents: p.amountCents, createdAt: p.createdAt, invoice: p.invoice })),
      ),
    },
  };
  return new PayerCreditService(prisma as unknown as PrismaService);
}

describe('PayerCreditService.credit', () => {
  it('versements moins imputations, membre et contact du même compte, et rien d’autre', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-camille' });

    // Versé : 20 € + 30 € + (40 € − 15 €) = 75 €. Imputé : 15 € − 5 € rendus.
    // La cotisation, l'encaissement en espèces, l'autre personne et l'autre
    // club n'y sont pas.
    expect(credit.balanceCents).toBe(6500);
    expect(credit.deposits.map((d) => d.invoiceId)).toEqual(['r-rembourse', 'r-contact', 'r-membre']);
    expect(credit.uses.map((u) => [u.paymentId, u.amountCents])).toEqual([
      ['u-rendu', -500],
      ['u-1', 1500],
    ]);
    expect(credit.holder).toMatchObject({ memberId: 'm-camille', contactId: null, displayName: 'Camille Titulaire' });
  });

  it('une imputation dit sur quelle facture le crédit est parti', async () => {
    const credit = await base().credit('club-1', { contactId: 'c-camille' });

    expect(credit.uses.find((u) => u.paymentId === 'u-1')).toMatchObject({
      invoiceId: 'f-cotisation',
      invoiceLabel: 'Cotisation 2026',
    });
  });

  it('le contact voit exactement le crédit du membre du même compte, et partage son verrou', async () => {
    const svc = base();
    const parMembre = await svc.credit('club-1', { memberId: 'm-camille' });
    const parContact = await svc.credit('club-1', { contactId: 'c-camille' });

    expect(parContact.balanceCents).toBe(parMembre.balanceCents);
    expect(parContact.holder).toMatchObject({ memberId: null, contactId: 'c-camille' });
    expect(parContact.holder.personKey).toBe(parMembre.holder.personKey);
  });

  it('un remboursement compte en négatif sur son reçu', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-camille' });

    expect(credit.deposits.find((d) => d.invoiceId === 'r-rembourse')?.amountCents).toBe(2500);
  });

  it('un membre sans compte utilisateur n’a que ses propres reçus et imputations', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-sans-compte' });

    expect(credit.balanceCents).toBe(600);
    expect(credit.holder.personKey).toBe('member:m-sans-compte');
  });

  it('exige exactement une personne', async () => {
    const svc = base();

    await expect(svc.credit('club-1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.credit('club-1', { memberId: 'm-camille', contactId: 'c-camille' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('une personne d’un autre club est introuvable', async () => {
    const svc = base();

    await expect(svc.credit('club-1', { memberId: 'm-ailleurs' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.credit('club-1', { contactId: 'c-camille-club2' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PayerCreditService.familyCredits — le crédit d’un foyer, une ligne par personne', () => {
  it('chaque personne une fois, dans l’ordre du foyer ; crédit nul omis, crédit négatif gardé', async () => {
    const lignes = await base().familyCredits('club-1', 'fam-1');

    expect(lignes).toEqual([
      { memberId: 'm-sans-compte', contactId: null, displayName: 'Léo Guichet', balanceCents: 600 },
      { memberId: 'm-camille', contactId: null, displayName: 'Camille Titulaire', balanceCents: 6500 },
      { memberId: null, contactId: 'c-autre', displayName: 'Paul Autre', balanceCents: 5000 },
      { memberId: 'm-litige', contactId: null, displayName: 'Inès Litige', balanceCents: -300 },
    ]);
  });

  it('un foyer d’un autre club est introuvable', async () => {
    await expect(base().familyCredits('club-1', 'fam-club2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
