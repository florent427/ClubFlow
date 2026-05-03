import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  MemberClubRole,
  CommunicationChannel,
  MembershipRole,
  MemberStatus,
  Prisma,
  type MessageCampaign,
} from '@prisma/client';
import type { MessageCampaignGraph } from './models/message-campaign.model';
import {
  memberMatchesDynamicGroup,
  type DynamicGroupCriteria,
} from '../members/dynamic-group-matcher';
import { MembersService } from '../members/members.service';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { MessagingGateway } from '../messaging/messaging.gateway';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { aggregateForParent } from './notification-aggregator';
import type { CreateMessageCampaignInput } from './dto/create-message-campaign.input';
import type { SendQuickMessageInput } from './dto/send-quick-message.input';
import type { UpdateMessageCampaignInput } from './dto/update-message-campaign.input';
import {
  AudienceAgeFilter,
  type AudienceFilterInput,
} from './dto/audience-filter.input';
import { QuickMessageRecipientType } from './enums/quick-message-recipient.enum';

/** Forme parsée du `audienceFilterJson` stocké en DB. */
type StoredAudienceFilter = {
  includeAllMembers?: boolean;
  dynamicGroupIds?: string[];
  membershipRoles?: MembershipRole[];
  clubMemberRoles?: MemberClubRole[];
  ageFilter?: AudienceAgeFilter;
  memberIds?: string[];
};

/**
 * Mappe une row Prisma `MessageCampaign` vers la forme GraphQL.
 * Sérialise `audienceFilterJson` en string (convention projet — pas de
 * graphql-type-json). Le client le parse côté front.
 */
function toCampaignGraph(
  row: MessageCampaign,
  recipientCount: number,
): MessageCampaignGraph {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    channel: row.channel,
    channels: row.channels ?? [],
    dynamicGroupId: row.dynamicGroupId,
    audienceFilterJson:
      row.audienceFilterJson === null || row.audienceFilterJson === undefined
        ? null
        : JSON.stringify(row.audienceFilterJson),
    status: row.status,
    sentAt: row.sentAt,
    recipientCount,
  };
}

/**
 * Phase F : résolution de l’audience **à l’envoi** (pas de snapshot stocké avant send).
 * Documenté intentionnellement pour MVP — passer en snapshot si besoin d’audits figés.
 */
