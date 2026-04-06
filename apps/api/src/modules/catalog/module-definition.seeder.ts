import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleCode } from '../../domain/module-registry/module-codes';

const MODULE_LABELS: Record<ModuleCode, string> = {
  [ModuleCode.MEMBERS]: 'Membres',
  [ModuleCode.FAMILIES]: 'Familles',
  [ModuleCode.PAYMENT]: 'Paiement',
  [ModuleCode.PLANNING]: 'Planning',
  [ModuleCode.COMMUNICATION]: 'Communication',
  [ModuleCode.MESSAGING]: 'Messagerie',
  [ModuleCode.ACCOUNTING]: 'Comptabilité',
  [ModuleCode.SUBSIDIES]: 'Subventions',
  [ModuleCode.SPONSORING]: 'Sponsoring',
  [ModuleCode.WEBSITE]: 'Site web',
  [ModuleCode.BLOG]: 'Blog',
  [ModuleCode.SHOP]: 'Boutique',
  [ModuleCode.CLUB_LIFE]: 'Vie du club',
  [ModuleCode.EVENTS]: 'Événements',
  [ModuleCode.BOOKING]: 'Réservations',
};

@Injectable()
export class ModuleDefinitionSeeder implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const code of Object.values(ModuleCode)) {
      await this.prisma.moduleDefinition.upsert({
        where: { code },
        create: {
          code,
          label: MODULE_LABELS[code],
          isRequired:
            code === ModuleCode.MEMBERS || code === ModuleCode.FAMILIES,
        },
        update: {
          label: MODULE_LABELS[code],
          isRequired:
            code === ModuleCode.MEMBERS || code === ModuleCode.FAMILIES,
        },
      });
    }
  }
}
