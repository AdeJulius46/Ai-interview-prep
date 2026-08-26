import { describe, expect, it } from 'vitest';
import { SessionTokenResponseSchema } from './session.js';

const validResponse = {
  sessionToken: 'tok_abc123',
  timeLimitSecs: 180,
  expiresAt: new Date().toISOString(),
};

describe('SessionTokenResponseSchema', () => {
  it('accepts a valid fixture', () => {
    expect(SessionTokenResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects a missing sessionToken', () => {
    const { sessionToken, ...rest } = validResponse;
    expect(SessionTokenResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty sessionToken', () => {
    expect(SessionTokenResponseSchema.safeParse({ ...validResponse, sessionToken: '' }).success).toBe(false);
  });

  it('rejects a non-numeric timeLimitSecs', () => {
    expect(SessionTokenResponseSchema.safeParse({ ...validResponse, timeLimitSecs: '180' }).success).toBe(false);
  });

  it('rejects an invalid expiresAt', () => {
    expect(SessionTokenResponseSchema.safeParse({ ...validResponse, expiresAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects avatarId leaking into the response shape', () => {
    // Extra unknown-but-tempting fields should still parse fine (schema is not strict here),
    // but the schema itself must never define these keys as part of the shape.
    expect(Object.keys(SessionTokenResponseSchema.shape)).not.toContain('avatarId');
    expect(Object.keys(SessionTokenResponseSchema.shape)).not.toContain('systemPrompt');
  });
});