@Injectable()
export class CommsService {
  private readonly log = new Logger(CommsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly sendingDomains: ClubSendingDomainService,
    private readonly telegram: TelegramApiService,
    private readonly messaging: MessagingService,
    private readonly messagingGateway: MessagingGateway,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  private async loadGroupCriteria(
    clubId: string,
    groupId: string,
  ): Promise<DynamicGroupCriteria | null> {
    const g = await this.prisma.dynamicGroup.findFirst({
      where: { id: groupId, clubId },
      include: { gradeFilters: true },
    });
    if (!g) {
      return null;
    }
    return {
      minAge: g.minAge,
      maxAge: g.maxAge,
      gradeLevelIds: g.gradeFilters.map((gf) => gf.gradeLevelId),
    };
  }

  /**
   * Calcule l'audience d'une campagne à partir d'un filtre riche.
   * Logique : UNION de tous les critères (un membre matchant N'IMPORTE
   * QUEL critère est inclus). Si filter null/vide ou
   * `includeAllMembers=true`, retourne tous les membres ACTIFS.
   *
   * Ordre des combinaisons :
   *  1. Si `includeAllMembers` → tous les actifs
   *  2. Sinon : sets unioniés depuis dynamicGroups + membershipRoles
   *     + clubMemberRoles + memberIds explicites
   *  3. Filtre age appliqué APRÈS l'union (intersection)
   *
   * Retourne uniquement les membres `MemberStatus.ACTIVE`.
   */
  async resolveAudienceMembers(
    clubId: string,
    filter: AudienceFilterInput | StoredAudienceFilter | null | undefined,
  ): Promise<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      birthDate: Date | null;
      email: string | null;
      gradeLevelId: string | null;
      status: MemberStatus;
    }>
  > {
    const allActive = (await this.members.listMembers(clubId)).filter(
      (m) => m.status === MemberStatus.ACTIVE,
    );
    const isEmptyFilter =
      !filter ||
      (!filter.dynamicGroupIds?.length &&
        !filter.membershipRoles?.length &&
        !filter.clubMemberRoles?.length &&
        !filter.memberIds?.length &&
        !filter.ageFilter);
    if (!filter || filter.includeAllMembers || isEmptyFilter) {
      // Cas "tous les membres actifs" — l'ageFilter peut quand même filtrer
      return this.applyAgeFilter(allActive, filter?.ageFilter);
    }

    // Calcule l'union de tous les critères
    const matchedIds = new Set<string>();

    // 1. Groupes dynamiques
    if (filter.dynamicGroupIds?.length) {
      const now = new Date();
      for (const gid of filter.dynamicGroupIds) {
        const criteria = await this.loadGroupCriteria(clubId, gid);
        if (!criteria) continue;
        for (const m of allActive) {
          if (matchedIds.has(m.id)) continue;
          if (
            memberMatchesDynamicGroup(
              {
                status: m.status,
                birthDate: m.birthDate,
                gradeLevelId: m.gradeLevelId,
              },
              criteria,
              now,
            )
          ) {
            matchedIds.add(m.id);
          }
        }
      }
    }

    // 2. Rôles MembershipRole (admin/board/coach/treasurer/etc.)
    // ClubMembership est porté par USER (pas Member). On résout
    // userIds → memberIds via Member.userId (filtré par clubId).
    if (filter.membershipRoles?.length) {
      const memberships = await this.prisma.clubMembership.findMany({
        where: {
          clubId,
          role: { in: filter.membershipRoles },
        },
        select: { userId: true },
      });
      const userIds = memberships
        .map((m) => m.userId)
        .filter((u): u is string => Boolean(u));
      if (userIds.length > 0) {
        const membersForUsers = await this.prisma.member.findMany({
          where: { clubId, userId: { in: userIds } },
          select: { id: true },
        });
        for (const m of membersForUsers) {
          matchedIds.add(m.id);
        }
      }
    }

    // 3. Rôles MemberClubRole (STUDENT/COACH/BOARD côté membre).
    // MemberRoleAssignment n'a pas de clubId direct → on filtre via la
    // relation `member.clubId`.
    if (filter.clubMemberRoles?.length) {
      const assignments = await this.prisma.memberRoleAssignment.findMany({
        where: {
          role: { in: filter.clubMemberRoles },
          member: { clubId },
        },
        select: { memberId: true },
      });
      for (const r of assignments) {
        matchedIds.add(r.memberId);
      }
    }

    // 4. Sélection individuelle
    if (filter.memberIds?.length) {
      for (const id of filter.memberIds) {
        matchedIds.add(id);
      }
    }

    const matched = allActive.filter((m) => matchedIds.has(m.id));
    return this.applyAgeFilter(matched, filter.ageFilter);
  }

