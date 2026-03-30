import { join } from 'path';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { ClubModulesModule } from '../modules/club-modules.module';
import { ClubsModule } from '../clubs/clubs.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CommsModule } from '../comms/comms.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ExternalFinanceModule } from '../external-finance/external-finance.module';
import { FamiliesModule } from '../families/families.module';
import { MembersModule } from '../members/members.module';
import { MembershipModule } from '../membership/membership.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlanningModule } from '../planning/planning.module';
import './register-enums';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    AuthModule,
    CatalogModule,
    ClubsModule,
    DashboardModule,
    ClubModulesModule,
    MembersModule,
    FamiliesModule,
    PlanningModule,
    AccountingModule,
    PaymentsModule,
    MembershipModule,
    CommsModule,
    ExternalFinanceModule,
  ],
})
export class GraphqlAppModule {}
