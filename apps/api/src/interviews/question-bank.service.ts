// QuestionBankService. See backend.md, "QuestionBankService", for the exact
// selection rules this implements:
//
//   1. Filter to active questions whose seniority array contains the
//      requested level and whose competency is in the requested set.
//   2. Distribute across competencies as evenly as `count` allows. Two
//      competencies and three questions gives 2/1, and which competency
//      gets two is randomised.
//   3. Shuffle, then take `count`.
//   4. If the filtered pool is smaller than `count`, return what exists and
//      reduce the interview's questionCount to match rather than repeating
//      a question.
//
// Selection happens at POST /interviews (creation time), not at token time.
import { Injectable } from '@nestjs/common';
import { Competency, Prisma, Question, Seniority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SelectQuestionsInput {
  competencies: Competency[];
  seniority: Seniority;
  count: number;
}

export interface SelectQuestionsResult {
  questions: Question[];
  questionCount: number;
}

// Any Prisma client-shaped object that exposes `.question`: the injected
// PrismaService, or a `$transaction` callback's `tx` argument. Selection
// must run inside the same transaction as the Interview/InterviewQuestion
// writes so a crash mid-request never leaves an interview without its
// questions persisted.
type QuestionClient = Pick<Prisma.TransactionClient, 'question'>;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  async select(
    input: SelectQuestionsInput,
    client: QuestionClient = this.prisma,
  ): Promise<SelectQuestionsResult> {
    const { competencies, seniority, count } = input;

    const pool = await client.question.findMany({
      where: {
        active: true,
        competency: { in: competencies },
        seniority: { has: seniority },
      },
    });

    const groups = new Map<Competency, Question[]>();
    for (const competency of competencies) {
      groups.set(
        competency,
        shuffle(pool.filter((q) => q.competency === competency)),
      );
    }

    const totalAvailable = pool.length;
    const effectiveCount = Math.min(count, totalAvailable);

    const allocation = allocateEvenly(
      effectiveCount,
      [...groups.entries()].map(([competency, questions]) => ({
        competency,
        size: questions.length,
      })),
    );

    const selected: Question[] = [];
    for (const [competency, questions] of groups) {
      const n = allocation.get(competency) ?? 0;
      selected.push(...questions.slice(0, n));
    }

    return {
      questions: shuffle(selected),
      questionCount: selected.length,
    };
  }
}

/**
 * Distributes `total` units across `groups` as evenly as possible, one unit
 * per group per round-robin pass. Which group(s) receive the remainder is
 * randomised by shuffling the pass order each round, and a group already at
 * capacity is skipped so scarcity in one competency does not shrink the
 * total below what other competencies could supply.
 */
function allocateEvenly<K>(
  total: number,
  groups: { competency: K; size: number }[],
): Map<K, number> {
  const allocation = new Map<K, number>(groups.map((g) => [g.competency, 0]));
  let remaining = total;

  while (remaining > 0) {
    const withCapacity = groups.filter(
      (g) => (allocation.get(g.competency) ?? 0) < g.size,
    );
    if (withCapacity.length === 0) break;

    for (const g of shuffle(withCapacity)) {
      if (remaining <= 0) break;
      allocation.set(g.competency, (allocation.get(g.competency) ?? 0) + 1);
      remaining--;
    }
  }

  return allocation;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
