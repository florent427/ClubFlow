import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModuleDefinitionSeeder } from './module-definition.seeder';

@Module({
  imports: [PrismaModule],
  providers: [ModuleDefinitionSeeder],
})
export class CatalogModule {}
