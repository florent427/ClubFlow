import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailVerificationService', () => {
  const userId = 'user-1';
  let store: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
  }>;
  let svc: EmailVerificationService;

  beforeEach(() => {
    store = [];
    const prisma = {
      emailVerificationToken: {
        deleteMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
          for (let i = store.length - 1; i >= 0; i--) {
            if (store[i].userId === where.userId && store[i].consumedAt === null) {
              store.splice(i, 1);
            }
          }
        }),
        create: jest.fn(
          async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
            const row = {
              id: `t-${store.length}`,
              userId: data.userId,
              tokenHash: data.tokenHash,
              expiresAt: data.expiresAt,
              consumedAt: null,
            };
            store.push(row);
            return row;
          },
        ),
        findFirst: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
          const now = new Date();
          return (
            store.find(
              (r) =>
                r.tokenHash === where.tokenHash &&
                r.consumedAt === null &&
                r.expiresAt > now,
            ) ?? null
          );
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { consumedAt: Date };
          }) => {
            const r = store.find((x) => x.id === where.id);
            if (r) r.consumedAt = data.consumedAt;
            return r;
          },
        ),
      },
    } as unknown as PrismaService;
    process.env.EMAIL_VERIFICATION_SECRET = 'test-pepper';
    svc = new EmailVerificationService(prisma);
  });

  it('émet puis consomme un jeton une seule fois', async () => {
    const raw = await svc.issueTokenForUser(userId);
    expect(raw.length).toBeGreaterThan(10);
    const first = await svc.consumeRawToken(raw);
    expect(first?.userId).toBe(userId);
    const second = await svc.consumeRawToken(raw);
    expect(second).toBeNull();
  });
});
