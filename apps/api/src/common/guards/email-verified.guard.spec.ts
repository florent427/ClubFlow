import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { EmailVerifiedGuard } from './email-verified.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('EmailVerifiedGuard', () => {
  it('refuse si emailVerifiedAt absent', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ emailVerifiedAt: null }),
      },
    } as unknown as PrismaService;
    const guard = new EmailVerifiedGuard(prisma);
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: { user: { userId: 'u1' } } }),
    } as unknown as GqlExecutionContext);
    await expect(
      guard.canActivate({
        getType: () => 'graphql',
      } as unknown as ExecutionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autorise si email vérifié', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ emailVerifiedAt: new Date() }),
      },
    } as unknown as PrismaService;
    const guard = new EmailVerifiedGuard(prisma);
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: { user: { userId: 'u1' } } }),
    } as unknown as GqlExecutionContext);
    await expect(
      guard.canActivate({
        getType: () => 'graphql',
      } as unknown as ExecutionContext),
    ).resolves.toBe(true);
  });
});
