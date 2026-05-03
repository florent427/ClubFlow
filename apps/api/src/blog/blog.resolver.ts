import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { BlogService } from './blog.service';
import { CreateBlogPostInput } from './dto/create-blog-post.input';
import { UpdateBlogPostInput } from './dto/update-blog-post.input';
import { BlogPostGraph } from './models/blog-post.model';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.BLOG)
export class BlogAdminResolver {
  constructor(private readonly service: BlogService) {}

  @Query(() => [BlogPostGraph], { name: 'clubBlogPosts' })
  clubBlogPosts(@CurrentClub() club: Club): Promise<BlogPostGraph[]> {
    return this.service.listAdmin(club.id) as Promise<BlogPostGraph[]>;
  }

  @Mutation(() => BlogPostGraph)
  createClubBlogPost(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateBlogPostInput,
  ): Promise<BlogPostGraph> {
    return this.service.create(club.id, user.userId, input) as Promise<BlogPostGraph>;
  }

  @Mutation(() => BlogPostGraph)
  updateClubBlogPost(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateBlogPostInput,
  ): Promise<BlogPostGraph> {
    return this.service.update(club.id, input.id, {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      body: input.body,
      coverImageUrl: input.coverImageUrl,
    }) as Promise<BlogPostGraph>;
  }

  @Mutation(() => BlogPostGraph)
  publishClubBlogPost(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BlogPostGraph> {
    return this.service.publish(club.id, id) as Promise<BlogPostGraph>;
  }

  @Mutation(() => BlogPostGraph)
  archiveClubBlogPost(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BlogPostGraph> {
    return this.service.archive(club.id, id) as Promise<BlogPostGraph>;
  }

  @Mutation(() => Boolean)
  deleteClubBlogPost(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.delete(club.id, id);
  }
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.BLOG)
export class BlogViewerResolver {
  constructor(private readonly service: BlogService) {}

  @Query(() => [BlogPostGraph], { name: 'viewerClubBlogPosts' })
  viewerClubBlogPosts(@CurrentClub() club: Club): Promise<BlogPostGraph[]> {
    return this.service.listPublished(club.id) as Promise<BlogPostGraph[]>;
  }

  @Query(() => BlogPostGraph, { name: 'viewerClubBlogPost', nullable: true })
  async viewerClubBlogPost(
    @CurrentClub() club: Club,
    @Args('slug') slug: string,
  ): Promise<BlogPostGraph | null> {
    try {
      return (await this.service.getBySlug(club.id, slug)) as BlogPostGraph;
    } catch {
      return null;
    }
  }
}
