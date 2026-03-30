import { join } from 'path';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { ClubModulesModule } from '../modules/club-modules.module';
import { ClubsModule } from '../clubs/clubs.module';
import { DashboardModule } from '../dashboard/dashboard.module';
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
  ],
})
export class GraphqlAppModule {}
