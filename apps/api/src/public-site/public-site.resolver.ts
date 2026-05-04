import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import {
  PublicAnnouncementGraph,
  PublicBlogPostGraph,
  PublicClubGraph,
  PublicEventGraph,
  PublicShopProductGraph,
} from './models/public-club.model';
import { PublicSiteService } from './public-site.service';

@Resolver()
export class PublicSiteResolver {
  constructor(private readonly service: PublicSiteService) {}

  @Query(() => PublicClubGraph, { name: 'publicClub' })
  publicClub(
    @Args('slug') slug: string,
  ): Promise<PublicClubGraph> {
    return this.service.getClubBySlug(slug) as Promise<PublicClubGraph>;
  }

  /**
   * Lookup d'un club par son `customDomain` configuré.
   * Utilisé par la vitrine SSR pour résoudre `sksr.re` → club SKSR.
   * Retourne `null` si aucun club ne possède ce domaine (vitrine fallback).
   */
  @Query(() => PublicClubGraph, { name: 'publicClubByDomain', nullable: true })
  async publicClubByDomain(
    @Args('domain') domain: string,
  ): Promise<PublicClubGraph | null> {
    const club = await this.service.getClubByDomain(domain);
    return club as PublicClubGraph | null;
  }

  @Query(() => [PublicAnnouncementGraph], { name: 'publicClubAnnouncements' })
  publicClubAnnouncements(
    @Args('clubSlug') clubSlug: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<PublicAnnouncementGraph[]> {
    return this.service.listAnnouncements(clubSlug, limit ?? 10) as Promise<
      PublicAnnouncementGraph[]
    >;
  }

  @Query(() => [PublicEventGraph], { name: 'publicClubEvents' })
  publicClubEvents(
    @Args('clubSlug') clubSlug: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<PublicEventGraph[]> {
    return this.service.listUpcomingEvents(clubSlug, limit ?? 20) as Promise<
      PublicEventGraph[]
    >;
  }

  @Query(() => [PublicBlogPostGraph], { name: 'publicClubBlogPosts' })
  publicClubBlogPosts(
    @Args('clubSlug') clubSlug: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<PublicBlogPostGraph[]> {
    return this.service.listBlogPosts(clubSlug, limit ?? 20) as Promise<
      PublicBlogPostGraph[]
    >;
  }

  @Query(() => PublicBlogPostGraph, { name: 'publicClubBlogPost' })
  publicClubBlogPost(
    @Args('clubSlug') clubSlug: string,
    @Args('postSlug') postSlug: string,
  ): Promise<PublicBlogPostGraph> {
    return this.service.getBlogPost(clubSlug, postSlug) as Promise<
      PublicBlogPostGraph
    >;
  }

  @Query(() => [PublicShopProductGraph], { name: 'publicClubShopProducts' })
  publicClubShopProducts(
    @Args('clubSlug') clubSlug: string,
  ): Promise<PublicShopProductGraph[]> {
    return this.service.listShopProducts(clubSlug) as Promise<
      PublicShopProductGraph[]
    >;
  }
}
