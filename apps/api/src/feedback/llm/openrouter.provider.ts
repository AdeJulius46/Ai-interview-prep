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

// Confirmed via manual testing: popular free models (liquid/lfm-2.5-2.6b:free
// included) share a pool across every OpenRouter user on the free tier and
// return 429 "temporarily rate-limited upstream" fairly often — this is
// unrelated to prompt quality or model reliability, every response that
// actually lands is well-formed. OpenRouter's own error body carries a
// retry_after_seconds hint (typically 45-60s); capped lower here so a
// transient rate limit doesn't turn into a multi-minute wait for the
// candidate — if it's still limited after this, surfacing ScoringFailed and
// letting the feedback screen's natural retry (a reload re-POSTs, and
// nothing was persisted on failure) is more honest than stalling further.
const RATE_LIMIT_WAIT_CAP_MS = 15_000;
const MAX_RATE_LIMIT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number | undefined) {
    super('OpenRouter rate-limited this request');
  }
}

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

    // Retry once with the parse error appended to the prompt (backend.md:
    // "On parse failure, retry once with the parse error appended to the
    // prompt").
    const retryPrompt = buildRetryPrompt(prompt, firstAttempt.error);
    const second = await this.callModel(retryPrompt);
    const secondAttempt = tryParseScoringResult(second);
    if (secondAttempt.result) {
      for (const w of crossCheckInconsistencies(secondAttempt.result)) this.logger.warn(w);
      return { result: secondAttempt.result, rawResponse: second, modelName };
    }

    throw new Error(`Scoring response failed to parse after retry: ${secondAttempt.error}`);
  }

  // Retries a 429 up to MAX_RATE_LIMIT_RETRIES times with a capped wait —
  // separate from score()'s own retry-on-parse-failure above, since a rate
  // limit and a malformed response are different problems with different
  // fixes.
  private async callModel(prompt: string): Promise<string> {
    let lastRateLimit: RateLimitedError | undefined;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await this.attemptCallModel(prompt);
      } catch (err) {
        if (!(err instanceof RateLimitedError) || attempt === MAX_RATE_LIMIT_RETRIES) {
          throw err;
        }
        lastRateLimit = err;
        const waitMs = Math.min((err.retryAfterSeconds ?? 5) * 1000, RATE_LIMIT_WAIT_CAP_MS);
        this.logger.warn(
          `OpenRouter rate-limited (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES + 1}), waiting ${waitMs}ms before retrying`,
        );
        await sleep(waitMs);
      }
    }
    // Unreachable — the loop always returns or throws — but keeps TS happy.
    throw lastRateLimit ?? new Error('OpenRouter request failed');
  }

  private async attemptCallModel(prompt: string): Promise<string> {
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

    if (response.status === 429) {
      const body = await response.text().catch(() => '');
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : this.parseRetryAfterFromBody(body);
      this.logger.warn(`OpenRouter 429: ${redact(body)}`);
      throw new RateLimitedError(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`OpenRouter request failed with status ${response.status}: ${redact(body)}`);
      throw new Error(`OpenRouter request failed with status ${response.status}: ${redact(body)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      this.logger.error(`OpenRouter response had no message content: ${JSON.stringify(data)}`);
      throw new Error('OpenRouter response had no message content');
    }
    return text;
  }

  private parseRetryAfterFromBody(body: string): number | undefined {
    try {
      const parsed = JSON.parse(body) as { error?: { metadata?: { retry_after_seconds?: number } } };
      return parsed.error?.metadata?.retry_after_seconds;
    } catch {
      return undefined;
    }
  }
}
