// Gate 7 (backend half): "Transcript capture". See testing.md, gate:7, and
// backend.md, "POST /interviews/:id/messages" and "POST
// /interviews/:id/complete". Anam is never called for real: msw intercepts
// https://api.anam.ai/* per testing.md's "hard mocking rule #1" — every
// test that reaches POST /complete on an interview with an anamSessionId
// MUST register a transcript handler, or the unmatched request would fall
// through to a real network call (see anamServer's 'bypass' comment below).
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
  anamServer,
  resetCapturedAnamRequests,
  FIXTURE_SESSION_ID,
  transcriptSuccessHandler,
  transcriptAlwaysFailHandler,
  transcriptFailThenSucceedHandler,
} from './msw/anam-handlers';

async function truncateAll(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "AnswerFeedback", "Feedback", "InterviewQuestion", "Interview", "Question" RESTART IDENTITY CASCADE;',
  );
}

describe('Transcript capture (transcript)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    anamServer.listen({ onUnhandledRequest: 'bypass' });

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
    anamServer.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedQuestions(prisma);
    anamServer.resetHandlers();
    resetCapturedAnamRequests();
  });

  const setupBody = {
    role: 'Frontend Engineer',
    seniority: 'MID' as const,
    competencies: ['OWNERSHIP', 'CONFLICT'] as const,
    questionCount: 3,
  };

  // Creates an interview and starts its session, landing it in LIVE with
  // anamSessionId = FIXTURE_SESSION_ID (the default success handler in
  // anam-handlers.ts, active unless a test overrides it below).
  async function createLiveInterview(): Promise<string> {
    const created = await request(app.getHttpServer()).post('/api/interviews').send(setupBody);
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const started = await request(app.getHttpServer())
      .post(`/api/interviews/${id}/session-token`)
      .send();
    expect(started.status).toBe(201);

    return id;
  }

  function line(speaker: 'INTERVIEWER' | 'CANDIDATE', content: string, sequence: number) {
    return { speaker, content, spokenAt: new Date().toISOString(), sequence };
  }

  describe('POST /:id/messages', () => {
    it('appending the same batch twice yields accepted:N then accepted:0, skipped:N', async () => {
      const id = await createLiveInterview();
      const batch = [
        line('INTERVIEWER', 'Question one. Tell me about a time you disagreed with a peer.', 0),
        line('CANDIDATE', 'Sure, here is a situation...', 1),
      ];

      const first = await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({ messages: batch });
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ accepted: 2, skipped: 0 });

      const second = await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({ messages: batch });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ accepted: 0, skipped: 2 });
    });

    it('re-sending a sequence with changed content updates the stored row rather than skipping it', async () => {
      const id = await createLiveInterview();
      await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({
          messages: [
            line('INTERVIEWER', 'Question one. Tell me about a time...', 0),
            line('CANDIDATE', 'Original answer text.', 1),
          ],
        });

      const res = await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({
          messages: [
            line('INTERVIEWER', 'Question one. Tell me about a time...', 0),
            line('CANDIDATE', 'Corrected answer text after interruption.', 1),
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accepted: 1, skipped: 1 });

      const stored = await prisma.message.findFirst({ where: { interviewId: id, sequence: 1 } });
      expect(stored?.content).toBe('Corrected answer text after interruption.');
    });

    it('returns 409 when appending to a COMPLETED interview', async () => {
      const id = await createLiveInterview();
      anamServer.use(transcriptSuccessHandler([]));
      await request(app.getHttpServer()).post(`/api/interviews/${id}/complete`).send();

      const res = await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({ messages: [line('CANDIDATE', 'too late', 0)] });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('InterviewAlreadyCompleted');
    });
  });

  describe('POST /:id/complete', () => {
    it('inserts exactly the one line the SDK missed, with source anam-api and a sequence after the existing max', async () => {
      const id = await createLiveInterview();
      await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({
          messages: [
            line('INTERVIEWER', 'Question one. Tell me about a time you disagreed.', 0),
            line('CANDIDATE', 'Here is my situation and task.', 1),
          ],
        });

      anamServer.use(
        transcriptSuccessHandler([
          { role: 'assistant', content: 'Question one. Tell me about a time you disagreed.' },
          { role: 'user', content: 'Here is my situation and task.' },
          { role: 'user', content: 'And the result was a 20% improvement.' },
        ]),
      );

      const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/complete`).send();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');

      const messages = await prisma.message.findMany({
        where: { interviewId: id },
        orderBy: { sequence: 'asc' },
      });
      expect(messages).toHaveLength(3);
      const inserted = messages[2];
      expect(inserted.source).toBe('anam-api');
      expect(inserted.content).toBe('And the result was a 20% improvement.');
      expect(inserted.sequence).toBe(2);
    });

    it('still completes when the transcript endpoint 404s twice then succeeds on the third attempt', async () => {
      const id = await createLiveInterview();
      await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({ messages: [line('INTERVIEWER', 'Question one.', 0)] });

      anamServer.use(
        transcriptFailThenSucceedHandler(2, [
          { role: 'assistant', content: 'Question one.' },
          { role: 'user', content: 'A missed candidate line.' },
        ]),
      );

      const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/complete`).send();
      expect(res.status).toBe(200);

      const messages = await prisma.message.findMany({ where: { interviewId: id } });
      expect(messages.some((m) => m.source === 'anam-api')).toBe(true);
    });

    it('still returns 200 and leaves the SDK-only transcript intact when the transcript endpoint fails all three attempts', async () => {
      const id = await createLiveInterview();
      await request(app.getHttpServer())
        .post(`/api/interviews/${id}/messages`)
        .send({ messages: [line('INTERVIEWER', 'Question one.', 0)] });

      anamServer.use(transcriptAlwaysFailHandler());

      const res = await request(app.getHttpServer()).post(`/api/interviews/${id}/complete`).send();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');

      const messages = await prisma.message.findMany({ where: { interviewId: id } });
      expect(messages).toHaveLength(1);
      expect(messages.every((m) => m.source === 'sdk')).toBe(true);
    });
  });
});
