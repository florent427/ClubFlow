import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { AccountingEntryGraph } from './models/accounting-entry.model';
import { AccountingService } from './accounting.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class AccountingResolver {
  constructor(private readonly accounting: AccountingService) {}

  @Query(() => [AccountingEntryGraph], { name: 'clubAccountingEntries' })
  async clubAccountingEntries(
    @CurrentClub() club: Club,
  ): Promise<AccountingEntryGraph[]> {
    const rows = await this.accounting.listEntries(club.id);
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      kind: r.kind,
      label: r.label,
      amountCents: r.amountCents,
      paymentId: r.paymentId,
      occurredAt: r.occurredAt,
    }));
  }
}
