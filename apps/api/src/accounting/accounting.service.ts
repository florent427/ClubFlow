import { Injectable, NotFoundException } from '@nestjs/common';
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
      take: 500,
    });
  }

  async createManualEntry(
    clubId: string,
    data: {
      kind: AccountingEntryKind;
      label: string;
      amountCents: number;
      occurredAt?: Date;
    },
  ) {
    return this.prisma.accountingEntry.create({
      data: {
        clubId,
        kind: data.kind,
        label: data.label,
        amountCents: data.amountCents,
        occurredAt: data.occurredAt ?? new Date(),
      },
    });
  }

  async deleteEntry(clubId: string, id: string) {
    const existing = await this.prisma.accountingEntry.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Écriture introuvable');
    if (existing.paymentId) {
      throw new NotFoundException(
        'Cette écriture est liée à un paiement et ne peut pas être supprimée manuellement.',
      );
    }
    await this.prisma.accountingEntry.delete({ where: { id } });
    return true;
  }

  async summary(clubId: string) {
    const rows = await this.prisma.accountingEntry.findMany({
      where: { clubId },
      select: { kind: true, amountCents: true },
    });
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      if (r.kind === AccountingEntryKind.INCOME) income += r.amountCents;
      else expense += r.amountCents;
    }
    return {
      incomeCents: income,
      expenseCents: expense,
      balanceCents: income - expense,
    };
  }
}
