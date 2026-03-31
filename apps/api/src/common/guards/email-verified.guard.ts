import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../types/request-user';

/**
 * JWT présent mais e-mail non vérifié (parcours mot de passe) → 403.
 * À combiner avec GqlJwtAuthGuard.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gql = GqlExecutionContext.create(context);
    const req = gql.getContext().req as { user?: RequestUser };
    const userId = req.user?.userId;
    if (!userId) {
      return false;
    }
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!row?.emailVerifiedAt) {
      throw new ForbiddenException(
        'Adresse e-mail non vérifiée pour ce compte.',
      );
    }
    return true;
  }
}
