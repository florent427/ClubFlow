import * as webpush from 'web-push';
import type { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './push.service';

/**
 * Ce que ces tests protègent : l'envoi ne doit jamais casser l'appelant, un
 * abonnement révoqué doit disparaître (sinon chaque message réessaie un
 * endpoint mort), et deux fiches d'un même compte ne doivent produire
 * qu'une notification.
 */

type SubRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failureCount: number;
};

function fakePrisma(subs: SubRow[], members: { id: string; userId: string | null }[]) {
  const deleted: string[] = [];
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  const prisma = {
    pushSubscription: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        subs.filter((s) => where.userId.in.includes(s.userId)),
      delete: async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
        return {};
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        updated.push({ id: where.id, data });
        return {};
      },
    },
    member: {
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] } };
      }) =>
        members
          .filter((m) => where.id.in.includes(m.id) && m.userId !== null)
          .map((m) => ({ userId: m.userId })),
    },
  };
  return { prisma: prisma as unknown as PrismaService, deleted, updated };
}

function withVapid(): void {
  const keys = webpush.generateVAPIDKeys();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.WEB_PUSH_VAPID_SUBJECT = 'https://example.test';
}

function withoutVapid(): void {
  delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
}

describe('WebPushService', () => {
  const message = { title: 'Salon', body: 'Bonjour', url: '/messagerie' };

  it('sans clés VAPID : désactivé, aucune requête, aucune erreur', async () => {
    withoutVapid();
    const { prisma } = fakePrisma(
      [{ id: 's1', userId: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a', failureCount: 0 }],
      [],
    );
    const svc = new WebPushService(prisma);
    let calls = 0;
    svc.useTransport(async () => {
      calls += 1;
    });
    expect(svc.enabled).toBe(false);
    expect(svc.getPublicKey()).toBeNull();
    const r = await svc.sendToUsers(['u1'], message);
    expect(calls).toBe(0);
    expect(r).toEqual({ targeted: 1, sent: 0, removed: 0, failed: 0 });
  });

  it('supprime un abonnement révoqué (410) et garde les autres', async () => {
    withVapid();
    const { prisma, deleted } = fakePrisma(
      [
        { id: 'dead', userId: 'u1', endpoint: 'https://p/dead', p256dh: 'k', auth: 'a', failureCount: 0 },
        { id: 'ok', userId: 'u1', endpoint: 'https://p/ok', p256dh: 'k', auth: 'a', failureCount: 0 },
      ],
      [],
    );
    const svc = new WebPushService(prisma);
    svc.useTransport(async (sub) => {
      if (sub.endpoint.endsWith('/dead')) {
        throw Object.assign(new Error('Gone'), { statusCode: 410 });
      }
    });
    const r = await svc.sendToUsers(['u1'], message);
    expect(r).toEqual({ targeted: 1, sent: 1, removed: 1, failed: 0 });
    expect(deleted).toEqual(['dead']);
  });

  it('un échec temporaire est compté, l’abonnement reste jusqu’au 5e', async () => {
    withVapid();
    const { prisma, deleted, updated } = fakePrisma(
      [{ id: 's1', userId: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a', failureCount: 3 }],
      [],
    );
    const svc = new WebPushService(prisma);
    svc.useTransport(async () => {
      throw Object.assign(new Error('Too many'), { statusCode: 429 });
    });
    const r1 = await svc.sendToUsers(['u1'], message);
    expect(r1.failed).toBe(1);
    expect(deleted).toEqual([]);
    expect(updated.at(-1)?.data).toEqual({ failureCount: 4 });

    // 5e échec consécutif : purge.
    const again = fakePrisma(
      [{ id: 's1', userId: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a', failureCount: 4 }],
      [],
    );
    const svc2 = new WebPushService(again.prisma);
    svc2.useTransport(async () => {
      throw Object.assign(new Error('Too many'), { statusCode: 429 });
    });
    const r2 = await svc2.sendToUsers(['u1'], message);
    expect(r2.removed).toBe(1);
    expect(again.deleted).toEqual(['s1']);
  });

  it('résout les fiches vers les comptes, ignore celles sans compte, déduplique', async () => {
    withVapid();
    const { prisma } = fakePrisma(
      [{ id: 's1', userId: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a', failureCount: 0 }],
      [
        { id: 'm-parent', userId: 'u1' },
        { id: 'm-enfant', userId: 'u1' },
        { id: 'm-sans-compte', userId: null },
      ],
    );
    const svc = new WebPushService(prisma);
    const payloads: string[] = [];
    svc.useTransport(async (_sub, payload) => {
      payloads.push(payload);
    });
    const r = await svc.sendToMembers(
      ['m-parent', 'm-enfant', 'm-sans-compte', 'm-parent'],
      { ...message, tag: 'room-abc/def' },
    );
    expect(r).toEqual({ targeted: 1, sent: 1, removed: 0, failed: 0 });
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0])).toEqual({ ...message, tag: 'room-abc/def' });
  });

  it('le topic transmis au service push est le tag nettoyé (≤ 32 caractères URL-safe)', async () => {
    withVapid();
    const { prisma } = fakePrisma(
      [{ id: 's1', userId: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a', failureCount: 0 }],
      [],
    );
    const svc = new WebPushService(prisma);
    let topic: string | undefined;
    svc.useTransport(async (_sub, _payload, options) => {
      topic = options.topic;
    });
    await svc.sendToUsers(['u1'], {
      ...message,
      tag: 'room-0f3a5c2e-9b1d-4e7a-8c6f-1234567890ab',
    });
    expect(topic).toBeDefined();
    expect(topic!.length).toBeLessThanOrEqual(32);
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
