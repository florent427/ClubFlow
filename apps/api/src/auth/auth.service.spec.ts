import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
    const svc = new AuthService(prisma, jwt);
    await expect(
      svc.login({ email: 'a@b.c', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
