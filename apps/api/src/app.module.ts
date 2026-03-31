import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClubIdBootstrapService } from './config/club-id-bootstrap.service';
import { GraphqlAppModule } from './graphql/graphql.module';
import { ModuleRegistryModule } from './domain/module-registry/module-registry.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    ModuleRegistryModule,
    GraphqlAppModule,
  ],
  controllers: [AppController],
  providers: [AppService, ClubIdBootstrapService],
})
export class AppModule {}
