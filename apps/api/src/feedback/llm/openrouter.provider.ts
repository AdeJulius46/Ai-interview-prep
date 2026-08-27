// Thin HTTP client for OpenRouter's chat-completions API (OpenAI-compatible
// shape). Implements ScoringProvider — see llm.interface.ts — so this is a
// drop-in alternative to AnthropicProvider, selected via the
// SCORING_PROVIDER env var (feedback.module.ts). msw intercepts
// https://openrouter.ai/* in tests, same rule as Anthropic: the scoring LLM
// is never called for real in an automated test.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redact } from '../../common/redact';
import type { ScoringInput, ScoringOutput, ScoringProvider } from './llm.interface';
import {
  buildRetryPrompt,
  buildScoringPrompt,
  crossCheckInconsistencies,
  tryParseScoringResult,
} from './scoring-prompt';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Longer than AnthropicProvider's 30s: free-tier reasoning models (e.g.
// nvidia/nemotron-3.5-lightning:free) generate substantial internal
// reasoning tokens before the final answer and are often deprioritized in
// OpenRouter's queue — a real scoring call was observed taking 60-90s.
// Confirmed via manual testing: a 30s timeout was aborting requests that
// would otherwise have succeeded.
const REQUEST_TIMEOUT_MS = 110_000;

@Injectable()
export class OpenRouterProvider implements ScoringProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async score(input: ScoringInput): Promise<ScoringOutput> {
    const prompt = buildScoringPrompt(input);
    const modelName = this.configService.get<string>('OPENROUTER_MODEL')!;

    const first = await this.callModel(prompt);
    const firstAttempt = tryParseScoringResult(first);
    if (firstAttempt.result) {
      for (const w of crossCheckInconsistencies(firstAttempt.result)) this.logger.warn(w);
      return { result: firstAttempt.result, rawResponse: first, modelName };
    }

    this.logger.warn(`Scoring response failed to parse, retrying once: ${firstAttempt.error}`);

    const retryPrompt = buildRetryPrompt(prompt, firstAttempt.error);
    const second = await this.callModel(retryPrompt);
    const secondAttempt = tryParseScoringResult(second);
    if (secondAttempt.result) {
      for (const w of crossCheckInconsistencies(secondAttempt.result)) this.logger.warn(w);
      return { result: secondAttempt.result, rawResponse: second, modelName };
    }

    throw new Error(`Scoring response failed to parse after retry: ${secondAttempt.error}`);
  }

  private async callModel(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const model = this.configService.get<string>('OPENROUTER_MODEL');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(redact(`OpenRouter request failed: ${String(err)}`));
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenRouter request failed with status ${response.status}: ${redact(body)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error('OpenRouter response had no message content');
    }
    return text;
  }
}
