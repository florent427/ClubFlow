import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BlogPostStatus,
  ClubEventStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from '../shop/shop.service';

@Injectable()
export class PublicSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
  ) {}

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

  /**
   * Catalogue affiché sur la vitrine — donc à des visiteurs NON authentifiés,
   * hors de tout guard.
   *
   * Ce service lisait auparavant `shopProduct` directement, ce qui plaçait la
   * vitrine hors du module boutique : la moindre colonne ajoutée à la table
   * remontait mécaniquement jusqu'ici. Le passage par
   * `ShopService.listProductsPublic` fait entrer la vitrine par la même porte
   * que le portail membre — celle qui ne rend que des booléens de
   * disponibilité (`withQuantities: false`, ADR-0012).
   *
   * La projection ci-dessous est ensuite EXPLICITE, et c'est la garantie
   * réelle : une future quantité ajoutée en amont ne peut pas fuiter par
   * inadvertance, il faudrait l'écrire ici. Ni `available`, ni `onHand`, ni
   * `reorderThreshold`, ni le `stock` dérivé ne franchissent cette frontière.
   *
   * Le tri par nom et le prix de base du produit sont conservés à l'identique :
   * la vitrine n'affiche pas « à partir de », lui servir le prix minimum des
   * déclinaisons changerait silencieusement ce qu'elle annonce.
   */
  async listShopProducts(clubSlug: string) {
    const club = await this.getClubBySlug(clubSlug);
    const products = await this.shop.listProductsPublic(club.id);
    return products
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
}
