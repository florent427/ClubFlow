import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPostStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return base.length > 0 ? base : 'article';
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(clubId: string) {
    return this.prisma.blogPost.findMany({
      where: { clubId },
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async listPublished(clubId: string) {
    return this.prisma.blogPost.findMany({
      where: {
        clubId,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      orderBy: [{ publishedAt: 'desc' }],
    });
  }

  async getBySlug(clubId: string, slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        clubId,
        slug,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
    });
    if (!post) throw new NotFoundException('Article introuvable');
    return post;
  }

  async create(
    clubId: string,
    authorUserId: string,
    input: {
      title: string;
      slug?: string;
      excerpt?: string;
      body: string;
      coverImageUrl?: string;
      publishNow?: boolean;
    },
  ) {
    const baseSlug = input.slug ?? slugify(input.title);
    const slug = await this.uniqueSlug(clubId, baseSlug);
    const publishNow = input.publishNow === true;
    return this.prisma.blogPost.create({
      data: {
        clubId,
        authorUserId,
        slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        body: input.body,
        coverImageUrl: input.coverImageUrl ?? null,
        status: publishNow ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT,
        publishedAt: publishNow ? new Date() : null,
      },
    });
  }

  async update(
    clubId: string,
    id: string,
    input: {
      title?: string;
      slug?: string;
      excerpt?: string;
      body?: string;
      coverImageUrl?: string;
    },
  ) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    const data: Prisma.BlogPostUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      data.slug = await this.uniqueSlug(clubId, input.slug, existing.id);
    }
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.body !== undefined) data.body = input.body;
    if (input.coverImageUrl !== undefined) {
      data.coverImageUrl = input.coverImageUrl;
    }
    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async publish(clubId: string, id: string) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    return this.prisma.blogPost.update({
      where: { id },
      data: {
        status: BlogPostStatus.PUBLISHED,
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });
  }

  async archive(clubId: string, id: string) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Article introuvable');
    return this.prisma.blogPost.update({
      where: { id },
      data: { status: BlogPostStatus.ARCHIVED },
    });
  }

  async delete(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.blogPost.delete({ where: { id } });
    return true;
  }

  private async uniqueSlug(
    clubId: string,
    desired: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(desired);
    if (!base) throw new BadRequestException('slug invalide');
    let candidate = base;
    let n = 2;
    while (true) {
      const clash = await this.prisma.blogPost.findFirst({
        where: {
          clubId,
          slug: candidate,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${n}`;
      n += 1;
      if (n > 100) throw new BadRequestException('Impossible de générer un slug');
    }
  }
}
