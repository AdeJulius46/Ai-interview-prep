import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateInterviewInput, InterviewDto } from '@coach/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';
import { toInterviewDto } from './dto/interview.mapper';

// Hard ceiling from backend.md: "timeLimitSecs is not client supplied. It
// comes from SESSION_TIME_LIMIT_SECONDS and is clamped to a hard ceiling of
// 180." The clamp applies regardless of what the env var says.
const TIME_LIMIT_CEILING_SECS = 180;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionBank: QuestionBankService,
    private readonly configService: ConfigService,
  ) {}

  async create(input: CreateInterviewInput): Promise<InterviewDto> {
    const configuredLimit =
      this.configService.get<number>('SESSION_TIME_LIMIT_SECONDS') ?? TIME_LIMIT_CEILING_SECS;
    const timeLimitSecs = Math.min(configuredLimit, TIME_LIMIT_CEILING_SECS);

    const interview = await this.prisma.$transaction(async (tx) => {
      const created = await tx.interview.create({
        data: {
          role: input.role,
          seniority: input.seniority,
          competencies: input.competencies,
          questionCount: input.questionCount,
          timeLimitSecs,
        },
      });

      // Selection happens at creation time, not at token time (backend.md,
      // QuestionBankService: "The questions must exist before the persona
      // prompt is built.").
      const { questions, questionCount } = await this.questionBank.select(
        {
          competencies: input.competencies,
          seniority: input.seniority,
          count: input.questionCount,
        },
        tx,
      );

      if (questions.length > 0) {
        await tx.interviewQuestion.createMany({
          data: questions.map((question, position) => ({
            interviewId: created.id,
            questionId: question.id,
            position,
          })),
        });
      }

      // A pool smaller than questionCount reduces the interview's
      // questionCount to match rather than repeating a question.
      if (questionCount !== created.questionCount) {
        return tx.interview.update({
          where: { id: created.id },
          data: { questionCount },
        });
      }

      return created;
    });

    return toInterviewDto(interview);
  }
}
