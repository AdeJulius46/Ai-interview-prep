import { describe, expect, it } from 'vitest';
import {
  AnswerFeedbackSchema,
  ScoringResultSchema,
  AnswerFeedbackDtoSchema,
  FeedbackDtoSchema,
} from './feedback.js';

const validAnswer = {
  questionIndex: 0,
  question: 'Tell me about a time you owned a project end to end.',
  answerSummary: 'Led a migration from monolith to services, coordinating with three teams.',
  hasSituation: true,
  hasTask: true,
  hasAction: true,
  hasResult: true,
  score: 4,
  improvement: 'Quantify the impact with a concrete metric.',
};

describe('AnswerFeedbackSchema', () => {
  it('accepts a valid fixture', () => {
    expect(AnswerFeedbackSchema.safeParse(validAnswer).success).toBe(true);
  });

  it('rejects a negative questionIndex', () => {
    expect(AnswerFeedbackSchema.safeParse({ ...validAnswer, questionIndex: -1 }).success).toBe(false);
  });

  it('rejects an empty question', () => {
    expect(AnswerFeedbackSchema.safeParse({ ...validAnswer, question: '' }).success).toBe(false);
  });

  it('rejects a score of 0', () => {
    expect(AnswerFeedbackSchema.safeParse({ ...validAnswer, score: 0 }).success).toBe(false);
  });

  it('rejects a score of 6', () => {
    expect(AnswerFeedbackSchema.safeParse({ ...validAnswer, score: 6 }).success).toBe(false);
  });

  it('rejects a non-boolean hasResult', () => {
    expect(AnswerFeedbackSchema.safeParse({ ...validAnswer, hasResult: 'yes' }).success).toBe(false);
  });

  it('rejects an improvement over 300 chars', () => {
    expect(
      AnswerFeedbackSchema.safeParse({ ...validAnswer, improvement: 'x'.repeat(301) }).success,
    ).toBe(false);
  });
});

describe('ScoringResultSchema', () => {
  const validResult = {
    answers: [validAnswer],
    strengths: ['Clear ownership narrative', 'Concrete metrics'],
  };

  it('accepts a valid fixture', () => {
    expect(ScoringResultSchema.safeParse(validResult).success).toBe(true);
  });

  it('rejects a score of 0 nested in answers', () => {
    const result = ScoringResultSchema.safeParse({
      ...validResult,
      answers: [{ ...validAnswer, score: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a score of 6 nested in answers', () => {
    const result = ScoringResultSchema.safeParse({
      ...validResult,
      answers: [{ ...validAnswer, score: 6 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero answers', () => {
    expect(ScoringResultSchema.safeParse({ ...validResult, answers: [] }).success).toBe(false);
  });

  it('rejects fewer than 2 strengths', () => {
    expect(ScoringResultSchema.safeParse({ ...validResult, strengths: ['only one'] }).success).toBe(false);
  });

  it('rejects more than 4 strengths', () => {
    expect(
      ScoringResultSchema.safeParse({ ...validResult, strengths: ['a', 'b', 'c', 'd', 'e'] }).success,
    ).toBe(false);
  });

  it('does not define an overallScore field, it is computed server side', () => {
    expect(Object.keys(ScoringResultSchema.shape)).not.toContain('overallScore');
  });
});

describe('AnswerFeedbackDtoSchema', () => {
  it('accepts a valid fixture including a persisted id', () => {
    const dto = { id: '123e4567-e89b-12d3-a456-426614174000', ...validAnswer };
    expect(AnswerFeedbackDtoSchema.safeParse(dto).success).toBe(true);
  });

  it('rejects a missing id', () => {
    expect(AnswerFeedbackDtoSchema.safeParse(validAnswer).success).toBe(false);
  });
});

describe('FeedbackDtoSchema', () => {
  const validFeedback = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    interviewId: '223e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date().toISOString(),
    overallScore: 4,
    strengths: ['Clear narrative', 'Good ownership'],
    answers: [{ id: '323e4567-e89b-12d3-a456-426614174000', ...validAnswer }],
  };

  it('accepts a valid fixture', () => {
    expect(FeedbackDtoSchema.safeParse(validFeedback).success).toBe(true);
  });

  it('rejects a missing overallScore', () => {
    const { overallScore, ...rest } = validFeedback;
    expect(FeedbackDtoSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty answers array', () => {
    expect(FeedbackDtoSchema.safeParse({ ...validFeedback, answers: [] }).success).toBe(false);
  });

  it('rejects fewer than 2 strengths', () => {
    expect(FeedbackDtoSchema.safeParse({ ...validFeedback, strengths: ['only one'] }).success).toBe(false);
  });
});
