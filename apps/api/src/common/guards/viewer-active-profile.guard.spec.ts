import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MemberStatus } from '@prisma/client';
import type { Request } from 'express';
import { FamiliesService } from '../../families/families.service';
import type { Member } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ViewerActiveProfileGuard } from './viewer-active-profile.guard';

describe('ViewerActiveProfileGuard', () => {
  const clubId = 'club-1';
  const userId = 'user-1';
  const memberId = 'member-1';

  let findFirst: jest.Mock;
  let families: jest.Mocked<Pick<FamiliesService, 'assertViewerHasProfile'>>;
  let guard: ViewerActiveProfileGuard;
  let gqlSpy: jest.SpyInstance;

  function ctxStub(): ExecutionContext {
    return {} as ExecutionContext;
  }

  function mockReq(partial: Partial<Request>): void {
    gqlSpy.mockImplementation(() => ({
      getContext: () => ({ req: partial as Request }),
    }));
  }

  beforeEach(() => {
    gqlSpy = jest.spyOn(GqlExecutionContext, 'create');
    findFirst = jest.fn();
    const prisma = {
      member: { findFirst },
    } as unknown as PrismaService;
    families = {
      assertViewerHasProfile: jest.fn().mockResolvedValue(undefined),
    };
    guard = new ViewerActiveProfileGuard(
      prisma,
      families as unknown as FamiliesService,
    );
  });

  afterEach(() => {
    gqlSpy.mockRestore();
  });

  it('rejette si pas de userId', async () => {
    mockReq({
      user: { userId: '', email: 'a@b.c', activeProfileMemberId: memberId },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejette si club absent sur la requête', async () => {
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: memberId },
      club: undefined,
    });
    await expect(guard.canActivate(ctxStub())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejette si profil actif absent', async () => {
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: null },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).rejects.toThrow(
      /Sélection de profil requise/,
    );
  });

  it('interdit si membre inconnu ou autre club', async () => {
    findFirst.mockResolvedValue(null);
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: memberId },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('interdit si membre inactif', async () => {
    findFirst.mockResolvedValue({
      id: memberId,
      clubId,
      status: MemberStatus.INACTIVE,
    } as Member);
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: memberId },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('propage assertViewerHasProfile', async () => {
    findFirst.mockResolvedValue({
      id: memberId,
      clubId,
      status: MemberStatus.ACTIVE,
    } as Member);
    families.assertViewerHasProfile.mockRejectedValue(
      new BadRequestException('Profil non accessible'),
    );
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: memberId },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('autorise le cas nominal', async () => {
    findFirst.mockResolvedValue({
      id: memberId,
      clubId,
      status: MemberStatus.ACTIVE,
    } as Member);
    mockReq({
      user: { userId, email: 'a@b.c', activeProfileMemberId: memberId },
      club: { id: clubId } as Request['club'],
    });
    await expect(guard.canActivate(ctxStub())).resolves.toBe(true);
    expect(families.assertViewerHasProfile).toHaveBeenCalledWith(
      userId,
      memberId,
    );
  });
});
