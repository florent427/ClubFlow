import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AgentSchemaParserService } from './schema-parser.service';
import { AgentSanitizerService } from './sanitizer.service';
import { AgentExecutorService } from './executor.service';
import { AgentPendingActionsService } from './pending-actions.service';
import { AgentAttachmentProcessorService } from './attachment-processor.service';
import { AgentService } from './agent.service';
import { AgentResolver } from './agent.resolver';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [
    AgentSchemaParserService,
    AgentSanitizerService,
    AgentExecutorService,
    AgentPendingActionsService,
    AgentAttachmentProcessorService,
    AgentService,
    AgentResolver,
  ],
  exports: [AgentService],
})
export class AgentModule {}
