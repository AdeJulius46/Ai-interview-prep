import { describe, expect, it } from 'vitest';
import { ApiErrorCodeSchema, ApiErrorBodySchema } from './errors.js';

describe('ApiErrorCodeSchema', () => {
  it('accepts every known error code', () => {
    for (const value of ApiErrorCodeSchema.options) {
      expect(ApiErrorCodeSchema.safeParse(value).success).toBe(true);
    }
  });

  it('accepts InterviewNotFound', () => {
    expect(ApiErrorCodeSchema.safeParse('InterviewNotFound').success).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(ApiErrorCodeSchema.safeParse('SomethingElseWentWrong').success).toBe(false);
  });

  it('rejects lowercase form of a known code', () => {
    expect(ApiErrorCodeSchema.safeParse('interviewnotfound').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(ApiErrorCodeSchema.safeParse(404).success).toBe(false);
  });
});

describe('ApiErrorBodySchema', () => {
  const validBody = {
    statusCode: 502,
    error: 'AnamUnavailable',
    message: 'Could not start the interview session. Try again.',
  };

  it('accepts a valid fixture', () => {
    expect(ApiErrorBodySchema.safeParse(validBody).success).toBe(true);
  });

  it('rejects an unknown error code', () => {
    expect(ApiErrorBodySchema.safeParse({ ...validBody, error: 'Whatever' }).success).toBe(false);
  });

  it('rejects a missing message', () => {
    const { message, ...rest } = validBody;
    expect(ApiErrorBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-numeric statusCode', () => {
    expect(ApiErrorBodySchema.safeParse({ ...validBody, statusCode: '502' }).success).toBe(false);
  });
});
