import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('good', 8);
  });

  it('lance Unauthorized si mot de passe incorrect', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash,
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const families = {
      listViewerProfiles: jest.fn().mockResolvedValue([]),
    } as unknown as FamiliesService;
    const svc = new AuthService(prisma, jwt, families);
    await expect(
      svc.login({ email: 'a@b.c', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lance Unauthorized si compte sans mot de passe (OAuth uniquement)', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash: null,
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const families = {
      listViewerProfiles: jest.fn(),
    } as unknown as FamiliesService;
    const svc = new AuthService(prisma, jwt, families);
    await expect(
      svc.login({ email: 'a@b.c', password: 'anything' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(families.listViewerProfiles).not.toHaveBeenCalled();
  });
});
