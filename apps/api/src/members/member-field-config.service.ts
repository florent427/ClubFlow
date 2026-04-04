import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MemberCatalogFieldKey,
  MemberCustomFieldType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberCustomFieldDefinitionInput } from './dto/create-member-custom-field-definition.input';
import { UpsertClubMemberCatalogFieldSettingInput } from './dto/upsert-club-member-catalog-field-settings.input';
import { UpdateMemberCustomFieldDefinitionInput } from './dto/update-member-custom-field-definition.input';
import { MemberCatalogFieldSettingGraph } from './models/member-catalog-field-setting.model';
import { MemberCustomFieldDefinitionGraph } from './models/member-custom-field-definition.model';

const CATALOG_KEYS_IN_ORDER = Object.values(MemberCatalogFieldKey);

@Injectable()
export class MemberFieldConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCatalogDefaultsForClub(clubId: string): Promise<void> {
    for (let i = 0; i < CATALOG_KEYS_IN_ORDER.length; i++) {
      const fieldKey = CATALOG_KEYS_IN_ORDER[i];
      await this.prisma.clubMemberFieldCatalogSetting.upsert({
        where: {
          clubId_fieldKey: { clubId, fieldKey },
        },
        create: {
          clubId,
          fieldKey,
          showOnForm: true,
          required: false,
          sortOrder: (i + 1) * 10,
        },
        update: {},
      });
    }
  }

  async listCatalogSettings(
    clubId: string,
  ): Promise<MemberCatalogFieldSettingGraph[]> {
    await this.ensureCatalogDefaultsForClub(clubId);
    const rows = await this.prisma.clubMemberFieldCatalogSetting.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { fieldKey: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      fieldKey: r.fieldKey,
      showOnForm: r.showOnForm,
      required: r.required,
      sortOrder: r.sortOrder,
    }));
  }

  async upsertCatalogSettings(
    clubId: string,
    items: UpsertClubMemberCatalogFieldSettingInput[],
  ): Promise<MemberCatalogFieldSettingGraph[]> {
    await this.ensureCatalogDefaultsForClub(clubId);
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.clubMemberFieldCatalogSetting.update({
          where: {
            clubId_fieldKey: {
              clubId,
              fieldKey: item.fieldKey,
            },
          },
          data: {
            ...(item.showOnForm !== undefined
              ? { showOnForm: item.showOnForm }
              : {}),
            ...(item.required !== undefined ? { required: item.required } : {}),
            ...(item.sortOrder !== undefined
              ? { sortOrder: item.sortOrder }
              : {}),
          },
        });
      }
    });
    return this.listCatalogSettings(clubId);
  }

  async listCustomFieldDefinitions(
    clubId: string,
  ): Promise<MemberCustomFieldDefinitionGraph[]> {
    const rows = await this.prisma.memberCustomFieldDefinition.findMany({
      where: { clubId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => this.toDefGraph(r));
  }

  toDefGraph(r: {
    id: string;
    clubId: string;
    code: string;
    label: string;
    type: MemberCustomFieldType;
    required: boolean;
    sortOrder: number;
    visibleToMember: boolean;
    optionsJson: string | null;
  }): MemberCustomFieldDefinitionGraph {
    return {
      id: r.id,
      clubId: r.clubId,
      code: r.code,
      label: r.label,
      type: r.type,
      required: r.required,
      sortOrder: r.sortOrder,
      visibleToMember: r.visibleToMember,
      optionsJson: r.optionsJson ?? null,
    };
  }

  async createCustomDefinition(
    clubId: string,
    input: CreateMemberCustomFieldDefinitionInput,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    const code = input.code.trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) {
      throw new BadRequestException(
        'Code invalide (lettre minuscule, chiffres, underscore, max 64 car.)',
      );
    }
    const existing = await this.prisma.memberCustomFieldDefinition.findFirst({
      where: { clubId, code },
    });
    if (existing) {
      throw new BadRequestException('Ce code de champ existe déjà');
    }
    if (
      input.type === MemberCustomFieldType.SELECT &&
      (!input.optionsJson || input.optionsJson.trim() === '')
    ) {
      throw new BadRequestException(
        'Champ SELECT : fournir optionsJson (JSON tableau de libellés)',
      );
    }
    if (input.optionsJson) {
      try {
        const parsed = JSON.parse(input.optionsJson) as unknown;
        if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
          throw new Error('bad');
        }
      } catch {
        throw new BadRequestException(
          'optionsJson doit être un JSON tableau de chaînes',
        );
      }
    }
    const row = await this.prisma.memberCustomFieldDefinition.create({
      data: {
        clubId,
        code,
        label: input.label.trim(),
        type: input.type,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
        visibleToMember: input.visibleToMember ?? false,
        optionsJson: input.optionsJson?.trim() || null,
      },
    });
    return this.toDefGraph(row);
  }

  async updateCustomDefinition(
    clubId: string,
    input: UpdateMemberCustomFieldDefinitionInput,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    const row = await this.prisma.memberCustomFieldDefinition.findFirst({
      where: { id: input.id, clubId, archivedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Champ personnalisé introuvable');
    }
    const nextType = input.type ?? row.type;
    const nextOptions =
      input.optionsJson !== undefined
        ? input.optionsJson === null || input.optionsJson.trim() === ''
          ? null
          : input.optionsJson.trim()
        : row.optionsJson;
    if (nextType === MemberCustomFieldType.SELECT) {
      const raw = nextOptions;
      if (!raw || raw.trim() === '') {
        throw new BadRequestException('Champ SELECT : optionsJson requis');
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
          throw new Error('bad');
        }
      } catch {
        throw new BadRequestException(
          'optionsJson doit être un JSON tableau de chaînes',
        );
      }
    }
    const updated = await this.prisma.memberCustomFieldDefinition.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.visibleToMember !== undefined
          ? { visibleToMember: input.visibleToMember }
          : {}),
        ...(input.optionsJson !== undefined
          ? {
              optionsJson:
                input.optionsJson === null || input.optionsJson.trim() === ''
                  ? null
                  : input.optionsJson.trim(),
            }
          : {}),
      },
    });
    return this.toDefGraph(updated);
  }

  async archiveCustomDefinition(
    clubId: string,
    id: string,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    const row = await this.prisma.memberCustomFieldDefinition.findFirst({
      where: { id, clubId, archivedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Champ personnalisé introuvable');
    }
    const updated = await this.prisma.memberCustomFieldDefinition.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return this.toDefGraph(updated);
  }

  /** Pour validation à l’enregistrement membre */
  async getCatalogSettingsMap(
    clubId: string,
  ): Promise<Map<MemberCatalogFieldKey, { required: boolean; showOnForm: boolean }>> {
    await this.ensureCatalogDefaultsForClub(clubId);
    const rows = await this.prisma.clubMemberFieldCatalogSetting.findMany({
      where: { clubId },
    });
    const m = new Map<
      MemberCatalogFieldKey,
      { required: boolean; showOnForm: boolean }
    >();
    for (const r of rows) {
      m.set(r.fieldKey, { required: r.required, showOnForm: r.showOnForm });
    }
    return m;
  }

  async getActiveCustomDefinitions(
    clubId: string,
  ): Promise<
    Prisma.MemberCustomFieldDefinitionGetPayload<object>[]
  > {
    return this.prisma.memberCustomFieldDefinition.findMany({
      where: { clubId, archivedAt: null },
    });
  }
}
