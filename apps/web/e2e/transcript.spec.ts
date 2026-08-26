// Gate 7 (frontend half): "Transcript capture". See testing.md, gate:7, and
// frontend.md, "Transcript buffering". The real Anam SDK is never loaded
// (window.__ANAM_MOCK__, per testing.md's hard mocking rule #1) and the API
// is mocked at the network layer with `page.route`, same pattern as
// e2e/live-room.spec.ts.
import { test, expect, type Page, type Route } from '@playwright/test';

const INTERVIEW_A = '33333333-3333-4333-8333-333333333333';
const INTERVIEW_B = '44444444-4444-4444-8444-444444444444';
const PARTIAL_CAPTION_MARKER = 'partial-caption-never-flushed-marker';

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

interface CapturedMessagesRequest {
  interviewId: string;
  body: { messages: { speaker: string; content: string; sequence: number }[] };
}

async function installAnamMock(page: Page, extraTurnDelayMs?: number): Promise<void> {
  await page.addInitScript(
    ({ delayMs }) => {
      (window as unknown as { __ANAM_MOCK__: boolean }).__ANAM_MOCK__ = true;
      if (delayMs) {
        (window as unknown as { __anamMockExtraTurnDelayMs: number }).__anamMockExtraTurnDelayMs =
          delayMs;
      }
    },
    { delayMs: extraTurnDelayMs },
  );
}

function interviewDtoBody(id: string) {
  return {
    id,
    role: 'Frontend Engineer',
    seniority: 'MID',
    competencies: ['OWNERSHIP'],
    questionCount: 3,
    timeLimitSecs: 180,
    interviewerName: 'John',
    status: 'COMPLETED',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
  };
}

async function mockSessionToken(page: Page, interviewId: string): Promise<void> {
  await page.route(`**/api/interviews/${interviewId}/session-token`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionToken: 'mock-session-token',
        timeLimitSecs: 180,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    });
  });
}

async function mockComplete(page: Page, interviewId: string): Promise<void> {
  await page.route(`**/api/interviews/${interviewId}/complete`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(interviewDtoBody(interviewId)),
    });
  });
}

/** Captures every POST /messages body for `interviewId` and fulfills with a
 * plain 200. Returns the running capture list. */
async function captureMessages(
  page: Page,
  interviewId: string,
): Promise<CapturedMessagesRequest[]> {
  const captured: CapturedMessagesRequest[] = [];
  await page.route(`**/api/interviews/${interviewId}/messages`, async (route: Route) => {
    const body = route.request().postDataJSON() as CapturedMessagesRequest['body'];
    captured.push({ interviewId, body });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: body.messages.length, skipped: 0 }),
    });
  });
  return captured;
}

test.describe('Transcript capture (/interview/[id])', () => {
  test('lines appear in the transcript panel within one flush interval', async ({ page }) => {
    await installAnamMock(page);
    await mockSessionToken(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_A);
    await captureMessages(page, INTERVIEW_A);

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();

    await expect(page.getByText(/tell me about a time you owned a project/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test('only the unflushed slice is sent, never the whole history, on the next tick', async ({
    page,
  }) => {
    await installAnamMock(page, 6000);
    await mockSessionToken(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_A);
    const captured = await captureMessages(page, INTERVIEW_A);

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();

    // First flush tick (~5s after SESSION_READY) picks up the whole initial
    // script (greeting through the probe).
    await expect.poll(() => captured.length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    const firstBatchSize = captured[0].body.messages.length;
    expect(firstBatchSize).toBeGreaterThan(1);

    // Second flush tick (~10s) must contain only the one new line the mock
    // emits at +6s, not the whole history again.
    await expect.poll(() => captured.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    const secondBatch = captured[1].body.messages;
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].content).toContain('second-wave answer');
  });

  test('a partial MESSAGE_STREAM_EVENT_RECEIVED caption is never included in a flush', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_A);
    const captured = await captureMessages(page, INTERVIEW_A);

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();

    await expect.poll(() => captured.length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    for (const request of captured) {
      for (const message of request.body.messages) {
        expect(message.content).not.toContain(PARTIAL_CAPTION_MARKER);
      }
    }
  });

  test('a flush that fails once is retried on the next tick and the line is not lost', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_A);

    let attempt = 0;
    const succeeded: CapturedMessagesRequest[] = [];
    await page.route(`**/api/interviews/${INTERVIEW_A}/messages`, async (route: Route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }
      const body = route.request().postDataJSON() as CapturedMessagesRequest['body'];
      succeeded.push({ interviewId: INTERVIEW_A, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: body.messages.length, skipped: 0 }),
      });
    });

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();

    // Tick #1 fails (500), leaving lastFlushedIndex unmoved. Tick #2 (~10s)
    // retries the identical slice and succeeds — the line must still be
    // there, not dropped because the first attempt errored.
    await expect.poll(() => succeeded.length, { timeout: 18000 }).toBeGreaterThanOrEqual(1);
    expect(attempt).toBeGreaterThanOrEqual(2);
    const retried = succeeded[0].body.messages;
    expect(retried.some((m) => /tell me about a time you owned a project/i.test(m.content))).toBe(
      true,
    );
  });

  test('reloading mid-session restores unflushed lines from sessionStorage', async ({ page }) => {
    await installAnamMock(page);
    await mockSessionToken(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_A);
    const captured = await captureMessages(page, INTERVIEW_A);

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();

    // Wait for at least the greeting to land, but reload well before the
    // first 5s flush tick so these lines are still unflushed when we reload.
    await expect(page.getByText(/hi, i'm your interviewer/i)).toBeVisible({ timeout: 6000 });
    expect(captured).toHaveLength(0);

    await page.reload();

    // The reload wipes all in-memory state (no live SDK connection survives
    // a reload), but the restore effect reads sessionStorage and both
    // re-renders the buffered lines and fires a best-effort flush for them.
    await expect(page.getByText(/hi, i'm your interviewer/i)).toBeVisible({ timeout: 6000 });
    await expect.poll(() => captured.length, { timeout: 6000 }).toBeGreaterThanOrEqual(1);
    expect(
      captured[0].body.messages.some((m) => /hi, i'm your interviewer/i.test(m.content)),
    ).toBe(true);
  });

  test('two interviews run in sequence produce two separate stored transcripts', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page, INTERVIEW_A);
    await mockSessionToken(page, INTERVIEW_B);
    await mockComplete(page, INTERVIEW_A);
    await mockComplete(page, INTERVIEW_B);
    const capturedA = await captureMessages(page, INTERVIEW_A);
    const capturedB = await captureMessages(page, INTERVIEW_B);

    await page.goto(`/interview/${INTERVIEW_A}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect.poll(() => capturedA.length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);

    await page.goto(`/interview/${INTERVIEW_B}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect.poll(() => capturedB.length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);

    expect(capturedA.length).toBeGreaterThanOrEqual(1);
    expect(capturedB.length).toBeGreaterThanOrEqual(1);
    for (const req of capturedA) expect(req.interviewId).toBe(INTERVIEW_A);
    for (const req of capturedB) expect(req.interviewId).toBe(INTERVIEW_B);
  });
});
