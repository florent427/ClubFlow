import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { BrandedMailTransport } from './providers/branded-mail.transport';
import { ClubSendingDomainResolver } from './club-sending-domain.resolver';
import { ClubSendingDomainService } from './club-sending-domain.service';
import { MailUnsubscribeController } from './mail-unsubscribe.controller';
import { MAIL_TRANSPORT } from './mail.constants';
import { SmtpMailTransport } from './providers/smtp-mail.transport';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  imports: [PrismaModule],
  controllers: [MailUnsubscribeController],
  providers: [
    ClubSendingDomainService,
    TransactionalMailService,
    ClubSendingDomainResolver,
    ClubModuleEnabledGuard,
    {
      // Le transport exposé est le transport SMTP **habillé** : tout e-mail
      // sortant passe par l'enveloppe du club, quel que soit le service qui
      // l'envoie. Aucun appelant n'a de mise en forme à réclamer.
      provide: MAIL_TRANSPORT,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new BrandedMailTransport(SmtpMailTransport.fromEnv(), prisma),
    },
  ],
  exports: [ClubSendingDomainService, TransactionalMailService, MAIL_TRANSPORT],
})
export class MailModule {}
