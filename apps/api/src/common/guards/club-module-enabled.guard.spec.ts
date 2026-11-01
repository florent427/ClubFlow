import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ApolloBaseDriver } from '@nestjs/apollo/dist/drivers/apollo-base.driver';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import type { Request } from 'express';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClubModuleEnabledGuard,
  MODULE_DISABLED_REASON,
} from './club-module-enabled.guard';

/**
 * Passe l'exception par le formateur d'erreurs du driver Apollo de Nest, celui
 * qui produit la réponse lue par l'admin : on teste ce qui part sur le réseau,
 * pas la forme de l'exception.
 */
function toWire(exception: unknown): GraphQLFormattedError {
  const transform = (
    ApolloBaseDriver.prototype as unknown as {
      createTransformHttpErrorFn: () => (
        formatted: GraphQLFormattedError,
        original: unknown,
      ) => GraphQLFormattedError;
    }
  ).createTransformHttpErrorFn();
  const original = new GraphQLError('resolver', {
    path: ['clubCourseSlots'],
    originalError: exception as Error,
  });
  const formatted: GraphQLFormattedError = {
    message: 'resolver',
    path: ['clubCourseSlots'],
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
  const wire = transform(formatted, original);
  return JSON.parse(JSON.stringify(wire)) as GraphQLFormattedError;
}

describe('ClubModuleEnabledGuard', () => {
  let findUnique: jest.Mock;
  let guard: ClubModuleEnabledGuard;

  beforeEach(() => {
    findUnique = jest.fn();
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(ModuleCode.PLANNING),
    } as unknown as Reflector;
    const prisma = {
      clubModule: { findUnique },
    } as unknown as PrismaService;
    guard = new ClubModuleEnabledGuard(reflector, prisma);
    jest.spyOn(GqlExecutionContext, 'create').mockImplementation(
      () =>
        ({
          getContext: () => ({ req: { club: { id: 'club-1' } } as Request }),
        }) as unknown as GqlExecutionContext,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  it('laisse passer quand le module est actif', async () => {
    findUnique.mockResolvedValue({ enabled: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('refuse un module coupé en FORBIDDEN, marqué MODULE_DISABLED sur le réseau', async () => {
    findUnique.mockResolvedValue({ enabled: false });
    const error = await guard.canActivate(ctx).catch((e: unknown) => e);
    const wire = toWire(error);
    expect(wire.message).toBe('Le module PLANNING n’est pas activé pour ce club');
    expect(wire.extensions?.code).toBe('FORBIDDEN');
    expect(wire.extensions?.originalError).toMatchObject({
      reason: MODULE_DISABLED_REASON,
      module: ModuleCode.PLANNING,
    });
  });

  it('refuse sans marque un appel sans club', async () => {
    jest.spyOn(GqlExecutionContext, 'create').mockImplementation(
      () =>
        ({
          getContext: () => ({ req: {} as Request }),
        }) as unknown as GqlExecutionContext,
    );
    const wire = toWire(await guard.canActivate(ctx).catch((e: unknown) => e));
    expect(wire.extensions?.code).toBe('FORBIDDEN');
    expect(
      (wire.extensions?.originalError as { reason?: string } | undefined)
        ?.reason,
    ).toBeUndefined();
  });
});
