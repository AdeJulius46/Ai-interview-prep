// Shared between every ScoringProvider implementation: the prompt text and
// the strict-JSON parsing/validation. Kept provider-agnostic so swapping
// AnthropicProvider for another model (e.g. OpenRouterProvider) never
// risks the two providers scoring against subtly different prompts.
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScoringResultSchema, type ScoringResult } from '@coach/contracts';
import type { ScoringInput } from './llm.interface';

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

// Derived from the Zod schema, not hand-written, so the prompt's shape
// description cannot drift from the validator (shared.md, "The scoring
// schema").
const RESULT_JSON_SCHEMA = JSON.stringify(schemaToJson(ScoringResultSchema, 'ScoringResult'));

export function buildScoringPrompt(input: ScoringInput): string {
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

export function buildRetryPrompt(prompt: string, parseError: string): string {
  return `${prompt}\n\nYour previous response could not be parsed: ${parseError}\nReturn ONLY the corrected strict JSON.`;
}

// Defensive strip: the model is asked for strict JSON, but occasionally
// wraps it in ```json fences anyway (backend.md, "Strip ```json fences
// defensively before parsing anyway").
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function tryParseScoringResult(
  rawText: string,
): { result: ScoringResult; error: null } | { result: null; error: string } {
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

// backend.md, "Cross-check rule": returns a warning string (never blocks
// persistence) when the model's STAR flags and score visibly disagree, so
// prompt regressions surface without failing the request.
export function crossCheckInconsistencies(result: ScoringResult): string[] {
  const warnings: string[] = [];
  for (const answer of result.answers) {
    const allPresent = answer.hasSituation && answer.hasTask && answer.hasAction && answer.hasResult;
    const missingCount = [answer.hasSituation, answer.hasTask, answer.hasAction, answer.hasResult].filter(
      (v) => !v,
    ).length;
    if ((allPresent && answer.score <= 2) || (missingCount >= 2 && answer.score === 5)) {
      warnings.push(`Scoring inconsistency on question ${answer.questionIndex}: STAR flags and score disagree`);
    }
  }
  return warnings;
}
