// Gate 8: "STAR feedback". See testing.md, gate:8, and backend.md,
// "FeedbackService". The scoring LLM is never called for real: msw
// intercepts https://api.anthropic.com/* per testing.md's hard mocking
// rule #2. This file never touches Anam, so it seeds a COMPLETED interview
// with a transcript directly via Prisma rather than going through the
// session-token/messages/complete HTTP flow.
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { seedQuestions } from '../prisma/seed';
import {
  anthropicServer,
  resetCapturedAnthropicRequests,
  capturedAnthropicRequests,
  anthropicSuccessHandler,
  anthropicMalformedThenValidHandler,
  anthropicAlwaysMalformedHandler,
  COMPLETE_STAR_RESULT,
  INCOMPLETE_STAR_RESULT,
} from './msw/anthropic-handlers';

async function truncateAll(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "AnswerFeedback", "Feedback", "InterviewQuestion", "Interview", "Question" RESTART IDENTITY CASCADE;',
  );
}

describe('STAR feedback (feedback)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    anthropicServer.listen({ onUnhandledRequest: 'bypass' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    anthropicServer.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedQuestions(prisma);
    anthropicServer.resetHandlers();
    anthropicServer.use(anthropicSuccessHandler());
    resetCapturedAnthropicRequests();
  });

  const setupBody = {
    role: 'Frontend Engineer',
    seniority: 'MID' as const,
    competencies: ['OWNERSHIP'] as const,
    questionCount: 1,
  };

  function line(
    speaker: 'INTERVIEWER' | 'CANDIDATE',
    content: string,
    sequence: number,
  ) {
    return { speaker, content, spokenAt: new Date(), sequence };
  }

  /** Creates an interview and seeds it directly to COMPLETED with a
   * two-turn transcript (one question, one candidate reply) — enough to
   * pass the >= 2 candidate turns floor when a second candidate turn is
   * added by the caller, or exactly at the floor with the default. */
  async function createCompletedInterview(
    messages: ReturnType<typeof line>[] = [
      line('INTERVIEWER', 'Question one. Tell me about a time you owned a project end to end.', 0),
      line('CANDIDATE', 'Sure — I led the billing migration end to end.', 1),
      line('CANDIDATE', 'The result was a 20% drop in failed payments.', 2),
    ],
  ): Promise<string> {
    const created = await request(app.getHttpServer()).post('/api/interviews').send(setupBody);
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    await prisma.interview.update({ where: { id }, data: { status: 'COMPLETED' } });
    await prisma.message.createMany({
      data: messages.map((m) => ({ ...m, interviewId: id, source: 'sdk' })),
    });

    return id;
  }

  it('given the "missing Action and Result" fixture, persists hasAction:false and hasResult:false', async () => {
    anthropicServer.use(anthropicSuccessHandler(INCOMPLETE_STAR_RESULT));
    const id = await createCompletedInterview();

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(201);

    const answer = res.body.answers[0];
    expect(answer.hasAction).toBe(false);
    expect(answer.hasResult).toBe(false);
  });

  it('computes overallScore as the arithmetic mean of answer scores in TypeScript, not the model\'s claim', async () => {
    const twoAnswerResult = {
      answers: [
        { ...COMPLETE_STAR_RESULT.answers[0], questionIndex: 0, score: 2 },
        { ...COMPLETE_STAR_RESULT.answers[0], questionIndex: 1, score: 4 },
      ],
      strengths: ['A', 'B'],
      overallScore: 999, // the model's own claim, if it made one, must be ignored
    };
    anthropicServer.use(anthropicSuccessHandler(twoAnswerResult));
    const id = await createCompletedInterview([
      line('INTERVIEWER', 'Question one. First question.', 0),
      line('CANDIDATE', 'First answer.', 1),
      line('INTERVIEWER', 'Question two. Second question.', 2),
      line('CANDIDATE', 'Second answer.', 3),
    ]);

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(201);
    expect(res.body.overallScore).toBe(3); // mean(2, 4), never 999
  });

  it('triggers exactly one retry on the malformed fixture, and the retried prompt includes the parse error', async () => {
    anthropicServer.use(anthropicMalformedThenValidHandler());
    const id = await createCompletedInterview();

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(201);

    expect(capturedAnthropicRequests).toHaveLength(2);
    expect(capturedAnthropicRequests[1].prompt).toContain('could not be parsed');
  });

  it('two malformed responses produce a 502 ScoringFailed and persist no Feedback row', async () => {
    anthropicServer.use(anthropicAlwaysMalformedHandler());
    const id = await createCompletedInterview();

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('ScoringFailed');

    const feedback = await prisma.feedback.findUnique({ where: { interviewId: id } });
    expect(feedback).toBeNull();
  });

  it('calling POST /feedback twice makes exactly one outbound LLM request', async () => {
    const id = await createCompletedInterview();

    const first = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(second.status).toBe(201);

    expect(capturedAnthropicRequests).toHaveLength(1);
    expect(second.body.id).toBe(first.body.id);
  });

  it('a transcript with fewer than two candidate turns returns 409 TranscriptTooShort', async () => {
    const id = await createCompletedInterview([
      line('INTERVIEWER', 'Question one. Tell me about a time.', 0),
      line('CANDIDATE', 'Just one turn.', 1),
    ]);

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TranscriptTooShort');
  });

  it('segments a transcript with one question and two probes into exactly one AnswerFeedback', async () => {
    const id = await createCompletedInterview([
      line('INTERVIEWER', 'Question one. Tell me about a time you disagreed with a peer.', 0),
      line('CANDIDATE', 'We disagreed on the approach.', 1),
      line('INTERVIEWER', 'What did you personally do?', 2), // probe, no marker
      line('CANDIDATE', 'I proposed a compromise.', 3),
      line('INTERVIEWER', 'What was the outcome?', 4), // probe, no marker
      line('CANDIDATE', 'We shipped on time.', 5),
    ]);

    const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/feedback`).send();
    expect(res.status).toBe(201);
    expect(res.body.answers).toHaveLength(1);
  });
});
