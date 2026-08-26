import { describe, expect, it } from 'vitest';
import { ProgressDtoSchema, StarCoverageSchema } from './progress.js';

describe('StarCoverageSchema', () => {
  const validCoverage = { situation: 1, task: 0.8, action: 0.6, result: 0.4 };

  it('accepts a valid fixture', () => {
    expect(StarCoverageSchema.safeParse(validCoverage).success).toBe(true);
  });

  it('rejects a fraction above 1', () => {
    expect(StarCoverageSchema.safeParse({ ...validCoverage, situation: 1.1 }).success).toBe(false);
  });

  it('rejects a fraction below 0', () => {
    expect(StarCoverageSchema.safeParse({ ...validCoverage, result: -0.1 }).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const { action, ...rest } = validCoverage;
    expect(StarCoverageSchema.safeParse(rest).success).toBe(false);
  });
});

describe('ProgressDtoSchema', () => {
  const validProgress = {
    sessions: [
      { id: '123e4567-e89b-12d3-a456-426614174000', completedAt: new Date().toISOString(), overallScore: 3.3, role: 'Frontend Engineer' },
    ],
    trend: { first: 2.7, latest: 3.7, delta: 1.0, sessionCount: 5 },
    starCoverage: { situation: 1, task: 0.8, action: 0.6, result: 0.4 },
  };

  it('accepts a valid fixture', () => {
    expect(ProgressDtoSchema.safeParse(validProgress).success).toBe(true);
  });

  it('accepts an empty sessions array with zeroed trend', () => {
    const empty = {
      sessions: [],
      trend: { first: 0, latest: 0, delta: 0, sessionCount: 0 },
      starCoverage: { situation: 0, task: 0, action: 0, result: 0 },
    };
    expect(ProgressDtoSchema.safeParse(empty).success).toBe(true);
  });

  it('rejects a negative sessionCount', () => {
    expect(
      ProgressDtoSchema.safeParse({
        ...validProgress,
        trend: { ...validProgress.trend, sessionCount: -1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a missing trend', () => {
    const { trend, ...rest } = validProgress;
    expect(ProgressDtoSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a malformed session entry', () => {
    expect(
      ProgressDtoSchema.safeParse({ ...validProgress, sessions: [{ id: 'not-a-uuid' }] }).success,
    ).toBe(false);
  });
});
