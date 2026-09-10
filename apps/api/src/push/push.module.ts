import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushResolver } from './push.resolver';
import { WebPushService } from './push.service';

/**
 * Web Push (notifications navigateur du portail). Ne dépend que de Prisma :
 * la messagerie et la communication l'importent sans cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [WebPushService, PushResolver],
  exports: [WebPushService],
})
export class PushModule {}
