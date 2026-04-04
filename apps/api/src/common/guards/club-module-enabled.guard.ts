import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_CLUB_MODULE_KEY } from '../decorators/require-club-module.decorator';

@Injectable()
export class ClubModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const code = this.reflector.getAllAndOverride<ModuleCode>(
      REQUIRE_CLUB_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!code) {
      return true;
    }
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const clubId = req.club?.id;
    if (!clubId) {
      throw new ForbiddenException();
    }
    const row = await this.prisma.clubModule.findUnique({
      where: { clubId_moduleCode: { clubId, moduleCode: code } },
    });
    if (!row?.enabled) {
      throw new ForbiddenException(
        `Le module ${code} n’est pas activé pour ce club`,
      );
    }
    return true;
  }
}
