import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { AnthropicProvider } from './llm/anthropic.provider';
import { OpenRouterProvider } from './llm/openrouter.provider';
import { SCORING_PROVIDER, type ScoringProvider } from './llm/llm.interface';

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    AnthropicProvider,
    OpenRouterProvider,
    {
      // Selected by SCORING_PROVIDER (env.validation.ts) — defaults to
      // 'anthropic' so existing behavior/tests are unchanged unless a
      // deployment opts into OpenRouter explicitly.
      provide: SCORING_PROVIDER,
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicProvider,
        openrouter: OpenRouterProvider,
      ): ScoringProvider =>
        config.get<string>('SCORING_PROVIDER') === 'openrouter' ? openrouter : anthropic,
      inject: [ConfigService, AnthropicProvider, OpenRouterProvider],
    },
  ],
})
export class FeedbackModule {}
