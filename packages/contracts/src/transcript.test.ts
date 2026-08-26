import { describe, expect, it } from 'vitest';
import {
  TranscriptLineSchema,
  AppendMessagesInputSchema,
  AppendMessagesResultSchema,
} from './transcript.js';

const validLine = {
  speaker: 'CANDIDATE',
  content: 'I led the migration.',
  spokenAt: new Date().toISOString(),
  sequence: 4,
};

describe('TranscriptLineSchema', () => {
  it('accepts a valid fixture', () => {
    expect(TranscriptLineSchema.safeParse(validLine).success).toBe(true);
  });

  it('rejects an unknown speaker', () => {
    expect(TranscriptLineSchema.safeParse({ ...validLine, speaker: 'MODERATOR' }).success).toBe(false);
  });

  it('rejects lowercase speaker', () => {
    expect(TranscriptLineSchema.safeParse({ ...validLine, speaker: 'candidate' }).success).toBe(false);
  });

  it('rejects empty content', () => {
    expect(TranscriptLineSchema.safeParse({ ...validLine, content: '' }).success).toBe(false);
  });

  it('rejects a negative sequence', () => {
    expect(TranscriptLineSchema.safeParse({ ...validLine, sequence: -1 }).success).toBe(false);
  });

  it('rejects a non-integer sequence', () => {
    expect(TranscriptLineSchema.safeParse({ ...validLine, sequence: 1.5 }).success).toBe(false);
  });
});

describe('AppendMessagesInputSchema', () => {
  const validInput = { messages: [validLine] };

  it('accepts a valid fixture', () => {
    expect(AppendMessagesInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejects an empty messages array', () => {
    expect(AppendMessagesInputSchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it('rejects a missing messages key', () => {
    expect(AppendMessagesInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a message with an invalid speaker inside the batch', () => {
    expect(
      AppendMessagesInputSchema.safeParse({ messages: [{ ...validLine, speaker: 'BAD' }] }).success,
    ).toBe(false);
  });
});

describe('AppendMessagesResultSchema', () => {
  it('accepts a valid fixture', () => {
    expect(AppendMessagesResultSchema.safeParse({ accepted: 1, skipped: 0 }).success).toBe(true);
  });

  it('rejects a negative accepted count', () => {
    expect(AppendMessagesResultSchema.safeParse({ accepted: -1, skipped: 0 }).success).toBe(false);
  });

  it('rejects a negative skipped count', () => {
    expect(AppendMessagesResultSchema.safeParse({ accepted: 1, skipped: -1 }).success).toBe(false);
  });

  it('rejects a non-integer accepted count', () => {
    expect(AppendMessagesResultSchema.safeParse({ accepted: 1.5, skipped: 0 }).success).toBe(false);
  });
});
