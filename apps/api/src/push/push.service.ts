import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/** Contenu d'une notification, tel que le service worker du portail le lit. */
export type PushMessage = {
  title: string;
  body: string;
  /** Chemin relatif au portail ouvert au clic (ex. `/messagerie?room=…`). */
  url?: string;
  /**
   * Sujet : deux notifications de même tag se remplacent au lieu de
   * s'empiler (ex. `room-<id>`), et le service push ne garde que la
   * dernière en attente pour un appareil hors ligne.
   */
  tag?: string;
  /** Re-signaler (son, vibration) même si une notification du même tag est affichée. */
  renotify?: boolean;
};

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export type PushSendReport = {
  /** Comptes visés (après déduplication). */
  targeted: number;
  /** Notifications acceptées par les services push. */
  sent: number;
  /** Abonnements révoqués côté navigateur, supprimés. */
  removed: number;
  /** Échecs temporaires (l'abonnement est conservé). */
  failed: number;
};

type Transport = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/** Au-delà, un abonnement qui échoue sans 404/410 est considéré mort. */
const MAX_CONSECUTIVE_FAILURES = 5;
/** Durée de rétention par le service push si l'appareil est hors ligne. */
const TTL_SECONDS = 24 * 3600;

/**
 * Envoi de notifications Web Push (standard navigateur : Chrome, Firefox,
 * Edge, Safari ≥ 16.4 en PWA installée).
 *
 * Désactivé, sans planter, tant que la paire VAPID n'est pas configurée :
 * `getPublicKey()` rend `null`, le portail masque l'option, et les envois
 * ne visent personne. Les erreurs d'envoi ne remontent jamais à l'appelant :
 * une notification ratée ne doit pas faire échouer un message ou une
 * campagne.
 */
@Injectable()
export class WebPushService {
  private readonly log = new Logger(WebPushService.name);
  private readonly publicKey: string | null;
  private transport: Transport;

  constructor(private readonly prisma: PrismaService) {
    const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
    const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '';
    const subject =
      process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ||
      'https://clubflow.topdigital.re';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.publicKey = pub;
    } else {
      this.publicKey = null;
      this.log.warn(
        'Web Push désactivé : WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY absents.',
      );
    }
    this.transport = (subscription, payload, options) =>
      webpush.sendNotification(subscription, payload, options);
  }

  get enabled(): boolean {
    return this.publicKey !== null;
  }

  /** Clé publique VAPID à donner au navigateur (`applicationServerKey`). */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /** Tests : remplace l'envoi réseau. */
  useTransport(transport: Transport): void {
    this.transport = transport;
  }

  /**
   * Un endpoint est propre à un navigateur : si un autre compte se connecte
   * sur le même appareil, l'abonnement suit le compte courant plutôt que
   * de notifier l'ancien.
   */
  async register(
    userId: string,
    clubId: string | null,
    input: PushSubscriptionInput,
  ): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        clubId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
      update: {
        userId,
        clubId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        failureCount: 0,
      },
    });
  }

  async unregister(userId: string, endpoint: string): Promise<boolean> {
    const r = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
    return r.count > 0;
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { userId } });
  }

  /** Résout les fiches adhérent vers leurs comptes (celles sans compte sont ignorées). */
  async sendToMembers(
    memberIds: string[],
    message: PushMessage,
  ): Promise<PushSendReport> {
    const ids = [...new Set(memberIds)];
    if (!this.enabled || ids.length === 0) {
      return { targeted: 0, sent: 0, removed: 0, failed: 0 };
    }
    const members = await this.prisma.member.findMany({
      where: { id: { in: ids }, userId: { not: null } },
      select: { userId: true },
    });
    const userIds = members
      .map((m) => m.userId)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    return this.sendToUsers(userIds, message);
  }

  async sendToUsers(
    userIds: string[],
    message: PushMessage,
  ): Promise<PushSendReport> {
    const ids = [...new Set(userIds)];
    const report: PushSendReport = {
      targeted: ids.length,
      sent: 0,
      removed: 0,
      failed: 0,
    };
    if (!this.enabled || ids.length === 0) return report;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: ids } },
    });
    const payload = JSON.stringify(message);
    const options: webpush.RequestOptions = {
      TTL: TTL_SECONDS,
      urgency: 'normal',
    };
    if (message.tag) {
      // Le topic Web Push est limité à 32 caractères URL-safe.
      options.topic = message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    }

    for (const s of subs) {
      try {
        await this.transport(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          options,
        );
        report.sent += 1;
        await this.prisma.pushSubscription
          .update({
            where: { id: s.id },
            data: { lastUsedAt: new Date(), failureCount: 0 },
          })
          .catch(() => undefined);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abonnement révoqué (permission retirée, navigateur réinstallé…).
          await this.prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => undefined);
          report.removed += 1;
          continue;
        }
        report.failed += 1;
        const failures = s.failureCount + 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          await this.prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => undefined);
          report.removed += 1;
        } else {
          await this.prisma.pushSubscription
            .update({ where: { id: s.id }, data: { failureCount: failures } })
            .catch(() => undefined);
        }
        this.log.warn(
          `push.send_failed status=${status ?? '?'} endpoint=${s.endpoint.slice(0, 48)}… : ${String(err)}`,
        );
      }
    }
    return report;
  }
}
