import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GraphqlAppModule } from './graphql/graphql.module';
import { ModuleRegistryModule } from './domain/module-registry/module-registry.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ModuleRegistryModule, GraphqlAppModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
