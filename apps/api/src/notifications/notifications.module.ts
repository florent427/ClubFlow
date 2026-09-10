import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsService } from './notifications.service';

/**
 * Centre de notifications du portail. Dépend de Prisma et du Web Push ;
 * la communication l'importe pour les messages rapides et les campagnes.
 */
@Module({
  imports: [PrismaModule, PushModule],
  providers: [NotificationsService, NotificationsResolver],
  exports: [NotificationsService],
})
export class NotificationsModule {}
