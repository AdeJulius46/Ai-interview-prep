// Thin HTTP client for the Anthropic Messages API. Implements
// ScoringProvider so FeedbackService never depends on this class directly
// (backend.md, "FeedbackService > Scoring call"). msw intercepts
// https://api.anthropic.com/* in tests — testing.md's hard mocking rule #2:
// "The scoring LLM is never called in an automated test."
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScoringResultSchema, type ScoringResult } from '@coach/contracts';

// zod-to-json-schema's own generic return type is too deep for TS to
// instantiate when fed ScoringResultSchema's full inferred shape across the
// packages/contracts -> apps/api package boundary ("Type instantiation is
// excessively deep and possibly infinite"). The function's actual runtime
// behavior is unaffected by types; erasing both the input and output types
// here is the standard workaround.
function schemaToJson(schema: unknown, name: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- see comment above
  return (zodToJsonSchema as (schema: any, name: string) => unknown)(schema, name);
}
import { redact } from '../../common/redact';
import type { ScoringInput, ScoringOutput, ScoringProvider } from './llm.interface';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 30_000;

// Derived from the Zod schema, not hand-written, so the prompt's shape
// description cannot drift from the validator (shared.md, "The scoring
// schema").
const RESULT_JSON_SCHEMA = JSON.stringify(schemaToJson(ScoringResultSchema, 'ScoringResult'));

function buildPrompt(input: ScoringInput): string {
  const transcript = input.segments
    .map((segment) => {
      const dialogue = segment.turns
        .map((turn) => `${turn.speaker}: ${turn.content}`)
        .join('\n');
      return `Question ${segment.questionIndex} — "${segment.question}"\n${dialogue}`;
    })
    .join('\n\n');

  return [
    `You are scoring a behavioural interview transcript against the STAR framework`,
    `(Situation, Task, Action, Result) for a ${input.seniority} ${input.role} candidate.`,
    '',
    'For each question below, determine whether the candidate\'s answer contains each',
    'STAR element, give a score from 1 to 5, and write one specific, actionable',
    'improvement sentence. Then give 2 to 4 overall strengths.',
    '',
    'Transcript, one question per block:',
    '',
    transcript,
    '',
    'Respond with STRICT JSON ONLY — no prose, no markdown code fences — matching',
    'exactly this JSON Schema:',
    RESULT_JSON_SCHEMA,
  ].join('\n');
}

// Defensive strip: the model is asked for strict JSON, but occasionally
// wraps it in ```json fences anyway (backend.md, "Strip ```json fences
// defensively before parsing anyway").
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function tryParse(rawText: string): { result: ScoringResult; error: null } | { result: null; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(rawText));
  } catch (err) {
    return { result: null, error: `Response was not valid JSON: ${String(err)}` };
  }
  const parsed = ScoringResultSchema.safeParse(json);
  if (!parsed.success) {
    return { result: null, error: parsed.error.message };
  }
  return { result: parsed.data, error: null };
}

@Injectable()
export class AnthropicProvider implements ScoringProvider {
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async score(input: ScoringInput): Promise<ScoringOutput> {
    const prompt = buildPrompt(input);

    const modelName = this.configService.get<string>('ANTHROPIC_MODEL')!;

    const first = await this.callModel(prompt);
    const firstAttempt = tryParse(first);
    if (firstAttempt.result) {
      this.crossCheck(firstAttempt.result);
      return { result: firstAttempt.result, rawResponse: first, modelName };
    }

    this.logger.warn(`Scoring response failed to parse, retrying once: ${firstAttempt.error}`);

    // Retry once with the parse error appended to the prompt (backend.md:
    // "On parse failure, retry once with the parse error appended to the
    // prompt").
    const retryPrompt = `${prompt}\n\nYour previous response could not be parsed: ${firstAttempt.error}\nReturn ONLY the corrected strict JSON.`;
    const second = await this.callModel(retryPrompt);
    const secondAttempt = tryParse(second);
    if (secondAttempt.result) {
      this.crossCheck(secondAttempt.result);
      return { result: secondAttempt.result, rawResponse: second, modelName };
    }

    throw new Error(`Scoring response failed to parse after retry: ${secondAttempt.error}`);
  }

  // backend.md, "Cross-check rule": log a warning (never blocks persistence)
  // when the model's STAR flags and score visibly disagree, so prompt
  // regressions surface without failing the request.
  private crossCheck(result: ScoringResult): void {
    for (const answer of result.answers) {
      const allPresent = answer.hasSituation && answer.hasTask && answer.hasAction && answer.hasResult;
      const missingCount = [answer.hasSituation, answer.hasTask, answer.hasAction, answer.hasResult].filter(
        (v) => !v,
      ).length;
      if ((allPresent && answer.score <= 2) || (missingCount >= 2 && answer.score === 5)) {
        this.logger.warn(
          `Scoring inconsistency on question ${answer.questionIndex}: STAR flags and score disagree`,
        );
      }
    }
  }

  private async callModel(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const model = this.configService.get<string>('ANTHROPIC_MODEL');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(redact(`Anthropic request failed: ${String(err)}`));
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Anthropic request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (typeof text !== 'string') {
      throw new Error('Anthropic response had no text content block');
    }
    return text;
  }
}
