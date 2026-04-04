import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MemberStatus } from '@prisma/client';
import type { Request } from 'express';
import { FamiliesService } from '../../families/families.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../types/request-user';

/**
 * Portail membre : JWT + club (ClubContextGuard) + profil actif cohérent avec le compte.
 * À placer après GqlJwtAuthGuard et ClubContextGuard.
 */
@Injectable()
export class ViewerActiveProfileGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const user = req.user as RequestUser | undefined;
    if (!user?.userId) {
      throw new UnauthorizedException();
    }
    const clubId = req.club?.id;
    if (!clubId) {
      throw new BadRequestException('X-Club-Id header is required');
    }
    const memberId = user.activeProfileMemberId;
    if (memberId?.trim()) {
      const member = await this.prisma.member.findFirst({
        where: { id: memberId, clubId },
      });
      if (!member) {
        throw new ForbiddenException();
      }
      if (member.status !== MemberStatus.ACTIVE) {
        throw new ForbiddenException();
      }
      await this.families.assertViewerHasProfile(user.userId, memberId);
      return true;
    }

    const contactId = user.activeProfileContactId;
    if (!contactId?.trim()) {
      throw new BadRequestException('Sélection de profil requise');
    }
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId: user.userId },
    });
    if (!contact) {
      throw new ForbiddenException();
    }
    await this.families.assertViewerHasContactProfile(user.userId, contactId);
    return true;
  }
}
