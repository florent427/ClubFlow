import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClubPaymentMethod, InvoicePurpose } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PayerCreditService } from './payer-credit.service';

/**
 * Le crédit d'une personne se calcule à partir des paiements de ses reçus
 * d'avance (ADR-0022, §4). Le double applique chaque `where` comme Prisma : une
 * clause absente ne filtre rien, une clause qu'il ne connaît pas lève
 * (pitfalls/double-ignore-une-clause-du-where.md). Un service qui oublierait
 * `clubId` ou `purpose` compterait de l'argent qui n'est pas à la personne.
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

function base() {
  const members: Member[] = [
    { id: 'm-camille', clubId: 'club-1', userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
    { id: 'm-sans-compte', clubId: 'club-1', userId: null, firstName: 'Léo', lastName: 'Guichet' },
    { id: 'm-ailleurs', clubId: 'club-2', userId: 'u-autre', firstName: 'Nina', lastName: 'Ailleurs' },
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
    createdAt: new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`),
  });
  const receipt = (over: Partial<Receipt> & { id: string }): Receipt => ({
    clubId: 'club-1',
    label: 'Avance',
    purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
    payerCreditMemberId: null,
    payerCreditContactId: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    payments: [],
    ...over,
  });
  const invoices: Receipt[] = [
    receipt({ id: 'r-membre', payerCreditMemberId: 'm-camille', createdAt: new Date('2026-09-02T10:00:00Z'), payments: [pay('p1', 2000, 2)] }),
    receipt({ id: 'r-contact', payerCreditContactId: 'c-camille', createdAt: new Date('2026-09-03T10:00:00Z'), payments: [pay('p2', 3000, 3)] }),
    // Remboursé en partie : le remboursement compte en négatif.
    receipt({ id: 'r-rembourse', payerCreditMemberId: 'm-camille', createdAt: new Date('2026-09-04T10:00:00Z'), payments: [pay('p3', 4000, 4), pay('p3-remb', -1500, 5)] }),
    // Une facture ordinaire de la même personne n'est pas du crédit.
    receipt({ id: 'f-cotisation', purpose: InvoicePurpose.CHARGE, payerCreditMemberId: 'm-camille', payments: [pay('p4', 9000, 6)] }),
    // Le crédit d'une autre personne du club.
    receipt({ id: 'r-autre', payerCreditContactId: 'c-autre', payments: [pay('p5', 5000, 7)] }),
    // Le même compte dans un autre club.
    receipt({ id: 'r-club2', clubId: 'club-2', payerCreditContactId: 'c-camille-club2', payments: [pay('p6', 7000, 8)] }),
    receipt({ id: 'r-guichet', payerCreditMemberId: 'm-sans-compte', payments: [pay('p7', 1000, 9)] }),
  ];

  const prisma = {
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
  };
  return new PayerCreditService(prisma as unknown as PrismaService);
}

describe('PayerCreditService.credit', () => {
  it('compte les reçus du membre ET du contact du même compte, et rien d’autre', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-camille' });

    // 20 € + 30 € + (40 € − 15 €) : la cotisation, l'autre personne et
    // l'autre club n'y sont pas.
    expect(credit.balanceCents).toBe(7500);
    expect(credit.deposits.map((d) => d.invoiceId)).toEqual(['r-rembourse', 'r-contact', 'r-membre']);
    expect(credit.holder).toMatchObject({ memberId: 'm-camille', contactId: null, displayName: 'Camille Titulaire' });
  });

  it('le contact voit exactement le crédit du membre du même compte', async () => {
    const svc = base();
    const parMembre = await svc.credit('club-1', { memberId: 'm-camille' });
    const parContact = await svc.credit('club-1', { contactId: 'c-camille' });

    expect(parContact.balanceCents).toBe(parMembre.balanceCents);
    expect(parContact.holder).toMatchObject({ memberId: null, contactId: 'c-camille' });
  });

  it('un remboursement compte en négatif sur son reçu', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-camille' });

    expect(credit.deposits.find((d) => d.invoiceId === 'r-rembourse')?.amountCents).toBe(2500);
  });

  it('un membre sans compte utilisateur n’a que ses propres reçus', async () => {
    const credit = await base().credit('club-1', { memberId: 'm-sans-compte' });

    expect(credit.balanceCents).toBe(1000);
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
