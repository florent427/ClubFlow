import { Injectable, Logger } from '@nestjs/common';
import type { UserNotification, UserNotificationKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService, type PushSendReport } from '../push/push.service';
import type { UserNotificationGraph } from './models/user-notification.model';

export type NotifyInput = {
  clubId: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  /**
   * Regroupement côté navigateur : deux pushs de même tag se remplacent au
   * lieu de s'empiler (ex. `campaign-<id>`). Par défaut, un tag par
   * notification.
   */
  tag?: string;
};

export type NotifyReport = PushSendReport & {
  /** Lignes créées dans le centre de notifications. */
  stored: number;
};

/** Corps du push : une ligne, 160 caractères maximum. */
export function pushExcerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Centre de notifications : chaque envoi « push » à une personne laisse une
 * trace lisible dans son portail (compte × club), lue ou non, et le push
 * n'est que le signal qui y mène. Ainsi un adhérent sans navigateur abonné,
 * ou qui a balayé la notification système, retrouve quand même le message.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: WebPushService,
  ) {}

  /** Une notification par compte, puis le push qui pointe dessus. */
  async notifyUsers(
    userIds: string[],
    input: NotifyInput,
  ): Promise<NotifyReport> {
    const ids = [...new Set(userIds)].filter((u) => u.length > 0);
    const report: NotifyReport = {
      stored: 0,
      targeted: ids.length,
      sent: 0,
      removed: 0,
      failed: 0,
    };
    const excerpt = pushExcerpt(input.body);
    for (const userId of ids) {
      const row = await this.prisma.userNotification.create({
        data: {
          userId,
          clubId: input.clubId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          url: null,
        },
        select: { id: true },
      });
      report.stored += 1;
      const r = await this.push.sendToUsers([userId], {
        title: input.title,
        body: excerpt,
        url: `/notifications?open=${row.id}`,
        tag: input.tag ?? `notif-${row.id}`,
        renotify: true,
      });
      report.sent += r.sent;
      report.removed += r.removed;
      report.failed += r.failed;
    }
    return report;
  }

  /** Résout les fiches adhérent vers leurs comptes (celles sans compte sont ignorées). */
  async notifyMembers(
    memberIds: string[],
    input: NotifyInput,
  ): Promise<NotifyReport> {
    const ids = [...new Set(memberIds)];
    if (ids.length === 0) {
      return { stored: 0, targeted: 0, sent: 0, removed: 0, failed: 0 };
    }
    const members = await this.prisma.member.findMany({
      where: { id: { in: ids }, userId: { not: null } },
      select: { userId: true },
    });
    const userIds = members
      .map((m) => m.userId)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    return this.notifyUsers(userIds, input);
  }

  async listForUser(
    userId: string,
    clubId: string,
    limit = 50,
  ): Promise<UserNotificationGraph[]> {
    const rows = await this.prisma.userNotification.findMany({
      where: { userId, clubId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(toGraph);
  }

  async unreadCount(userId: string, clubId: string): Promise<number> {
    return this.prisma.userNotification.count({
      where: { userId, clubId, readAt: null },
    });
  }

  /** Vrai si la notification appartenait au compte et n'était pas lue. */
  async markRead(userId: string, id: string): Promise<boolean> {
    const r = await this.prisma.userNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return r.count > 0;
  }

  async markAllRead(userId: string, clubId: string): Promise<number> {
    const r = await this.prisma.userNotification.updateMany({
      where: { userId, clubId, readAt: null },
      data: { readAt: new Date() },
    });
    this.log.debug(`notifications.mark_all_read user=${userId} count=${r.count}`);
    return r.count;
  }
}

function toGraph(row: UserNotification): UserNotificationGraph {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
