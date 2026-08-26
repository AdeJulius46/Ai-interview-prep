// See backend.md, "GET /progress" and "History list".
import { Injectable } from '@nestjs/common';
import type { HistoryPageDto, ProgressDto } from '@coach/contracts';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HISTORY_LIMIT = 20;

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(limit = DEFAULT_HISTORY_LIMIT, cursor?: string): Promise<HistoryPageDto> {
    const take = limit + 1;
    const interviews = await this.prisma.interview.findMany({
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { feedback: true },
    });

    const hasMore = interviews.length > limit;
    const page = hasMore ? interviews.slice(0, limit) : interviews;

    return {
      items: page.map((interview) => ({
        id: interview.id,
        createdAt: interview.createdAt.toISOString(),
        role: interview.role,
        seniority: interview.seniority,
        competencies: interview.competencies,
        status: interview.status,
        overallScore: interview.feedback?.overallScore ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  // Unscored and abandoned interviews are excluded (testing.md, gate:9) —
  // only a SCORED interview has a Feedback row to draw a score and STAR
  // coverage from in the first place.
  async getProgress(): Promise<ProgressDto> {
    const scored = await this.prisma.interview.findMany({
      where: { status: 'SCORED' },
      include: { feedback: { include: { answers: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const sessions = scored
      .filter((interview) => interview.feedback)
      .map((interview) => ({
        id: interview.id,
        completedAt: (interview.endedAt ?? interview.feedback!.createdAt).toISOString(),
        overallScore: interview.feedback!.overallScore,
        role: interview.role,
      }));

    const scores = sessions.map((s) => s.overallScore);
    const first = scores.length > 0 ? scores[0] : 0;
    const latest = scores.length > 0 ? scores[scores.length - 1] : 0;
    // A single session yields first === latest, so delta is naturally 0
    // rather than needing a special-cased division guard (testing.md,
    // gate:9: "A single session returns delta: 0 rather than dividing by
    // zero or returning null").
    const delta = latest - first;

    const allAnswers = scored.flatMap((interview) => interview.feedback?.answers ?? []);
    const total = allAnswers.length;
    const starCoverage =
      total === 0
        ? { situation: 0, task: 0, action: 0, result: 0 }
        : {
            situation: allAnswers.filter((a) => a.hasSituation).length / total,
            task: allAnswers.filter((a) => a.hasTask).length / total,
            action: allAnswers.filter((a) => a.hasAction).length / total,
            result: allAnswers.filter((a) => a.hasResult).length / total,
          };

    return {
      sessions,
      trend: { first, latest, delta, sessionCount: scores.length },
      starCoverage,
    };
  }
}
