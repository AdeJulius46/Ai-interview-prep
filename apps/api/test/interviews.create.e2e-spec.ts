// Gate 2: "Interview setup and question bank". See testing.md, gate:2, and
// backend.md, "POST /interviews" and "QuestionBankService".
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, Competency } from '@prisma/client';
import { CompetencySchema } from '@coach/contracts';
import { AppModule } from '../src/app.module';
import { seedQuestions, SEED_QUESTIONS } from '../prisma/seed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function truncateAll(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "AnswerFeedback", "Feedback", "InterviewQuestion", "Interview", "Question" RESTART IDENTITY CASCADE;',
  );
}

describe('POST /api/interviews (interviews.create)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedQuestions(prisma);
  });

  const validBody = {
    role: 'Frontend Engineer',
    seniority: 'MID' as const,
    competencies: ['OWNERSHIP', 'CONFLICT'] as const,
    questionCount: 3,
  };

  it('returns 201 with a uuid and the echoed setup', async () => {
    const res = await request(app.getHttpServer()).post('/api/interviews').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(UUID_RE);
    expect(res.body.role).toBe(validBody.role);
    expect(res.body.seniority).toBe(validBody.seniority);
    expect(res.body.competencies).toEqual(validBody.competencies);
    expect(res.body.questionCount).toBe(validBody.questionCount);
    expect(res.body.status).toBe('CREATED');
    expect(res.body.interviewerName).toBe('John');
  });

  it('persists the row in Postgres with the right competencies array', async () => {
    const res = await request(app.getHttpServer()).post('/api/interviews').send(validBody);

    const row = await prisma.interview.findUnique({ where: { id: res.body.id } });
    expect(row).not.toBeNull();
    expect(row?.role).toBe(validBody.role);
    expect(row?.seniority).toBe(validBody.seniority);
    expect(row?.competencies).toEqual(validBody.competencies);
  });

  it('clamps timeLimitSecs to 180 even when the client sends 999 in the body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interviews')
      .send({ ...validBody, timeLimitSecs: 999 });

    expect(res.status).toBe(201);
    expect(res.body.timeLimitSecs).toBe(180);

    const row = await prisma.interview.findUnique({ where: { id: res.body.id } });
    expect(row?.timeLimitSecs).toBe(180);
  });

  // ApiErrorBodySchema's `error` field is the closed ApiErrorCodeSchema enum
  // of business error codes the frontend branches on (InterviewNotFound,
  // AnamUnavailable, ...). A request-validation 400 is not one of those
  // named cases, so it is checked against the general envelope shape
  // (statusCode/error/message) rather than parsed through the full,
  // enum-restricted schema.
  function expectApiErrorEnvelope(body: unknown, statusCode: number) {
    expect(body).toMatchObject({
      statusCode,
      error: expect.any(String),
      message: expect.any(String),
    });
  }

  it('returns 400 with the ApiErrorBody shape for an invalid body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interviews')
      .send({ ...validBody, role: 'x' }); // role must be 2-80 chars

    expect(res.status).toBe(400);
    expectApiErrorEnvelope(res.body, 400);
  });

  it('returns 400 with the ApiErrorBody shape for an unknown competency string', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interviews')
      .send({ ...validBody, competencies: ['NOT_A_COMPETENCY'] });

    expect(res.status).toBe(400);
    expectApiErrorEnvelope(res.body, 400);
  });

  it('silently strips unknown fields rather than rejecting the request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interviews')
      .send({ ...validBody, isAdmin: true });

    expect(res.status).toBe(201);
    expect(res.body.isAdmin).toBeUndefined();
  });

  describe('question bank', () => {
    it('seeded bank has at least 6 questions per competency', async () => {
      for (const competency of CompetencySchema.options) {
        const count = await prisma.question.count({ where: { competency } });
        expect(count).toBeGreaterThanOrEqual(6);
      }
      // sanity check on the fixture itself, so a future edit to seed.ts
      // that drops below 6 per competency fails loudly here too.
      const byCompetency = new Map<Competency, number>();
      for (const q of SEED_QUESTIONS) {
        byCompetency.set(q.competency, (byCompetency.get(q.competency) ?? 0) + 1);
      }
      for (const n of byCompetency.values()) {
        expect(n).toBeGreaterThanOrEqual(6);
      }
    });

    it('selects 3 questions for SENIOR + [CONFLICT, FAILURE], all matching competency and seniority', async () => {
      const res = await request(app.getHttpServer()).post('/api/interviews').send({
        role: 'Staff Engineer',
        seniority: 'SENIOR',
        competencies: ['CONFLICT', 'FAILURE'],
        questionCount: 3,
      });

      expect(res.status).toBe(201);
      expect(res.body.questionCount).toBe(3);

      const rows = await prisma.interviewQuestion.findMany({
        where: { interviewId: res.body.id },
        include: { question: true },
        orderBy: { position: 'asc' },
      });

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(['CONFLICT', 'FAILURE']).toContain(row.question.competency);
        expect(row.question.seniority).toContain('SENIOR');
      }
      // positions are 0-based and contiguous
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('yields a different question set on repeated identical setups (at least 8 distinct out of 10)', async () => {
      const body = {
        role: 'Staff Engineer',
        seniority: 'SENIOR',
        competencies: ['CONFLICT', 'FAILURE'],
        questionCount: 3,
      };

      const signatures = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer()).post('/api/interviews').send(body);
        expect(res.status).toBe(201);

        const rows = await prisma.interviewQuestion.findMany({
          where: { interviewId: res.body.id },
          select: { questionId: true },
        });
        signatures.add(rows.map((r) => r.questionId).sort().join(','));
      }

      expect(signatures.size).toBeGreaterThanOrEqual(8);
    });

    it('changing competencies changes the selected competencies', async () => {
      const resA = await request(app.getHttpServer()).post('/api/interviews').send({
        role: 'Engineer',
        seniority: 'MID',
        competencies: ['OWNERSHIP'],
        questionCount: 3,
      });
      const resB = await request(app.getHttpServer()).post('/api/interviews').send({
        role: 'Engineer',
        seniority: 'MID',
        competencies: ['DELIVERY'],
        questionCount: 3,
      });

      const rowsA = await prisma.interviewQuestion.findMany({
        where: { interviewId: resA.body.id },
        include: { question: true },
      });
      const rowsB = await prisma.interviewQuestion.findMany({
        where: { interviewId: resB.body.id },
        include: { question: true },
      });

      const competenciesA = new Set(rowsA.map((r) => r.question.competency));
      const competenciesB = new Set(rowsB.map((r) => r.question.competency));

      expect(competenciesA).toEqual(new Set(['OWNERSHIP']));
      expect(competenciesB).toEqual(new Set(['DELIVERY']));
    });

    it('reduces questionCount instead of repeating a question when the pool is smaller than requested', async () => {
      // Replace the seeded bank with a deliberately small pool: only 2
      // active OWNERSHIP questions suit JUNIOR.
      await truncateAll(prisma);
      await prisma.question.createMany({
        data: [
          { competency: 'OWNERSHIP', seniority: ['JUNIOR'], text: 'Small pool question one.' },
          { competency: 'OWNERSHIP', seniority: ['JUNIOR'], text: 'Small pool question two.' },
        ],
      });

      const res = await request(app.getHttpServer()).post('/api/interviews').send({
        role: 'Engineer',
        seniority: 'JUNIOR',
        competencies: ['OWNERSHIP'],
        questionCount: 5,
      });

      expect(res.status).toBe(201);
      expect(res.body.questionCount).toBe(2);

      const rows = await prisma.interviewQuestion.findMany({
        where: { interviewId: res.body.id },
      });
      expect(rows).toHaveLength(2);
      const uniqueQuestionIds = new Set(rows.map((r) => r.questionId));
      expect(uniqueQuestionIds.size).toBe(2); // no repeats

      const row = await prisma.interview.findUnique({ where: { id: res.body.id } });
      expect(row?.questionCount).toBe(2);
    });
  });
});
