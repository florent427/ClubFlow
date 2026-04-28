import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  CommunicationChannel,
  MemberStatus,
} from '@prisma/client';
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
import { QuickMessageRecipientType } from './enums/quick-message-recipient.enum';

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

  async listCampaigns(clubId: string) {
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
    return rows.map((r) => ({
      ...r,
      recipientCount: map.get(r.id) ?? 0,
    }));
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
    return this.prisma.messageCampaign.create({
      data: {
        clubId,
        title: input.title,
        body: input.body,
        channel: input.channel,
        dynamicGroupId: input.dynamicGroupId ?? null,
      },
    });
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
    const updated = await this.prisma.messageCampaign.update({
      where: { id: input.campaignId },
      data: {
        title: input.title,
        body: input.body,
        channel: input.channel,
        dynamicGroupId: input.dynamicGroupId ?? null,
      },
    });
    const count = await this.prisma.messageCampaignRecipient.count({
      where: { campaignId: updated.id },
    });
    return { ...updated, recipientCount: count };
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

    const allMembers = await this.members.listMembers(clubId);
    const now = new Date();
    let criteria: DynamicGroupCriteria | null = null;
    if (campaign.dynamicGroupId) {
      criteria = await this.loadGroupCriteria(
        clubId,
        campaign.dynamicGroupId,
      );
      if (!criteria) {
        throw new BadRequestException('Groupe invalide');
      }
    }

    const matched = allMembers.filter((m) => {
      if (m.status !== MemberStatus.ACTIVE) {
        return false;
      }
      if (!criteria) {
        return true;
      }
      return memberMatchesDynamicGroup(
        {
          status: m.status,
          birthDate: m.birthDate,
          gradeLevelId: m.gradeLevelId,
        },
        criteria,
        now,
      );
    });

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

    const suppressedRows = await this.prisma.emailSuppression.findMany({
      where: { clubId },
      select: { emailNormalized: true },
    });
    const suppressed = new Set(suppressedRows.map((s) => s.emailNormalized));

    if (campaign.channel === CommunicationChannel.EMAIL) {
      const mailProfile = await this.sendingDomains.getVerifiedMailProfile(
        clubId,
        'campaign',
      );
      const emailByMemberId = new Map(
        matched.map((x) => [x.id, x.email?.trim() ?? '']),
      );
      const neededIds = new Set<string>(emailByMemberId.keys());
      const payerByAudienceId = new Map<string, string | null>();
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
      const extra = await this.prisma.member.findMany({
        where: { clubId, id: { in: [...neededIds] } },
        select: { id: true, email: true },
      });
      for (const row of extra) {
        emailByMemberId.set(row.id, row.email?.trim() ?? '');
      }

      const emailsSent = new Set<string>();
      for (const m of matched) {
        const payerMemberId = payerByAudienceId.get(m.id) ?? null;

        const agg = aggregateForParent(
          m.id,
          payerMemberId,
          campaign.title,
          campaign.body,
        );
        for (const targetId of agg.targetMemberIds) {
          const raw = emailByMemberId.get(targetId) ?? '';
          if (!raw) {
            continue;
          }
          const norm = raw.toLowerCase();
          if (suppressed.has(norm)) {
            continue;
          }
          if (emailsSent.has(norm)) {
            continue;
          }
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
    } else if (campaign.channel === CommunicationChannel.TELEGRAM) {
      const neededIds = new Set<string>(matched.map((x) => x.id));
      const payerByAudienceId = new Map<string, string | null>();
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
      const tgRows = await this.prisma.member.findMany({
        where: { clubId, id: { in: [...neededIds] } },
        select: { id: true, telegramChatId: true },
      });
      const chatByMemberId = new Map(
        tgRows.map((r) => [r.id, r.telegramChatId]),
      );
      const chatSent = new Set<string>();
      for (const m of matched) {
        const payerMemberId = payerByAudienceId.get(m.id) ?? null;
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
          if (chatSent.has(chatId)) {
            continue;
          }
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
    } else if (campaign.channel === CommunicationChannel.MESSAGING) {
      // Diffusion via la messagerie interne : on poste le message dans
      // chaque ChatRoom marqué `isBroadcastChannel = true` et qui contient
      // au moins un membre de l'audience cible. Le message est posté
      // « en tant que » chaque membre du salon ? Non — on choisit un
      // membre admin du salon pour signer. Si pas trouvé, on prend le
      // premier membre du salon (sender de service).
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
        const adminMember = room.members.find(
          (rm) => rm.role === 'ADMIN',
        );
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
    } else {
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
        const payerMemberId =
          famRow?.family.familyMembers[0]?.memberId ?? null;

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

    const count = await this.prisma.messageCampaignRecipient.count({
      where: { campaignId: campaign.id },
    });
    const updated = await this.prisma.messageCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    return { ...updated, recipientCount: count };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
