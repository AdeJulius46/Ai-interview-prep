import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateInterviewInput, InterviewDto, SessionTokenResponse } from '@coach/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';
import { toInterviewDto } from './dto/interview.mapper';
import { PersonaService } from '../persona/persona.service';
import { AnamService } from '../anam/anam.service';
import { InterviewAlreadyStartedException, InterviewNotFoundException } from '../common/api-exception';

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
    private readonly personaService: PersonaService,
    private readonly anamService: AnamService,
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

  // POST /interviews/:id/session-token. See backend.md, "POST
  // /interviews/:id/session-token", steps 1-5, and architecture.md diagram
  // 1: the key never crosses arrow 6, this method's return value is the
  // entire trust boundary.
  async startSession(id: string): Promise<SessionTokenResponse> {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        questions: {
          include: { question: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!interview) {
      throw new InterviewNotFoundException();
    }
    if (interview.status !== 'CREATED') {
      throw new InterviewAlreadyStartedException();
    }

    const personaConfig = this.personaService.build(interview);
    const { sessionToken, anamSessionId } = await this.anamService.createSessionToken(
      interview.id,
      personaConfig,
    );

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + interview.timeLimitSecs * 1000);

    await this.prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'LIVE',
        startedAt,
        ...(anamSessionId ? { anamSessionId } : {}),
      },
    });

    // Return only the token and the limit — no persona config, no avatar
    // id, no API key. backend.md: "A test asserts the serialised body does
    // not contain the string in ANAM_API_KEY."
    return {
      sessionToken,
      timeLimitSecs: interview.timeLimitSecs,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
