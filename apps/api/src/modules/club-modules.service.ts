import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ClubModule } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { ModuleRegistryService } from '../domain/module-registry/module-registry.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
  ) {}

  private async enabledCodes(clubId: string): Promise<Set<ModuleCode>> {
    const rows = await this.prisma.clubModule.findMany({
      where: { clubId, enabled: true },
      select: { moduleCode: true },
    });
    return new Set(rows.map((r) => r.moduleCode as ModuleCode));
  }

  async setClubModuleEnabled(
    clubId: string,
    moduleCode: ModuleCode,
    enabled: boolean,
  ): Promise<ClubModule> {
    if (moduleCode === ModuleCode.MEMBERS && !enabled) {
      throw new BadRequestException('MEMBERS module cannot be disabled');
    }

    const before = await this.enabledCodes(clubId);
    if (enabled) {
      this.registry.assertCanEnable(moduleCode, before);
    } else {
      this.registry.assertCanDisable(moduleCode, before);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      if (enabled) {
        return tx.clubModule.upsert({
          where: { clubId_moduleCode: { clubId, moduleCode } },
          create: {
            id: randomUUID(),
            clubId,
            moduleCode,
            enabled: true,
            enabledAt: now,
            disabledAt: null,
          },
          update: {
            enabled: true,
            enabledAt: now,
            disabledAt: null,
          },
        });
      }
      return tx.clubModule.upsert({
        where: { clubId_moduleCode: { clubId, moduleCode } },
        create: {
          id: randomUUID(),
          clubId,
          moduleCode,
          enabled: false,
          enabledAt: null,
          disabledAt: now,
        },
        update: {
          enabled: false,
          enabledAt: null,
          disabledAt: now,
        },
      });
    });
  }
}
