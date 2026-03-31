import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertClubIdConfigured } from './club-env';

@Injectable()
export class ClubIdBootstrapService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await assertClubIdConfigured(this.prisma);
  }
}
