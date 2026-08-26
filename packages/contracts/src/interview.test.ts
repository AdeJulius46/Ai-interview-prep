import { describe, expect, it } from 'vitest';
import {
  CreateInterviewInputSchema,
  HistoryPageDtoSchema,
  InterviewDtoSchema,
  InterviewSummaryDtoSchema,
} from './interview.js';

const validInput = {
  role: 'Frontend Engineer',
  seniority: 'MID',
  competencies: ['OWNERSHIP', 'CONFLICT'],
  questionCount: 3,
};

describe('CreateInterviewInputSchema', () => {
  it('accepts a valid fixture', () => {
    const result = CreateInterviewInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts a valid fixture with no questionCount (defaults to 3)', () => {
    const { questionCount, ...rest } = validInput;
    const result = CreateInterviewInputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.questionCount).toBe(3);
  });

  it('rejects an empty role', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, role: '' }).success).toBe(false);
  });

  it('rejects a role that is only whitespace', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, role: '   ' }).success).toBe(false);
  });

  it('rejects 6 competencies (max 5)', () => {
    const result = CreateInterviewInputSchema.safeParse({
      ...validInput,
      competencies: ['OWNERSHIP', 'CONFLICT', 'FAILURE', 'AMBIGUITY', 'INFLUENCE', 'DELIVERY'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero competencies', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, competencies: [] }).success).toBe(false);
  });

  it('rejects questionCount 0', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, questionCount: 0 }).success).toBe(false);
  });

  it('rejects questionCount 6', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, questionCount: 6 }).success).toBe(false);
  });

  it('rejects an unknown competency string', () => {
    expect(
      CreateInterviewInputSchema.safeParse({ ...validInput, competencies: ['LEADERSHIP'] }).success,
    ).toBe(false);
  });

  it('rejects a missing seniority', () => {
    const { seniority, ...rest } = validInput;
    expect(CreateInterviewInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown seniority', () => {
    expect(CreateInterviewInputSchema.safeParse({ ...validInput, seniority: 'LEAD' }).success).toBe(false);
  });
});

describe('InterviewDtoSchema', () => {
  const validDto = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    role: 'Frontend Engineer',
    seniority: 'MID',
    competencies: ['OWNERSHIP'],
    questionCount: 3,
    timeLimitSecs: 180,
    interviewerName: 'John',
    status: 'CREATED',
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
  };

  it('accepts a valid fixture', () => {
    expect(InterviewDtoSchema.safeParse(validDto).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(InterviewDtoSchema.safeParse({ ...validDto, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(InterviewDtoSchema.safeParse({ ...validDto, status: 'PENDING' }).success).toBe(false);
  });

  it('rejects a missing role', () => {
    const { role, ...rest } = validDto;
    expect(InterviewDtoSchema.safeParse(rest).success).toBe(false);
  });
});

describe('InterviewSummaryDtoSchema', () => {
  const validSummary = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date().toISOString(),
    role: 'Frontend Engineer',
    seniority: 'MID',
    competencies: ['OWNERSHIP'],
    status: 'SCORED',
    overallScore: 3.5,
  };

  it('accepts a valid fixture', () => {
    expect(InterviewSummaryDtoSchema.safeParse(validSummary).success).toBe(true);
  });

  it('accepts a null overallScore for unscored interviews', () => {
    expect(InterviewSummaryDtoSchema.safeParse({ ...validSummary, overallScore: null }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(InterviewSummaryDtoSchema.safeParse({ ...validSummary, status: 'WHATEVER' }).success).toBe(false);
  });

  it('rejects a missing id', () => {
    const { id, ...rest } = validSummary;
    expect(InterviewSummaryDtoSchema.safeParse(rest).success).toBe(false);
  });
});

describe('HistoryPageDtoSchema', () => {
  const validSummary = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date().toISOString(),
    role: 'Frontend Engineer',
    seniority: 'MID',
    competencies: ['OWNERSHIP'],
    status: 'SCORED',
    overallScore: 3.5,
  };

  it('accepts a valid page with a null nextCursor', () => {
    expect(
      HistoryPageDtoSchema.safeParse({ items: [validSummary], nextCursor: null }).success,
    ).toBe(true);
  });

  it('accepts a valid page with a uuid nextCursor', () => {
    expect(
      HistoryPageDtoSchema.safeParse({
        items: [validSummary],
        nextCursor: '223e4567-e89b-12d3-a456-426614174000',
      }).success,
    ).toBe(true);
  });

  it('accepts an empty items array', () => {
    expect(HistoryPageDtoSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
  });

  it('rejects a missing nextCursor', () => {
    expect(HistoryPageDtoSchema.safeParse({ items: [validSummary] }).success).toBe(false);
  });

  it('rejects a non-uuid nextCursor', () => {
    expect(
      HistoryPageDtoSchema.safeParse({ items: [validSummary], nextCursor: 'not-a-uuid' }).success,
    ).toBe(false);
  });
});
