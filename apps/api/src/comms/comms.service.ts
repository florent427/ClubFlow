import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { CommunicationChannel, MemberStatus } from '@prisma/client';
import {
  memberMatchesDynamicGroup,
  type DynamicGroupCriteria,
} from '../members/dynamic-group-matcher';
import { MembersService } from '../members/members.service';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { PrismaService } from '../prisma/prisma.service';
import { aggregateForParent } from './notification-aggregator';
import type { CreateMessageCampaignInput } from './dto/create-message-campaign.input';

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
