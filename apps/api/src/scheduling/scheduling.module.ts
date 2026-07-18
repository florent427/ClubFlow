import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerLockService } from './scheduler-lock.service';

/**
 * Socle des tâches planifiées (cf. ADR-0009).
 *
 * Global : n'importe quel module métier peut injecter `SchedulerLockService`
 * pour protéger son propre job sans avoir à réimporter ce module.
 *
 * Note : `ScheduleModule.forRoot()` est enregistré dans `AppModule` — c'est
 * lui qui active la découverte des décorateurs `@Cron`.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [SchedulerLockService],
  exports: [SchedulerLockService],
})
export class SchedulingModule {}
