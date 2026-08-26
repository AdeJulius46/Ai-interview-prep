import { describe, expect, it } from 'vitest';
import {
  CompetencySchema,
  SenioritySchema,
  InterviewStatusSchema,
  SpeakerSchema,
  COMPETENCY_LABELS,
  SENIORITY_LABELS,
} from './enums.js';

describe('CompetencySchema', () => {
  it('accepts every valid competency', () => {
    for (const value of CompetencySchema.options) {
      expect(CompetencySchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects lowercase input, no casing coercion', () => {
    expect(CompetencySchema.safeParse('ownership').success).toBe(false);
  });

  it('rejects an unknown competency string', () => {
    expect(CompetencySchema.safeParse('NOT_A_COMPETENCY').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(CompetencySchema.safeParse(1).success).toBe(false);
  });

  it('rejects undefined', () => {
    expect(CompetencySchema.safeParse(undefined).success).toBe(false);
  });
});

describe('SenioritySchema', () => {
  it('accepts every valid seniority', () => {
    for (const value of SenioritySchema.options) {
      expect(SenioritySchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects lowercase input', () => {
    expect(SenioritySchema.safeParse('junior').success).toBe(false);
  });

  it('rejects an unknown seniority string', () => {
    expect(SenioritySchema.safeParse('LEAD').success).toBe(false);
  });

  it('rejects null', () => {
    expect(SenioritySchema.safeParse(null).success).toBe(false);
  });
});

describe('InterviewStatusSchema', () => {
  it('accepts every valid status', () => {
    for (const value of InterviewStatusSchema.options) {
      expect(InterviewStatusSchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects lowercase input', () => {
    expect(InterviewStatusSchema.safeParse('created').success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(InterviewStatusSchema.safeParse('PENDING').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(InterviewStatusSchema.safeParse(0).success).toBe(false);
  });
});

describe('SpeakerSchema', () => {
  it('accepts every valid speaker', () => {
    for (const value of SpeakerSchema.options) {
      expect(SpeakerSchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects lowercase input', () => {
    expect(SpeakerSchema.safeParse('interviewer').success).toBe(false);
  });

  it('rejects an unknown speaker', () => {
    expect(SpeakerSchema.safeParse('MODERATOR').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(SpeakerSchema.safeParse('').success).toBe(false);
  });
});

describe('label maps', () => {
  it('COMPETENCY_LABELS has a key for every competency', () => {
    for (const value of CompetencySchema.options) {
      expect(COMPETENCY_LABELS[value]).toBeTypeOf('string');
      expect(COMPETENCY_LABELS[value].length).toBeGreaterThan(0);
    }
    expect(Object.keys(COMPETENCY_LABELS).sort()).toEqual([...CompetencySchema.options].sort());
  });

  it('SENIORITY_LABELS has a key for every seniority', () => {
    for (const value of SenioritySchema.options) {
      expect(SENIORITY_LABELS[value]).toBeTypeOf('string');
      expect(SENIORITY_LABELS[value].length).toBeGreaterThan(0);
    }
    expect(Object.keys(SENIORITY_LABELS).sort()).toEqual([...SenioritySchema.options].sort());
  });
});
