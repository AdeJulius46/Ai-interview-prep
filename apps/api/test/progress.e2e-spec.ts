// Gate 9: "Progress". See testing.md, gate:9, and backend.md, "GET
// /progress" and "History list". Seeds interviews and feedback directly via
// Prisma — this phase is about the read-side aggregation, not how a
// SCORED status is reached (Phases 7-8 already cover that).
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { seedQuestions } from '../prisma/seed';

async function truncateAll(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "AnswerFeedback", "Feedback", "InterviewQuestion", "Interview", "Question" RESTART IDENTITY CASCADE;',
  );
}

describe('Progress and history (progress)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedQuestions(prisma);
  });

  async function createInterview(overrides: Partial<{
    role: string;
    status: 'CREATED' | 'LIVE' | 'COMPLETED' | 'SCORED' | 'ABANDONED';
    createdAt: Date;
    endedAt: Date | null;
  }> = {}) {
    const created = await prisma.interview.create({
      data: {
        role: overrides.role ?? 'Frontend Engineer',
        seniority: 'MID',
        competencies: ['OWNERSHIP'],
        status: overrides.status ?? 'CREATED',
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
        ...(overrides.endedAt !== undefined ? { endedAt: overrides.endedAt } : {}),
      },
    });
    return created.id;
  }

  async function scoreInterview(interviewId: string, overallScore: number, answers: {
    hasSituation: boolean;
    hasTask: boolean;
    hasAction: boolean;
    hasResult: boolean;
  }[]) {
    await prisma.feedback.create({
      data: {
        interviewId,
        overallScore,
        strengths: ['Strength A', 'Strength B'],
        model: 'test-model',
        rawResponse: {},
        answers: {
          create: answers.map((a, i) => ({
            questionIndex: i,
            question: `Question ${i}`,
            answerSummary: 'Summary',
            hasSituation: a.hasSituation,
            hasTask: a.hasTask,
            hasAction: a.hasAction,
            hasResult: a.hasResult,
            score: 3,
            improvement: 'Be more specific.',
          })),
        },
      },
    });
    await prisma.interview.update({ where: { id: interviewId }, data: { status: 'SCORED' } });
  }

  describe('GET /progress', () => {
    it('three seeded scored interviews produce a trend with correct first, latest, delta', async () => {
      const day = (n: number) => new Date(Date.UTC(2026, 0, n));
      const id1 = await createInterview({ createdAt: day(1) });
      await scoreInterview(id1, 2.5, [{ hasSituation: true, hasTask: true, hasAction: true, hasResult: true }]);
      const id2 = await createInterview({ createdAt: day(2) });
      await scoreInterview(id2, 3.0, [{ hasSituation: true, hasTask: true, hasAction: true, hasResult: true }]);
      const id3 = await createInterview({ createdAt: day(3) });
      await scoreInterview(id3, 4.5, [{ hasSituation: true, hasTask: true, hasAction: true, hasResult: true }]);

      const res = await request(app.getHttpServer()).get('/api/progress');
      expect(res.status).toBe(200);
      expect(res.body.trend).toEqual({ first: 2.5, latest: 4.5, delta: 2.0, sessionCount: 3 });
    });

    it('computes starCoverage fractions correctly against a hand-computed fixture', async () => {
      const id = await createInterview({ createdAt: new Date() });
      await scoreInterview(id, 3, [
        { hasSituation: true, hasTask: true, hasAction: true, hasResult: false },
        { hasSituation: true, hasTask: false, hasAction: false, hasResult: false },
      ]);
      // situation: 2/2 = 1.0, task: 1/2 = 0.5, action: 1/2 = 0.5, result: 0/2 = 0.0

      const res = await request(app.getHttpServer()).get('/api/progress');
      expect(res.status).toBe(200);
      expect(res.body.starCoverage).toEqual({ situation: 1, task: 0.5, action: 0.5, result: 0 });
    });

    it('excludes unscored and abandoned interviews from the trend', async () => {
      await createInterview({ status: 'CREATED' });
      await createInterview({ status: 'LIVE' });
      await createInterview({ status: 'COMPLETED' });
      await createInterview({ status: 'ABANDONED' });
      const scoredId = await createInterview({ createdAt: new Date() });
      await scoreInterview(scoredId, 3.5, [
        { hasSituation: true, hasTask: true, hasAction: true, hasResult: true },
      ]);

      const res = await request(app.getHttpServer()).get('/api/progress');
      expect(res.status).toBe(200);
      expect(res.body.trend.sessionCount).toBe(1);
      expect(res.body.sessions).toHaveLength(1);
    });

    it('a single session returns delta: 0 rather than dividing by zero or returning null', async () => {
      const id = await createInterview({ createdAt: new Date() });
      await scoreInterview(id, 3.0, [
        { hasSituation: true, hasTask: true, hasAction: true, hasResult: true },
      ]);

      const res = await request(app.getHttpServer()).get('/api/progress');
      expect(res.status).toBe(200);
      expect(res.body.trend).toEqual({ first: 3, latest: 3, delta: 0, sessionCount: 1 });
    });
  });

  describe('GET /interviews (history)', () => {
    it('orders newest first and paginates by cursor', async () => {
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        ids.push(await createInterview({ createdAt: new Date(Date.UTC(2026, 0, i)), role: `Role ${i}` }));
      }

      const firstPage = await request(app.getHttpServer()).get('/api/interviews?limit=2');
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.items.map((i: { role: string }) => i.role)).toEqual(['Role 5', 'Role 4']);
      expect(firstPage.body.nextCursor).toBeTruthy();

      const secondPage = await request(app.getHttpServer()).get(
        `/api/interviews?limit=2&cursor=${firstPage.body.nextCursor}`,
      );
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.items.map((i: { role: string }) => i.role)).toEqual(['Role 3', 'Role 2']);
      expect(secondPage.body.nextCursor).toBeTruthy();

      const thirdPage = await request(app.getHttpServer()).get(
        `/api/interviews?limit=2&cursor=${secondPage.body.nextCursor}`,
      );
      expect(thirdPage.status).toBe(200);
      expect(thirdPage.body.items.map((i: { role: string }) => i.role)).toEqual(['Role 1']);
      expect(thirdPage.body.nextCursor).toBeNull();
    });
  });
});
