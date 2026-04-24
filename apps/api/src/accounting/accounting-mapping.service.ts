import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lookup compte comptable curated pour une source donnée (produit
 * d'adhésion, frais one-time, subvention, sponsoring, frais Stripe, etc.).
 *
 * Résolution en cascade :
 * 1) Mapping spécifique (clubId, sourceType, sourceId)
 * 2) Mapping par défaut (clubId, sourceType, null)
 * 3) Fallback hard-codé par sourceType → code PCG standard
 *
 * Si aucun mapping trouvé, retourne le compte fallback (706100 cotisations
 * pour INCOME, 606800 fournitures pour EXPENSE). L'admin peut toujours
 * reclassifier via l'UI.
 */
@Injectable()
export class AccountingMappingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Codes PCG par défaut, utilisés si aucun mapping custom trouvé. */
  private static readonly DEFAULT_ACCOUNTS: Record<string, string> = {
    MEMBERSHIP_PRODUCT: '706100',
    MEMBERSHIP_ONE_TIME_FEE: '708000',
    SHOP_PRODUCT: '708000',
    SUBSIDY: '740000',
    SPONSORSHIP_CASH: '754000',
    SPONSORSHIP_IN_KIND: '871000',
    STRIPE_FEE: '627000',
    BANK_ACCOUNT: '512000',
    REFUND: '706100',
    EXPENSE_GENERIC: '606800',
    INCOME_GENERIC: '758000',
  };

  async resolveAccountCode(
    clubId: string,
    sourceType: string,
    sourceId?: string | null,
  ): Promise<string> {
    // 1. Mapping spécifique (sourceType + sourceId)
    if (sourceId) {
      const specific = await this.prisma.accountingAccountMapping.findUnique({
        where: {
          clubId_sourceType_sourceId: {
            clubId,
            sourceType,
            sourceId,
          },
        },
      });
      if (specific) return specific.accountCode;
    }

    // 2. Mapping par défaut (sourceType, sourceId null)
    const generic = await this.prisma.accountingAccountMapping.findFirst({
      where: { clubId, sourceType, sourceId: null },
    });
    if (generic) return generic.accountCode;

    // 3. Fallback hard-codé
    return (
      AccountingMappingService.DEFAULT_ACCOUNTS[sourceType] ??
      AccountingMappingService.DEFAULT_ACCOUNTS.EXPENSE_GENERIC
    );
  }

  async resolveAccountWithLabel(
    clubId: string,
    sourceType: string,
    sourceId?: string | null,
  ): Promise<{ code: string; label: string }> {
    const code = await this.resolveAccountCode(clubId, sourceType, sourceId);
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
      select: { code: true, label: true },
    });
    return {
      code,
      label: account?.label ?? `Compte ${code}`,
    };
  }

  async upsertMapping(
    clubId: string,
    sourceType: string,
    sourceId: string | null,
    accountCode: string,
  ) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: accountCode } },
    });
    if (!account) {
      throw new NotFoundException(
        `Compte ${accountCode} introuvable dans le plan du club.`,
      );
    }
    // Postgres permet plusieurs NULL dans un index unique composite → on
    // fait un findFirst + update|create manuel (le generator Prisma exige
    // une valeur string pour la clé composite si sourceId est nullable).
    const existing = await this.prisma.accountingAccountMapping.findFirst({
      where: { clubId, sourceType, sourceId: sourceId ?? null },
    });
    if (existing) {
      return this.prisma.accountingAccountMapping.update({
        where: { id: existing.id },
        data: { accountId: account.id, accountCode },
      });
    }
    return this.prisma.accountingAccountMapping.create({
      data: {
        clubId,
        sourceType,
        sourceId,
        accountId: account.id,
        accountCode,
      },
    });
  }

  async listMappings(clubId: string) {
    return this.prisma.accountingAccountMapping.findMany({
      where: { clubId },
      orderBy: [{ sourceType: 'asc' }, { sourceId: 'asc' }],
    });
  }

  async listAccounts(clubId: string) {
    return this.prisma.accountingAccount.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }
}
