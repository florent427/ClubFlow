import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClubIdBootstrapService } from './config/club-id-bootstrap.service';
import { GraphqlAppModule } from './graphql/graphql.module';
import { ModuleRegistryModule } from './domain/module-registry/module-registry.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulingModule } from './scheduling/scheduling.module';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    // Active la découverte des @Cron. Sans ça, les tâches planifiées ne sont
    // jamais enregistrées (cf. ADR-0009 : le projet n'en avait aucune).
    ScheduleModule.forRoot(),
    SchedulingModule,
    ModuleRegistryModule,
    GraphqlAppModule,
  ],
  controllers: [AppController],
  providers: [AppService, ClubIdBootstrapService],
})
export class AppModule {}
