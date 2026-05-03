import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubSearchResults } from './models/club-search.model';

@Injectable()
export class ClubSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(clubId: string, q: string): Promise<ClubSearchResults> {
    const term = q.trim();
    if (term.length < 2) {
      return {
        members: [],
        contacts: [],
        events: [],
        blogPosts: [],
        announcements: [],
      };
    }
    const contains = { contains: term, mode: Prisma.QueryMode.insensitive };
    const [members, contacts, events, blogPosts, announcements] =
      await Promise.all([
        this.prisma.member.findMany({
          where: {
            clubId,
            OR: [
              { firstName: contains },
              { lastName: contains },
              { email: contains },
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          take: 8,
        }),
        this.prisma.contact.findMany({
          where: {
            clubId,
            OR: [{ firstName: contains }, { lastName: contains }],
          },
          select: { id: true, firstName: true, lastName: true },
          take: 8,
        }),
        this.prisma.clubEvent.findMany({
          where: {
            clubId,
            OR: [
              { title: contains },
              { description: contains },
              { location: contains },
            ],
          },
          select: { id: true, title: true, startsAt: true },
          orderBy: { startsAt: 'desc' },
          take: 6,
        }),
        this.prisma.blogPost.findMany({
          where: {
            clubId,
            OR: [{ title: contains }, { excerpt: contains }],
          },
          select: { id: true, title: true, slug: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.prisma.clubAnnouncement.findMany({
          where: {
            clubId,
            OR: [{ title: contains }, { body: contains }],
          },
          select: { id: true, title: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
      ]);

    return {
      members,
      contacts: contacts.map((c) => ({ ...c, email: null })),
      events,
      blogPosts,
      announcements,
    };
  }
}
