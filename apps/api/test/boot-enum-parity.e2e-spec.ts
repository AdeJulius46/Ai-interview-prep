import { Competency as PrismaCompetency, Seniority as PrismaSeniority } from '@prisma/client';
import { CompetencySchema, SenioritySchema } from '@coach/contracts';
import { assertEnumParity } from '../src/common/enum-parity';

describe('enum parity between Prisma and @coach/contracts', () => {
  it('CompetencySchema.options deep-equals the Prisma Competency enum values', () => {
    const prismaValues = Object.values(PrismaCompetency).sort();
    const contractValues = [...CompetencySchema.options].sort();
    expect(contractValues).toEqual(prismaValues);
  });

  it('SenioritySchema.options deep-equals the Prisma Seniority enum values', () => {
    const prismaValues = Object.values(PrismaSeniority).sort();
    const contractValues = [...SenioritySchema.options].sort();
    expect(contractValues).toEqual(prismaValues);
  });

  it('assertEnumParity() does not throw when the two sides agree', () => {
    expect(() => assertEnumParity()).not.toThrow();
  });
});
