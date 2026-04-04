import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubSendingDomainResolver } from './club-sending-domain.resolver';
import { ClubSendingDomainService } from './club-sending-domain.service';
import { MAIL_TRANSPORT } from './mail.constants';
import { SmtpMailTransport } from './providers/smtp-mail.transport';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ClubSendingDomainService,
    TransactionalMailService,
    ClubSendingDomainResolver,
    {
      provide: MAIL_TRANSPORT,
      useFactory: () => SmtpMailTransport.fromEnv(),
    },
  ],
  exports: [ClubSendingDomainService, TransactionalMailService, MAIL_TRANSPORT],
})
export class MailModule {}
