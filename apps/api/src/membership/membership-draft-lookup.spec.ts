import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { InvoiceLineKind, InvoiceStatus } from '@prisma/client';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipResolver } from './membership.resolver';
import { MembershipService } from './membership.service';

/**
 * Un brouillon d'adhésion se retrouve depuis la fiche du membre.
 *
 * Avant, il n'existait que dans l'état local de l'écran : fermer la fiche
 * avant « Finaliser » le faisait disparaître, et la garde anti-doublon
 * refusait d'en créer un autre. Il fallait aller le chercher dans Facturation
 * (audit du 2026-09-14, point 2.6).
 */
describe('MembershipService — retrouver le brouillon d’adhésion', () => {
  const brouillon = {
    id: 'inv-draft',
    clubId: 'club-1',
    status: InvoiceStatus.DRAFT,
  };

  function service(seasonId: string | null) {
    const prisma = {
      clubSeason: {
        findFirst: jest
          .fn()
          .mockResolvedValue(seasonId ? { id: seasonId } : null),
      },
      invoice: { findFirst: jest.fn().mockResolvedValue(brouillon) },
    };
    return {
      svc: new MembershipService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('cherche le brouillon de CE membre sur la saison active', async () => {
    const { svc, prisma } = service('saison-1');

    await expect(
      svc.findMembershipInvoiceDraft('club-1', 'm-1'),
    ).resolves.toEqual(brouillon);

    const where = prisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      clubId: 'club-1',
      clubSeasonId: 'saison-1',
      status: InvoiceStatus.DRAFT,
      lines: {
        some: {
          memberId: 'm-1',
          kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
        },
      },
    });
  });

  it('sans saison active, aucun brouillon, et la base n’est pas lue', async () => {
    const { svc, prisma } = service(null);

    await expect(
      svc.findMembershipInvoiceDraft('club-1', 'm-1'),
    ).resolves.toBeNull();
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
  });
});

describe('MembershipResolver — schéma GraphQL', () => {
  it('expose le brouillon d’adhésion du membre, nullable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([MembershipResolver]));

    expect(sdl).toContain(
      'memberMembershipInvoiceDraft(memberId: ID!): InvoiceGraph',
    );
    // Nullable : un membre sans brouillon est le cas courant, pas une erreur.
    expect(sdl).not.toContain(
      'memberMembershipInvoiceDraft(memberId: ID!): InvoiceGraph!',
    );
  });
});
