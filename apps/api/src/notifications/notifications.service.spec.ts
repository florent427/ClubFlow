import { UserNotificationKind } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { WebPushService } from '../push/push.service';
import { NotificationsService, pushExcerpt } from './notifications.service';

/**
 * Ce que ces tests protègent : le message doit exister dans le portail de
 * chaque personne visée AVANT et INDÉPENDAMMENT du push (c'est tout l'objet
 * du centre de notifications), le push doit mener à cette entrée précise,
 * et personne ne doit pouvoir marquer lue la notification d'un autre.
 */

function fakes(members: { id: string; userId: string | null }[] = []) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: Record<string, unknown> }> = [];
  let seq = 0;
  const prisma = {
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        seq += 1;
        return { id: `n${seq}` };
      },
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        updates.push({ where });
        return { count: 1 };
      },
      findMany: async () => [],
      count: async () => 0,
    },
    member: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        members
          .filter((m) => where.id.in.includes(m.id) && m.userId !== null)
          .map((m) => ({ userId: m.userId })),
    },
  } as unknown as PrismaService;

  const pushed: Array<{ userIds: string[]; msg: Record<string, unknown> }> = [];
  const push = {
    enabled: true,
    sendToUsers: async (userIds: string[], msg: Record<string, unknown>) => {
      pushed.push({ userIds, msg });
      return { targeted: userIds.length, sent: 1, removed: 0, failed: 0 };
    },
  } as unknown as WebPushService;

  return { prisma, push, created, updates, pushed };
}

const input = {
  clubId: 'club-1',
  kind: UserNotificationKind.QUICK_MESSAGE,
  title: 'Rappel',
  body: 'Le cours de samedi est avancé à 9 h.\n\nMerci.',
};

describe('NotificationsService', () => {
  it('crée une entrée par compte, dédupliquée, puis un push qui pointe dessus', async () => {
    const f = fakes();
    const svc = new NotificationsService(f.prisma, f.push);
    const r = await svc.notifyUsers(['u1', 'u2', 'u1'], input);

    expect(r.stored).toBe(2);
    expect(r.targeted).toBe(2);
    expect(f.created.map((c) => c.userId)).toEqual(['u1', 'u2']);
    expect(f.created[0]).toMatchObject({
      clubId: 'club-1',
      kind: 'QUICK_MESSAGE',
      title: 'Rappel',
      body: input.body,
    });
    expect(f.pushed).toHaveLength(2);
    expect(f.pushed[0].userIds).toEqual(['u1']);
    expect(f.pushed[0].msg.url).toBe('/notifications?open=n1');
    expect(f.pushed[1].msg.url).toBe('/notifications?open=n2');
    // Le push porte un extrait sur une ligne, l'entrée garde le texte entier.
    expect(f.pushed[0].msg.body).toBe('Le cours de samedi est avancé à 9 h. Merci.');
  });

  it('résout les fiches vers les comptes et ignore celles sans compte', async () => {
    const f = fakes([
      { id: 'm-parent', userId: 'u1' },
      { id: 'm-enfant', userId: 'u1' },
      { id: 'm-sans-compte', userId: null },
    ]);
    const svc = new NotificationsService(f.prisma, f.push);
    const r = await svc.notifyMembers(['m-parent', 'm-enfant', 'm-sans-compte'], {
      ...input,
      kind: UserNotificationKind.CAMPAIGN,
      tag: 'campaign-42',
    });
    expect(r.stored).toBe(1);
    expect(f.created).toHaveLength(1);
    expect(f.pushed[0].msg.tag).toBe('campaign-42');
  });

  it("marquer lue ne touche qu'aux notifications du compte appelant", async () => {
    const f = fakes();
    const svc = new NotificationsService(f.prisma, f.push);
    await svc.markRead('u1', 'n1');
    expect(f.updates[0].where).toMatchObject({ id: 'n1', userId: 'u1', readAt: null });
    await svc.markAllRead('u1', 'club-1');
    expect(f.updates[1].where).toMatchObject({ userId: 'u1', clubId: 'club-1', readAt: null });
  });

  it('pushExcerpt aplatit et coupe à 160 caractères', () => {
    expect(pushExcerpt('  a\n\nb   c ')).toBe('a b c');
    const long = 'x'.repeat(300);
    expect(pushExcerpt(long)).toHaveLength(160);
    expect(pushExcerpt(long).endsWith('…')).toBe(true);
  });
});
