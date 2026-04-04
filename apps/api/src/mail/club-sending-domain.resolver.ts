import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  ClubSendingDomainPurpose,
  type Club,
  type ClubSendingDomain,
} from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubSendingDomainService } from './club-sending-domain.service';
import { CreateClubSendingDomainInput } from './dto/create-club-sending-domain.input';
import { SendTransactionalTestEmailInput } from './dto/send-transactional-test-email.input';
import {
  ClubHostedMailOfferGraph,
  ClubSendingDomainGraph,
} from './models/club-sending-domain.model';
import type { MailDnsRecord } from './mail-transport.interface';
import { MailDnsRecordGraph } from './models/mail-dns-record.model';
import { TransactionalMailService } from './transactional-mail.service';
import {
  fqdnIsUnderHostedSuffix,
  getClubflowHostedMailSuffix,
  slugToMailDnsLabel,
} from './hosted-mail.utils';

function mapRecords(json: string | null): MailDnsRecordGraph[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json) as MailDnsRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl ?? null,
      priority: r.priority ?? null,
    }));
  } catch {
    return [];
  }
}

function mapRowToGraph(r: ClubSendingDomain): ClubSendingDomainGraph {
  const suf = getClubflowHostedMailSuffix();
  return {
    id: r.id,
    fqdn: r.fqdn,
    purpose: r.purpose,
    verificationStatus: r.verificationStatus,
    lastCheckedAt: r.lastCheckedAt,
    dnsRecords: mapRecords(r.dnsRecordsJson),
    webhookUrlHint: null,
    isClubflowHosted: !!(suf && fqdnIsUnderHostedSuffix(r.fqdn, suf)),
  };
}

@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
export class ClubSendingDomainResolver {
  constructor(
    private readonly domains: ClubSendingDomainService,
    private readonly transactional: TransactionalMailService,
  ) {}

  @Query(() => ClubHostedMailOfferGraph, { name: 'clubHostedMailOffer' })
  clubHostedMailOffer(@CurrentClub() club: Club): ClubHostedMailOfferGraph {
    const suffix = getClubflowHostedMailSuffix();
    if (!suffix) {
      return { enabled: false, previewFqdn: null };
    }
    const fallback = `club${club.id.replace(/-/g, '').slice(0, 12)}`;
    const label = slugToMailDnsLabel(club.slug, fallback);
    return { enabled: true, previewFqdn: `${label}.${suffix}` };
  }

  @Query(() => [ClubSendingDomainGraph], { name: 'clubSendingDomains' })
  async clubSendingDomains(
    @CurrentClub() club: Club,
  ): Promise<ClubSendingDomainGraph[]> {
    const rows = await this.domains.listForClub(club.id);
    return rows.map((r) => mapRowToGraph(r));
  }

  @Mutation(() => ClubSendingDomainGraph)
  async createClubHostedSendingDomain(
    @CurrentClub() club: Club,
    @Args('purpose', { type: () => ClubSendingDomainPurpose })
    purpose: ClubSendingDomainPurpose,
  ): Promise<ClubSendingDomainGraph> {
    const r = await this.domains.createHostedDomain(club.id, purpose);
    return mapRowToGraph(r);
  }

  @Mutation(() => ClubSendingDomainGraph)
  async createClubSendingDomain(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubSendingDomainInput,
  ): Promise<ClubSendingDomainGraph> {
    const r = await this.domains.createDomain(club.id, input.fqdn, input.purpose);
    return mapRowToGraph(r);
  }

  @Mutation(() => ClubSendingDomainGraph)
  async refreshClubSendingDomainVerification(
    @CurrentClub() club: Club,
    @Args('domainId', { type: () => ID }) domainId: string,
  ): Promise<ClubSendingDomainGraph> {
    const r = await this.domains.refreshVerification(club.id, domainId);
    return mapRowToGraph(r);
  }

  @Mutation(() => Boolean)
  async deleteClubSendingDomain(
    @CurrentClub() club: Club,
    @Args('domainId', { type: () => ID }) domainId: string,
  ): Promise<boolean> {
    await this.domains.deleteDomain(club.id, domainId);
    return true;
  }

  @Mutation(() => Boolean)
  async sendClubTransactionalTestEmail(
    @CurrentClub() club: Club,
    @Args('input') input: SendTransactionalTestEmailInput,
  ): Promise<boolean> {
    await this.transactional.sendTestEmail(club.id, input.to);
    return true;
  }
}
