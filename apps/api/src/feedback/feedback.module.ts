import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { AnthropicProvider } from './llm/anthropic.provider';
import { SCORING_PROVIDER } from './llm/llm.interface';

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, { provide: SCORING_PROVIDER, useClass: AnthropicProvider }],
})
export class FeedbackModule {}
