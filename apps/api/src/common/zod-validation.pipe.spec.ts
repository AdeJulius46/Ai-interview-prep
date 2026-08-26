import { BadRequestException } from '@nestjs/common';
import { CreateInterviewInputSchema } from '@coach/contracts';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(CreateInterviewInputSchema);

  it('returns the parsed, defaulted value for a valid payload', () => {
    const result = pipe.transform({
      role: 'Frontend Engineer',
      seniority: 'MID',
      competencies: ['OWNERSHIP'],
    });
    expect(result).toEqual({
      role: 'Frontend Engineer',
      seniority: 'MID',
      competencies: ['OWNERSHIP'],
      questionCount: 3,
    });
  });

  it('throws BadRequestException for an invalid payload', () => {
    expect(() => pipe.transform({ role: '', seniority: 'MID', competencies: [] })).toThrow(
      BadRequestException,
    );
  });

  it('strips unknown fields rather than passing them through', () => {
    const result = pipe.transform({
      role: 'Frontend Engineer',
      seniority: 'MID',
      competencies: ['OWNERSHIP'],
      isAdmin: true,
    }) as Record<string, unknown>;
    expect(result.isAdmin).toBeUndefined();
  });

  it('rejects a lowercase competency with no casing coercion', () => {
    expect(() =>
      pipe.transform({ role: 'Frontend Engineer', seniority: 'MID', competencies: ['ownership'] }),
    ).toThrow(BadRequestException);
  });
});
