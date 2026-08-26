import { Competency as PrismaCompetency, Seniority as PrismaSeniority } from '@prisma/client';
import { CompetencySchema, SenioritySchema } from '@coach/contracts';

// Prisma generates its own enum types from schema.prisma. Those must stay
// identical to the contracts enums. See shared.md, "Enum parity guard".
//
// Compile-time guard: fails to compile if the two drift. Because every
// PrismaCompetency member must be a key in the object built from
// CompetencySchema.options, adding a Prisma enum member without adding it to
// CompetencySchema (or vice versa) is a type error, not a runtime surprise.
const _competency: Record<PrismaCompetency, true> = Object.fromEntries(
  CompetencySchema.options.map((v) => [v, true]),
) as never;

const _seniority: Record<PrismaSeniority, true> = Object.fromEntries(
  SenioritySchema.options.map((v) => [v, true]),
) as never;

void _competency;
void _seniority;

/**
 * Runtime guard alongside the compile-time one above. Compiled JavaScript
 * can drift from its types (a stale build, a generated Prisma client that
 * wasn't regenerated after a schema edit), so this re-checks the same
 * invariant at runtime and throws loudly instead of allowing a silent
 * mismatch between the database and the wire contract.
 */
export function assertEnumParity(): void {
  const competencyValues = Object.values(PrismaCompetency) as string[];
  const seniorityValues = Object.values(PrismaSeniority) as string[];

  const competencyDrift =
    JSON.stringify([...CompetencySchema.options].sort()) !==
    JSON.stringify([...competencyValues].sort());
  if (competencyDrift) {
    throw new Error(
      'Competency enum drift: Prisma schema and @coach/contracts CompetencySchema disagree.',
    );
  }

  const seniorityDrift =
    JSON.stringify([...SenioritySchema.options].sort()) !==
    JSON.stringify([...seniorityValues].sort());
  if (seniorityDrift) {
    throw new Error(
      'Seniority enum drift: Prisma schema and @coach/contracts SenioritySchema disagree.',
    );
  }
}

// Run once at import time so any process that loads this module (including
// main.ts at boot) crashes immediately on drift rather than at request time.
assertEnumParity();
