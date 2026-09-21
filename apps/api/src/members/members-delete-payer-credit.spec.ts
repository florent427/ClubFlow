import { BadRequestException } from '@nestjs/common';
import { MembersService } from './members.service';

/**
 * Supprimer un membre qui a versé des avances (ADR-0022) ferait disparaître la
 * personne à qui l'argent appartient : c'est refusé, avec la raison. Le double
 * applique le `where` comme Prisma : une clause absente ne filtre rien, une
 * clause qu'il ne connaît pas lève.
 */

type Receipt = {
  id: string;
  clubId: string;
  payerCreditMemberId: string | null;
  payerCreditContactId: string | null;
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
    Object.entries(where).every(([cle, clause]) => clause === undefined || row[cle] === clause),
  );
}

function service(receipts: Receipt[]) {
  const members = [{ id: 'm-camille', clubId: 'club-1', userId: 'u-camille' }];
  const prisma = {
    member: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(members, where, ['id', 'clubId'])[0] ?? null,
      ),
      delete: jest.fn(async () => ({})),
      count: jest.fn(async () => 1),
    },
    courseSlot: { count: jest.fn(async () => 0) },
    invoice: {
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(receipts, where, ['clubId', 'payerCreditMemberId', 'payerCreditContactId']).length,
      ),
    },
    invoiceLine: { findMany: jest.fn(async () => []) },
    familyMember: { findFirst: jest.fn(async () => null) },
    clubMembership: { count: jest.fn(async () => 1) },
    contact: { count: jest.fn(async () => 0) },
  };
  const svc = new MembersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    // MediaAssetsService : la suppression d'un membre ne touche pas aux
    // médias, un double vide suffit.
    {} as never,
  );
  return { svc, prisma };
}

describe('MembersService.deleteMember — avances versées (ADR-0022)', () => {
  it('refuse : l’argent versé d’avance reste au crédit du membre', async () => {
    const { svc, prisma } = service([
      { id: 'recu-1', clubId: 'club-1', payerCreditMemberId: 'm-camille', payerCreditContactId: null },
    ]);

    const refus = svc.deleteMember('club-1', 'm-camille');

    await expect(refus).rejects.toBeInstanceOf(BadRequestException);
    await expect(refus).rejects.toThrow('versé des avances');
    expect(prisma.member.delete).not.toHaveBeenCalled();
  });

  it('supprime quand aucune avance ne désigne ce membre dans ce club', async () => {
    const { svc, prisma } = service([
      { id: 'recu-autre', clubId: 'club-1', payerCreditMemberId: 'm-autre', payerCreditContactId: null },
      // Même identifiant, colonne du contact : seule la colonne du membre compte.
      { id: 'recu-contact', clubId: 'club-1', payerCreditMemberId: null, payerCreditContactId: 'm-camille' },
      { id: 'recu-ailleurs', clubId: 'club-2', payerCreditMemberId: 'm-camille', payerCreditContactId: null },
    ]);

    await svc.deleteMember('club-1', 'm-camille');

    expect(prisma.member.delete).toHaveBeenCalledWith({ where: { id: 'm-camille' } });
  });
});
