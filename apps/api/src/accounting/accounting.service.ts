import { Injectable } from '@nestjs/common';
import { AccountingEntryKind } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async isAccountingEnabled(clubId: string): Promise<boolean> {
    const row = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.ACCOUNTING },
      },
    });
    return row?.enabled === true;
  }

  async recordIncomeFromPayment(
    clubId: string,
    paymentId: string,
    label: string,
    amountCents: number,
  ): Promise<void> {
    if (!(await this.isAccountingEnabled(clubId))) {
      return;
    }
    await this.prisma.accountingEntry.create({
      data: {
        clubId,
        kind: AccountingEntryKind.INCOME,
        label,
        amountCents,
        paymentId,
      },
    });
  }

  async listEntries(clubId: string) {
    return this.prisma.accountingEntry.findMany({
      where: { clubId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }
}
