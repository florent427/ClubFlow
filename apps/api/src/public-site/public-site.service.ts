import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BlogPostStatus,
  ClubEventStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicSiteService {
  constructor(private readonly prisma: PrismaService) {}

  async getClubBySlug(slug: string) {
    const club = await this.prisma.club.findUnique({ where: { slug } });
    if (!club) throw new NotFoundException('Club introuvable');
    return club;
  }

  /**
   * Lookup d'un club par son `customDomain` (ex: "sksr.re", "monclub.fr").
   * Renvoie `null` si aucun club n'a ce domaine — la vitrine bascule alors
   * sur son fallback (env legacy ou 404 propre).
   */
  async getClubByDomain(domain: string) {
    const cleaned = domain.trim().toLowerCase();
    if (!cleaned) return null;
    return this.prisma.club.findUnique({ where: { customDomain: cleaned } });
  }

  async listAnnouncements(clubSlug: string, limit = 10) {
    const club = await this.getClubBySlug(clubSlug);
    return this.prisma.clubAnnouncement.findMany({
      where: { clubId: club.id, publishedAt: { not: null } },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: Math.max(1, Math.min(50, limit)),
    });
  }

  async listUpcomingEvents(clubSlug: string, limit = 20) {
    const club = await this.getClubBySlug(clubSlug);
    const now = new Date();
    return this.prisma.clubEvent.findMany({
      where: {
        clubId: club.id,
        status: ClubEventStatus.PUBLISHED,
        endsAt: { gte: now },
      },
      orderBy: { startsAt: 'asc' },
      take: Math.max(1, Math.min(50, limit)),
    });
  }

  async listBlogPosts(clubSlug: string, limit = 20) {
    const club = await this.getClubBySlug(clubSlug);
    return this.prisma.blogPost.findMany({
      where: {
        clubId: club.id,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });
  }

  async getBlogPost(clubSlug: string, postSlug: string) {
    const club = await this.getClubBySlug(clubSlug);
    const post = await this.prisma.blogPost.findFirst({
      where: {
        clubId: club.id,
        slug: postSlug,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
    });
    if (!post) throw new NotFoundException('Article introuvable');
    return post;
  }

  async listShopProducts(clubSlug: string) {
    const club = await this.getClubBySlug(clubSlug);
    return this.prisma.shopProduct.findMany({
      where: { clubId: club.id, active: true },
      orderBy: { name: 'asc' },
    });
  }
}