  private applyAgeFilter<
    M extends { birthDate: Date | null },
  >(members: M[], ageFilter: AudienceAgeFilter | undefined): M[] {
    if (!ageFilter || ageFilter === AudienceAgeFilter.ALL) return members;
    const now = new Date();
    return members.filter((m) => {
      if (!m.birthDate) return false;
      const birth = new Date(m.birthDate);
      let age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && now.getDate() < birth.getDate())
      ) {
        age--;
      }
      return ageFilter === AudienceAgeFilter.ADULTS ? age >= 18 : age < 18;
    });
  }

  /**
   * Aperçu de l'audience pour l'UI : retourne le nombre de membres
   * matchés + un échantillon (5 max) de leurs noms complets pour
   * affichage live « N destinataires (Léa, Théo, +12) ».
   */
  async previewAudience(
    clubId: string,
    filter: AudienceFilterInput | null | undefined,
  ): Promise<{ count: number; sampleNames: string[] }> {
    const matched = await this.resolveAudienceMembers(clubId, filter);
    const sampleNames = matched
      .slice(0, 5)
      .map((m) => `${m.firstName} ${m.lastName}`.trim());
    return { count: matched.length, sampleNames };
  }

  async listCampaigns(clubId: string): Promise<MessageCampaignGraph[]> {
    const rows = await this.prisma.messageCampaign.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((r) => r.id);
    const counts = await this.prisma.messageCampaignRecipient.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });
    const map = new Map(
      counts.map((c) => [c.campaignId, c._count._all]),
    );
    return rows.map((r) => toCampaignGraph(r, map.get(r.id) ?? 0));
  }

  async createDraft(clubId: string, input: CreateMessageCampaignInput) {
    if (input.dynamicGroupId) {
      const ok = await this.prisma.dynamicGroup.findFirst({
        where: { id: input.dynamicGroupId, clubId },
      });
      if (!ok) {
        throw new BadRequestException('Groupe dynamique inconnu');
      }
    }
    // Multi-canal : `channels[]` prioritaire, fallback `channel` (legacy).
    // Le 1er canal de channels[] est aussi assigné à `channel` pour
    // compat avec les vieilles requêtes qui ne lisent que ce champ.
    const channels =
      input.channels && input.channels.length > 0
        ? input.channels
        : input.channel
          ? [input.channel]
          : [];
    if (channels.length === 0) {
      throw new BadRequestException(
        'Au moins un canal de diffusion requis (channels[] ou channel).',
      );
    }
    const created = await this.prisma.messageCampaign.create({
      data: {
        clubId,
        title: input.title,
        body: input.body,
        channel: channels[0], // legacy single
        channels: channels,
        dynamicGroupId: input.dynamicGroupId ?? null,
        audienceFilterJson: input.audience
          ? (JSON.parse(JSON.stringify(input.audience)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return toCampaignGraph(created, 0);
  }

  async updateDraft(clubId: string, input: UpdateMessageCampaignInput) {
    const existing = await this.prisma.messageCampaign.findFirst({
      where: { id: input.campaignId, clubId },
    });
    if (!existing) {
      throw new BadRequestException('Campagne introuvable');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Seuls les brouillons peuvent être modifiés');
    }
    if (input.dynamicGroupId) {
      const ok = await this.prisma.dynamicGroup.findFirst({
        where: { id: input.dynamicGroupId, clubId },
      });
      if (!ok) {
        throw new BadRequestException('Groupe dynamique inconnu');
      }
    }
    // Multi-canal : `channels[]` prioritaire, fallback sur `channel`
    // (legacy ou fourni explicitement). On garde `channel` synchronisé
    // avec channels[0] pour rétrocompat.
    const channels =
      input.channels && input.channels.length > 0
        ? input.channels
        : input.channel
          ? [input.channel]
          : existing.channels && existing.channels.length > 0
            ? existing.channels
            : [existing.channel];
    if (channels.length === 0) {
      throw new BadRequestException(
        'Au moins un canal de diffusion requis (channels[] ou channel).',
      );
    }
    const updated = await this.prisma.messageCampaign.update({
      where: { id: input.campaignId },
      data: {
        title: input.title,
        body: input.body,
        channel: channels[0],
        channels: channels,
        dynamicGroupId: input.dynamicGroupId ?? null,
        audienceFilterJson: input.audience
          ? (JSON.parse(JSON.stringify(input.audience)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    const count = await this.prisma.messageCampaignRecipient.count({
      where: { campaignId: updated.id },
    });
    return toCampaignGraph(updated, count);
  }

  async deleteDraft(clubId: string, campaignId: string): Promise<boolean> {
    const existing = await this.prisma.messageCampaign.findFirst({
      where: { id: campaignId, clubId },
    });
    if (!existing) {
      throw new BadRequestException('Campagne introuvable');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Seuls les brouillons peuvent être supprimés');
    }
    await this.prisma.messageCampaign.delete({
      where: { id: campaignId },
    });
    return true;
  }

  /**
   * Message ponctuel à un membre ou un contact (admin), hors entité campagne.
   * E-mail : domaine transactionnel vérifié. Autres canaux : journalisation (MVP).
   */
  async sendQuickMessage(
    clubId: string,
    input: SendQuickMessageInput,
  ): Promise<{ success: boolean }> {
    let emailTo: string | null = null;
    if (input.recipientType === QuickMessageRecipientType.MEMBER) {
      const m = await this.prisma.member.findFirst({
        where: { id: input.recipientId, clubId },
        select: { email: true },
      });
      if (!m) {
        throw new BadRequestException('Membre introuvable');
      }
      emailTo = m.email?.trim() ?? '';
    } else {
      const row = await this.prisma.contact.findFirst({
        where: { id: input.recipientId, clubId },
        include: { user: true },
      });
      if (!row) {
        throw new BadRequestException('Contact introuvable');
      }
      emailTo = row.user.email?.trim() ?? '';
    }

    const channels = [...new Set(input.channels)];
    for (const channel of channels) {
      if (channel === CommunicationChannel.EMAIL) {
        if (!emailTo || !emailTo.includes('@')) {
          throw new BadRequestException(
            'Aucune adresse e-mail utilisable pour ce destinataire',
          );
        }
        const norm = emailTo.toLowerCase();
        const suppressed = await this.prisma.emailSuppression.findFirst({
          where: { clubId, emailNormalized: norm },
        });
        if (suppressed) {
          throw new BadRequestException(
            'Envoi refusé : adresse en liste de suppression.',
          );
        }
        const mailProfile = await this.sendingDomains.getVerifiedMailProfile(
          clubId,
          'transactional',
        );
        await this.mail.sendEmail({
          clubId,
          kind: 'transactional',
          from: mailProfile.from,
          to: emailTo,
          subject: input.title,
          html: `<div style="white-space:pre-wrap">${escapeHtml(input.body)}</div>`,
          text: input.body,
        });
      } else if (channel === CommunicationChannel.TELEGRAM) {
        if (input.recipientType !== QuickMessageRecipientType.MEMBER) {
          throw new BadRequestException(
            'Telegram n’est disponible que pour les membres.',
          );
        }
        const mem = await this.prisma.member.findFirst({
          where: { id: input.recipientId, clubId },
          select: { telegramChatId: true },
        });
        if (!mem?.telegramChatId) {
          throw new BadRequestException(
            'Ce membre n’a pas relié Telegram (lien d’invitation dans la fiche).',
          );
        }
        await this.telegram.sendMessage(
          mem.telegramChatId,
          `${input.title}\n\n${input.body}`,
        );
      } else {
        this.log.log(
          JSON.stringify({
            event: 'comms.quick_stub',
            channel,
            recipientType: input.recipientType,
            recipientId: input.recipientId,
          }),
        );
      }
    }
    return { success: true };
  }

  async sendCampaign(clubId: string, campaignId: string) {
    const campaign = await this.prisma.messageCampaign.findFirst({
      where: { id: campaignId, clubId },
    });
    if (!campaign) {
      throw new BadRequestException('Campagne introuvable');
    }
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException('Campagne déjà envoyée');
    }

    // Résolution audience :
    // - audienceFilterJson présent → nouvelle voie (riche, multi-critères)
    // - sinon dynamicGroupId présent → legacy (groupe unique)
    // - sinon → tous les membres actifs
    let matched: Awaited<ReturnType<typeof this.resolveAudienceMembers>>;
    const storedFilter = campaign.audienceFilterJson as
      | StoredAudienceFilter
      | null
      | undefined;
    if (storedFilter) {
      matched = await this.resolveAudienceMembers(clubId, storedFilter);
    } else if (campaign.dynamicGroupId) {
      const criteria = await this.loadGroupCriteria(
        clubId,
        campaign.dynamicGroupId,
      );
      if (!criteria) {
        throw new BadRequestException('Groupe invalide');
      }
      const allMembers = await this.members.listMembers(clubId);
      const now = new Date();
      matched = allMembers.filter(
        (m) =>
          m.status === MemberStatus.ACTIVE &&
          memberMatchesDynamicGroup(
            {
              status: m.status,
              birthDate: m.birthDate,
              gradeLevelId: m.gradeLevelId,
            },
            criteria,
            now,
          ),
      );
    } else {
      const allMembers = await this.members.listMembers(clubId);
      matched = allMembers.filter((m) => m.status === MemberStatus.ACTIVE);
    }

    // Multi-canal : on prend `channels[]` si renseigné, sinon fallback
    // sur le `channel` legacy.
    const channels: CommunicationChannel[] =
      campaign.channels && campaign.channels.length > 0
        ? campaign.channels
        : [campaign.channel];

    await this.prisma.$transaction(async (tx) => {
      for (const m of matched) {
        await tx.messageCampaignRecipient.create({
          data: {
            campaignId: campaign.id,
            memberId: m.id,
          },
        });
      }
      await tx.messageCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    });

    // Pré-calcule la map des « payeurs » (Famille→PAYER) pour agrégation
    // parents. Servira aux canaux EMAIL / TELEGRAM (PUSH stub).
    const payerByAudienceId = new Map<string, string | null>();
    const neededIds = new Set<string>(matched.map((m) => m.id));
    for (const m of matched) {
      const famRow = await this.prisma.familyMember.findFirst({
        where: { memberId: m.id },
        include: {
          family: {
            include: {
              familyMembers: { where: { linkRole: 'PAYER' }, take: 1 },
            },
          },
        },
      });
      const payerId = famRow?.family.familyMembers[0]?.memberId ?? null;
      payerByAudienceId.set(m.id, payerId);
      if (payerId) {
        neededIds.add(payerId);
      }
    }

    // Diffuse sur chaque canal demandé (ne s'arrête pas à la 1re erreur).
    for (const channel of channels) {
      try {
        if (channel === CommunicationChannel.EMAIL) {
          await this.deliverEmail(clubId, campaign, matched, {
            payerByAudienceId,
            neededIds,
          });
        } else if (channel === CommunicationChannel.TELEGRAM) {
          await this.deliverTelegram(clubId, campaign, matched, {
            payerByAudienceId,
            neededIds,
          });
        } else if (channel === CommunicationChannel.MESSAGING) {
          await this.deliverMessaging(clubId, campaign, matched);
        } else {
          await this.deliverPushStub(campaign, matched, payerByAudienceId);
        }
      } catch (err) {
        this.log.error(
          `comms.channel_failed campaign=${campaign.id} channel=${channel}: ${err}`,
        );
      }
    }

    const count = await this.prisma.messageCampaignRecipient.count({
      where: { campaignId: campaign.id },
    });
    const updated = await this.prisma.messageCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    return toCampaignGraph(updated, count);
  }

  private async deliverEmail(
    clubId: string,
    campaign: { id: string; title: string; body: string },
    matched: Array<{ id: string; email: string | null }>,
    ctx: {
      payerByAudienceId: Map<string, string | null>;
      neededIds: Set<string>;
    },
  ): Promise<void> {
    const suppressedRows = await this.prisma.emailSuppression.findMany({
      where: { clubId },
      select: { emailNormalized: true },
    });
    const suppressed = new Set(suppressedRows.map((s) => s.emailNormalized));
    const mailProfile = await this.sendingDomains.getVerifiedMailProfile(
      clubId,
      'campaign',
    );
    const emailByMemberId = new Map<string, string>(
      matched.map((x) => [x.id, x.email?.trim() ?? '']),
    );
    const extra = await this.prisma.member.findMany({
      where: { clubId, id: { in: [...ctx.neededIds] } },
      select: { id: true, email: true },
    });
    for (const row of extra) {
      emailByMemberId.set(row.id, row.email?.trim() ?? '');
    }
    const emailsSent = new Set<string>();
    for (const m of matched) {
      const payerMemberId = ctx.payerByAudienceId.get(m.id) ?? null;
      const agg = aggregateForParent(
        m.id,
        payerMemberId,
        campaign.title,
        campaign.body,
      );
      for (const targetId of agg.targetMemberIds) {
        const raw = emailByMemberId.get(targetId) ?? '';
        if (!raw) continue;
        const norm = raw.toLowerCase();
        if (suppressed.has(norm)) continue;
        if (emailsSent.has(norm)) continue;
        emailsSent.add(norm);
        try {
          await this.mail.sendEmail({
            clubId,
            kind: 'campaign',
            from: mailProfile.from,
            to: raw,
            subject: campaign.title,
            html: `<div style="white-space:pre-wrap">${escapeHtml(
              campaign.body,
            )}</div>`,
            text: campaign.body,
          });
        } catch (err) {
          this.log.error(
            `comms.email_send_failed campaign=${campaign.id} to=${norm}: ${err}`,
          );
        }
      }
    }
  }

  private async deliverTelegram(
    clubId: string,
    campaign: { id: string; title: string; body: string },
    matched: Array<{ id: string }>,
    ctx: {
      payerByAudienceId: Map<string, string | null>;
      neededIds: Set<string>;
    },
  ): Promise<void> {
    const tgRows = await this.prisma.member.findMany({
      where: { clubId, id: { in: [...ctx.neededIds] } },
      select: { id: true, telegramChatId: true },
    });
    const chatByMemberId = new Map(
      tgRows.map((r) => [r.id, r.telegramChatId]),
    );
    const chatSent = new Set<string>();
    for (const m of matched) {
      const payerMemberId = ctx.payerByAudienceId.get(m.id) ?? null;
      const agg = aggregateForParent(
        m.id,
        payerMemberId,
        campaign.title,
        campaign.body,
      );
      for (const targetId of agg.targetMemberIds) {
        const chatId = chatByMemberId.get(targetId);
        if (!chatId) {
          this.log.warn(`comms.telegram_skip no_chat member=${targetId}`);
          continue;
        }
        if (chatSent.has(chatId)) continue;
        chatSent.add(chatId);
        try {
          await this.telegram.sendMessage(
            chatId,
            `${campaign.title}\n\n${campaign.body}`,
          );
        } catch (err) {
          this.log.error(
            `comms.telegram_send_failed campaign=${campaign.id} chat=${chatId}: ${err}`,
          );
        }
      }
    }
  }

  /**
   * Diffuse la campagne via la messagerie interne. Stratégie : on poste
   * le message dans chaque ChatRoom marqué `isBroadcastChannel = true` qui
   * contient au moins un membre de l'audience cible. Le sender est un
   * membre ADMIN du salon ; à défaut, le premier membre du salon.
   */
  private async deliverMessaging(
    clubId: string,
    campaign: { id: string; title: string; body: string },
    matched: Array<{ id: string }>,
  ): Promise<void> {
    const memberIdSet = new Set(matched.map((m) => m.id));
    const broadcastRooms = await this.prisma.chatRoom.findMany({
      where: {
        clubId,
        isBroadcastChannel: true,
        archivedAt: null,
      },
      include: { members: true },
    });
    const messageBody = `${campaign.title}\n\n${campaign.body}`;
    for (const room of broadcastRooms) {
      const inAudience = room.members.some((rm) =>
        memberIdSet.has(rm.memberId),
      );
      if (!inAudience) continue;
      const adminMember = room.members.find((rm) => rm.role === 'ADMIN');
      const sender = adminMember ?? room.members[0];
      if (!sender) continue;
      try {
        const msg = await this.messaging.postMessage(
          clubId,
          room.id,
          sender.memberId,
          messageBody,
        );
        this.messagingGateway.emitChatMessage(room.id, {
          id: msg.id,
          roomId: msg.roomId,
          body: msg.body,
          createdAt: msg.createdAt,
          parentMessageId: msg.parentMessageId,
          sender: {
            id: msg.sender.id,
            pseudo: msg.sender.pseudo,
            firstName: msg.sender.firstName,
            lastName: msg.sender.lastName,
          },
        });
      } catch (err) {
        this.log.error(
          `comms.messaging_send_failed campaign=${campaign.id} room=${room.id}: ${err}`,
        );
      }
    }
  }

  private async deliverPushStub(
    campaign: { id: string; title: string; body: string; channel: CommunicationChannel },
    matched: Array<{ id: string }>,
    payerByAudienceId: Map<string, string | null>,
  ): Promise<void> {
    for (const m of matched) {
      const payerMemberId = payerByAudienceId.get(m.id) ?? null;
      const agg = aggregateForParent(
        m.id,
        payerMemberId,
        campaign.title,
        campaign.body,
      );
      this.log.log(
        JSON.stringify({
          event: 'comms.push_stub',
          channel: campaign.channel,
          campaignId: campaign.id,
          ...agg,
        }),
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
