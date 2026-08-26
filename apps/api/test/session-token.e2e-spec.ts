// Gate 3: "Session token exchange". The most important gate in the
// project. See testing.md, gate:3, and backend.md, "POST
// /interviews/:id/session-token". Anam is never called for real: msw
// intercepts https://api.anam.ai/* per testing.md's "hard mocking rule #1".
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { seedQuestions } from '../prisma/seed';
import {
  anamServer,
  anam500Handler,
  capturedAnamRequests,
  resetCapturedAnamRequests,
  FIXTURE_SESSION_TOKEN,
  UPSTREAM_ERROR_MARKER,
} from './msw/anam-handlers';

async function truncateAll(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "AnswerFeedback", "Feedback", "InterviewQuestion", "Interview", "Question" RESTART IDENTITY CASCADE;',
  );
}

describe('POST /api/interviews/:id/session-token (session-token)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // 'bypass' (not 'error'): requests that don't match an Anam handler —
    // i.e. supertest's own calls into the in-process Nest app — pass
    // through untouched and silently, instead of warning. Every
    // https://api.anam.ai/* call always matches a handler registered
    // below, so the real Anam network is still never reached.
    anamServer.listen({ onUnhandledRequest: 'bypass' });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  async function createInterview() {
    const res = await request(app.getHttpServer()).post('/api/interviews').send(setupBody);
    expect(res.status).toBe(201);
    return res.body as { id: string; timeLimitSecs: number };
  }

  async function orderedQuestionTexts(interviewId: string): Promise<string[]> {
    const rows = await prisma.interviewQuestion.findMany({
      where: { interviewId },
      include: { question: true },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => r.question.text);
  }

  it('returns { sessionToken, timeLimitSecs, expiresAt } with 201', async () => {
    const interview = await createInterview();

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.sessionToken).toBe(FIXTURE_SESSION_TOKEN);
    expect(res.body.timeLimitSecs).toBe(interview.timeLimitSecs);
    expect(typeof res.body.expiresAt).toBe('string');
    expect(new Date(res.body.expiresAt).toString()).not.toBe('Invalid Date');
  });

  it('never lets the raw serialised response body contain ANAM_API_KEY', async () => {
    const interview = await createInterview();

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();

    expect(res.status).toBe(201);
    // Assert on the raw string, not the parsed object (testing.md, gate:3,
    // assertion 2).
    expect(res.text).not.toContain(process.env.ANAM_API_KEY);
  });

  it('never includes avatarId, voiceId, llmId, or systemPrompt anywhere in the response', async () => {
    const interview = await createInterview();

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();

    expect(res.status).toBe(201);
    for (const forbidden of ['avatarId', 'voiceId', 'llmId', 'systemPrompt']) {
      expect(res.text).not.toContain(forbidden);
    }
    expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'sessionToken', 'timeLimitSecs']);
  });

  it('sends Authorization: Bearer <key>, clientLabel = interview id, and every selected question text in order in systemPrompt', async () => {
    const interview = await createInterview();
    const questionTexts = await orderedQuestionTexts(interview.id);
    expect(questionTexts.length).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();
    expect(res.status).toBe(201);

    expect(capturedAnamRequests).toHaveLength(1);
    const outbound = capturedAnamRequests[0];

    expect(outbound.authorization).toBe(`Bearer ${process.env.ANAM_API_KEY}`);
    expect(outbound.body.clientLabel).toBe(interview.id);

    const systemPrompt = outbound.body.personaConfig.systemPrompt as string;
    let lastIndex = -1;
    for (const text of questionTexts) {
      const idx = systemPrompt.indexOf(text);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('sets avatarModel, maxSessionLengthSeconds, and skipGreeting inside personaConfig, not sessionOptions', async () => {
    const interview = await createInterview();

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();
    expect(res.status).toBe(201);

    const outbound = capturedAnamRequests[0];
    expect(outbound.body.personaConfig.avatarModel).toBe('cara-4-latest');
    expect(outbound.body.personaConfig.maxSessionLengthSeconds).toBe(interview.timeLimitSecs);
    expect(outbound.body.personaConfig.skipGreeting).toBe(false);

    // The field must live in personaConfig, not sessionOptions — getting
    // this wrong silently ignores the time limit (backend.md).
    if (outbound.body.sessionOptions) {
      expect(outbound.body.sessionOptions).not.toHaveProperty('maxSessionLengthSeconds');
    }
  });

  it('flips interview status CREATED -> LIVE and sets startedAt', async () => {
    const interview = await createInterview();

    const before = await prisma.interview.findUnique({ where: { id: interview.id } });
    expect(before?.status).toBe('CREATED');
    expect(before?.startedAt).toBeNull();

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();
    expect(res.status).toBe(201);

    const after = await prisma.interview.findUnique({ where: { id: interview.id } });
    expect(after?.status).toBe('LIVE');
    expect(after?.startedAt).not.toBeNull();
  });

  it('returns 409 InterviewAlreadyStarted on a second call for the same interview', async () => {
    const interview = await createInterview();

    const first = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      statusCode: 409,
      error: 'InterviewAlreadyStarted',
      message: expect.any(String),
    });
  });

  it('returns 404 InterviewNotFound for a missing interview', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interviews/00000000-0000-0000-0000-000000000000/session-token')
      .send();

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'InterviewNotFound',
      message: expect.any(String),
    });
  });

  it('maps an Anam 500 to a 502 AnamUnavailable without forwarding the upstream body', async () => {
    const interview = await createInterview();
    anamServer.use(anam500Handler());

    const res = await request(app.getHttpServer())
      .post(`/api/interviews/${interview.id}/session-token`)
      .send();

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      statusCode: 502,
      error: 'AnamUnavailable',
      message: expect.any(String),
    });
    expect(res.text).not.toContain(UPSTREAM_ERROR_MARKER);

    // Status must not have flipped to LIVE on a failed mint.
    const row = await prisma.interview.findUnique({ where: { id: interview.id } });
    expect(row?.status).toBe('CREATED');
  });

  it('never logs the API key even when Anam fails', async () => {
    const interview = await createInterview();
    anamServer.use(anam500Handler());

    const logged: string[] = [];
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation((message?: unknown) => {
      logged.push(typeof message === 'string' ? message : JSON.stringify(message));
      return undefined as unknown as void;
    });

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/interviews/${interview.id}/session-token`)
        .send();
      expect(res.status).toBe(502);
    } finally {
      errorSpy.mockRestore();
    }

    const apiKey = process.env.ANAM_API_KEY!;
    for (const line of logged) {
      expect(line).not.toContain(apiKey);
      expect(line.toLowerCase()).not.toContain('bearer ' + apiKey.toLowerCase());
    }
  });
});
