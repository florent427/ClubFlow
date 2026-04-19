import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubSurveyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ViewerIdentity = {
  memberId?: string | null;
  contactId?: string | null;
};

@Injectable()
export class ClubLifeService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Announcements ---

  async listAnnouncementsAdmin(clubId: string) {
    return this.prisma.clubAnnouncement.findMany({
      where: { clubId },
      orderBy: [
        { pinned: 'desc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async listPublishedAnnouncements(clubId: string) {
    return this.prisma.clubAnnouncement.findMany({
      where: { clubId, publishedAt: { not: null } },
      orderBy: [
        { pinned: 'desc' },
        { publishedAt: 'desc' },
      ],
    });
  }

  async createAnnouncement(
    clubId: string,
    authorUserId: string,
    input: {
      title: string;
      body: string;
      pinned?: boolean;
      publishNow?: boolean;
    },
  ) {
    return this.prisma.clubAnnouncement.create({
      data: {
        clubId,
        authorUserId,
        title: input.title,
        body: input.body,
        pinned: input.pinned === true,
        publishedAt: input.publishNow === false ? null : new Date(),
      },
    });
  }

  async updateAnnouncement(
    clubId: string,
    id: string,
    input: { title?: string; body?: string; pinned?: boolean },
  ) {
    const existing = await this.prisma.clubAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Annonce introuvable');
    }
    const data: Prisma.ClubAnnouncementUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;
    if (input.pinned !== undefined) data.pinned = input.pinned;
    return this.prisma.clubAnnouncement.update({ where: { id }, data });
  }

  async publishAnnouncement(clubId: string, id: string) {
    const existing = await this.prisma.clubAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Annonce introuvable');
    if (existing.publishedAt) return existing;
    return this.prisma.clubAnnouncement.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
  }

  async deleteAnnouncement(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.clubAnnouncement.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.clubAnnouncement.delete({ where: { id } });
    return true;
  }

  // --- Surveys ---

  async listSurveysAdmin(clubId: string, viewer: ViewerIdentity) {
    const rows = await this.prisma.clubSurvey.findMany({
      where: { clubId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    return rows.map((s) => this.toSurveyGraph(s, viewer));
  }

  async listPublishedSurveys(clubId: string, viewer: ViewerIdentity) {
    const rows = await this.prisma.clubSurvey.findMany({
      where: {
        clubId,
        status: { in: [ClubSurveyStatus.OPEN, ClubSurveyStatus.CLOSED] },
        publishedAt: { not: null },
      },
      orderBy: [{ publishedAt: 'desc' }],
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    return rows.map((s) => this.toSurveyGraph(s, viewer));
  }

  async createSurvey(
    clubId: string,
    authorUserId: string,
    input: {
      title: string;
      description?: string;
      options: string[];
      multipleChoice?: boolean;
      allowAnonymous?: boolean;
      closesAt?: Date;
      publishNow?: boolean;
    },
  ) {
    const publishNow = input.publishNow !== false;
    const survey = await this.prisma.clubSurvey.create({
      data: {
        clubId,
        authorUserId,
        title: input.title,
        description: input.description ?? null,
        multipleChoice: input.multipleChoice === true,
        allowAnonymous: input.allowAnonymous === true,
        closesAt: input.closesAt ?? null,
        status: publishNow ? ClubSurveyStatus.OPEN : ClubSurveyStatus.DRAFT,
        publishedAt: publishNow ? new Date() : null,
        options: {
          create: input.options.map((label, idx) => ({
            label,
            sortOrder: idx,
          })),
        },
      },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    return this.toSurveyGraph(survey, {});
  }

  async openSurvey(clubId: string, id: string, viewer: ViewerIdentity) {
    const existing = await this.prisma.clubSurvey.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Sondage introuvable');
    const updated = await this.prisma.clubSurvey.update({
      where: { id },
      data: {
        status: ClubSurveyStatus.OPEN,
        publishedAt: existing.publishedAt ?? new Date(),
      },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    return this.toSurveyGraph(updated, viewer);
  }

  async closeSurvey(clubId: string, id: string, viewer: ViewerIdentity) {
    const existing = await this.prisma.clubSurvey.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Sondage introuvable');
    const updated = await this.prisma.clubSurvey.update({
      where: { id },
      data: { status: ClubSurveyStatus.CLOSED },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    return this.toSurveyGraph(updated, viewer);
  }

  async deleteSurvey(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.clubSurvey.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.clubSurvey.delete({ where: { id } });
    return true;
  }

  async respondToSurvey(
    clubId: string,
    viewer: ViewerIdentity,
    input: { surveyId: string; optionIds: string[] },
  ) {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis pour répondre.');
    }
    const survey = await this.prisma.clubSurvey.findFirst({
      where: { id: input.surveyId, clubId },
      include: { options: true },
    });
    if (!survey) throw new NotFoundException('Sondage introuvable');
    if (survey.status !== ClubSurveyStatus.OPEN) {
      throw new BadRequestException('Ce sondage est fermé.');
    }
    if (survey.closesAt && survey.closesAt < new Date()) {
      throw new BadRequestException('Ce sondage est clôturé.');
    }
    const validIds = new Set(survey.options.map((o) => o.id));
    const chosen = Array.from(new Set(input.optionIds));
    for (const id of chosen) {
      if (!validIds.has(id)) {
        throw new BadRequestException('Option invalide.');
      }
    }
    if (!survey.multipleChoice && chosen.length > 1) {
      throw new BadRequestException('Une seule réponse autorisée.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clubSurveyResponse.deleteMany({
        where: {
          surveyId: survey.id,
          ...(viewer.memberId
            ? { memberId: viewer.memberId }
            : { contactId: viewer.contactId }),
        },
      });
      if (chosen.length > 0) {
        await tx.clubSurveyResponse.createMany({
          data: chosen.map((optionId) => ({
            surveyId: survey.id,
            optionId,
            memberId: viewer.memberId ?? null,
            contactId: viewer.memberId ? null : viewer.contactId ?? null,
          })),
        });
      }
    });

    const full = await this.prisma.clubSurvey.findUnique({
      where: { id: survey.id },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        responses: true,
      },
    });
    if (!full) throw new NotFoundException('Sondage introuvable');
    return this.toSurveyGraph(full, viewer);
  }

  private toSurveyGraph(
    survey: Prisma.ClubSurveyGetPayload<{
      include: { options: true; responses: true };
    }>,
    viewer: ViewerIdentity,
  ) {
    const counts = new Map<string, number>();
    for (const r of survey.responses) {
      counts.set(r.optionId, (counts.get(r.optionId) ?? 0) + 1);
    }
    const viewerSelectedOptionIds: string[] = [];
    if (viewer.memberId) {
      for (const r of survey.responses) {
        if (r.memberId === viewer.memberId) {
          viewerSelectedOptionIds.push(r.optionId);
        }
      }
    } else if (viewer.contactId) {
      for (const r of survey.responses) {
        if (r.contactId === viewer.contactId) {
          viewerSelectedOptionIds.push(r.optionId);
        }
      }
    }
    return {
      id: survey.id,
      clubId: survey.clubId,
      authorUserId: survey.authorUserId,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      multipleChoice: survey.multipleChoice,
      allowAnonymous: survey.allowAnonymous,
      publishedAt: survey.publishedAt,
      closesAt: survey.closesAt,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
      options: survey.options.map((o) => ({
        id: o.id,
        surveyId: o.surveyId,
        label: o.label,
        sortOrder: o.sortOrder,
        responseCount: counts.get(o.id) ?? 0,
      })),
      totalResponses: survey.responses.length,
      viewerSelectedOptionIds,
    };
  }
}
