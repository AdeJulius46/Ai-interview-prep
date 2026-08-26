// Gate 0: "test:boot starts the Nest app in a testing module and asserts
// GET /api/health returns 200 with { db: 'up' }." See testing.md, gate:0.
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load the full, valid test environment before anything under src/ reads
// process.env (env.validation runs at ConfigModule construction time).
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Boot (happy path)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots and GET /api/health returns 200 { db: "up" } by querying Postgres', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ db: 'up' });
  });
});
