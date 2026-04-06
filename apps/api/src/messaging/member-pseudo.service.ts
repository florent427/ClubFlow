import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPseudoBase,
  normalizePseudoInput,
} from './member-pseudo.util';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class MemberPseudoService {
  constructor(private readonly prisma: PrismaService) {}

  async pickAvailablePseudo(
    db: DbClient,
    clubId: string,
    firstName: string,
    lastName: string,
    excludeMemberId: string | null,
  ): Promise<string> {
    const base = buildPseudoBase(firstName, lastName);
    let n = 0;
    let candidate = base;
    for (;;) {
      const existing = await db.member.findFirst({
        where: {
          clubId,
          pseudo: candidate,
          ...(excludeMemberId
            ? { NOT: { id: excludeMemberId } }
            : {}),
        },
      });
      if (!existing) {
        return candidate;
      }
      n += 1;
      candidate = `${base}_${n}`;
    }
  }

  async updatePseudoForMember(
    clubId: string,
    memberId: string,
    newPseudoRaw: string,
  ): Promise<string> {
    const normalized = normalizePseudoInput(newPseudoRaw);
    if (normalized.length < 3 || normalized.length > 32) {
      throw new BadRequestException(
        'Le pseudo doit contenir entre 3 et 32 caractères (a-z, 0-9, _).',
      );
    }
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    const conflict = await this.prisma.member.findFirst({
      where: {
        clubId,
        pseudo: normalized,
        NOT: { id: memberId },
      },
    });
    if (conflict) {
      throw new BadRequestException('Ce pseudo est déjà utilisé dans ce club.');
    }
    await this.prisma.member.update({
      where: { id: memberId },
      data: { pseudo: normalized },
    });
    return normalized;
  }
}
