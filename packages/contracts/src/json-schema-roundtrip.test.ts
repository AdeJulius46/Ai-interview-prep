import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScoringResultSchema } from './feedback.js';
import { CreateInterviewInputSchema } from './interview.js';

/**
 * The prompt's JSON schema description is derived from the Zod schema with
 * zod-to-json-schema so it cannot silently drift from the validator. This
 * test round-trips the generated JSON Schema and checks its `required` sets
 * against the fields the Zod schema itself treats as required, at every
 * level of nesting.
 */
function zodRequiredKeys(shape: Record<string, { isOptional(): boolean }>): string[] {
  return Object.entries(shape)
    .filter(([, schema]) => !schema.isOptional())
    .map(([key]) => key)
    .sort();
}

describe('zod-to-json-schema round trip', () => {
  it('ScoringResultSchema: required fields match between Zod and generated JSON Schema', () => {
    const jsonSchema = zodToJsonSchema(ScoringResultSchema, 'ScoringResult') as any;
    const def = jsonSchema.definitions.ScoringResult;

    expect(def.required.slice().sort()).toEqual(zodRequiredKeys(ScoringResultSchema.shape));

    // Nested AnswerFeedback required fields must also survive the round trip.
    const answerFeedbackSchema = ScoringResultSchema.shape.answers.element;
    const answerItemSchema = def.properties.answers.items;
    expect(answerItemSchema.required.slice().sort()).toEqual(
      zodRequiredKeys(answerFeedbackSchema.shape),
    );
  });

  it('CreateInterviewInputSchema: required fields match between Zod and generated JSON Schema', () => {
    const jsonSchema = zodToJsonSchema(CreateInterviewInputSchema, 'CreateInterviewInput') as any;
    const def = jsonSchema.definitions.CreateInterviewInput;

    // questionCount has a default in Zod, so it is optional on input but the
    // rest are required. Compare directly against the schema's own view of
    // required-ness so this test fails the moment the two definitions diverge.
    expect(def.required.slice().sort()).toEqual(
      zodRequiredKeys(CreateInterviewInputSchema.shape),
    );
  });

  it('parses back into a usable object shape (sanity check the output is valid JSON Schema)', () => {
    const jsonSchema = zodToJsonSchema(ScoringResultSchema, 'ScoringResult') as any;
    const reparsed = JSON.parse(JSON.stringify(jsonSchema));
    expect(reparsed.definitions.ScoringResult.type).toBe('object');
    expect(reparsed.definitions.ScoringResult.properties).toHaveProperty('answers');
    expect(reparsed.definitions.ScoringResult.properties).toHaveProperty('strengths');
  });
});
