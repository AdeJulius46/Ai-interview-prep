// Gate 10: "Full path". See testing.md, gate:10. One mocked-network,
// mocked-SDK walk through every screen: Setup -> Live room (auto-ends on a
// shortened timer) -> Feedback (LLM mocked) -> History. Plus the
// cross-cutting checks gate:10 requires on all four screens: zero
// serious/critical axe violations, no horizontal scroll at 375px, and
// `prefers-reduced-motion` disabling the status pulse.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const INTERVIEW_ID = '55555555-5555-4555-8555-555555555555';

const INTERVIEW_SUMMARY = {
  id: INTERVIEW_ID,
  role: 'Frontend Engineer',
  seniority: 'MID',
  competencies: ['OWNERSHIP'],
  questionCount: 1,
  timeLimitSecs: 5,
  interviewerName: 'John',
  status: 'CREATED',
  createdAt: new Date().toISOString(),
  startedAt: null,
  endedAt: null,
};

const FEEDBACK_FIXTURE = {
  id: '66666666-6666-4666-8666-666666666666',
  interviewId: INTERVIEW_ID,
  createdAt: new Date().toISOString(),
  overallScore: 4,
  strengths: ['Clear ownership', 'Structured explanation'],
  answers: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      questionIndex: 0,
      question: 'Tell me about a time you owned a project end to end.',
      answerSummary: 'Led the billing migration end to end.',
      hasSituation: true,
      hasTask: true,
      hasAction: true,
      hasResult: true,
      score: 4,
      improvement: 'Quantify the improvement with a specific metric.',
    },
  ],
};

async function mockEverything(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __ANAM_MOCK__: boolean }).__ANAM_MOCK__ = true;
  });

  await page.route('**/api/interviews', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(INTERVIEW_SUMMARY),
    });
  });

  await page.route(`**/api/interviews/${INTERVIEW_ID}/session-token`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionToken: 'mock-session-token',
        timeLimitSecs: 5,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
  });

  await page.route(`**/api/interviews/${INTERVIEW_ID}/messages`, async (route) => {
    const body = route.request().postDataJSON() as { messages: unknown[] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: body.messages.length, skipped: 0 }),
    });
  });

  await page.route(`**/api/interviews/${INTERVIEW_ID}/complete`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...INTERVIEW_SUMMARY, status: 'COMPLETED', endedAt: new Date().toISOString() }),
    });
  });

  await page.route(`**/api/interviews/${INTERVIEW_ID}/feedback`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(FEEDBACK_FIXTURE),
    });
  });

  // A RegExp, not a glob string: Playwright glob patterns treat a literal
  // "?" as a single-character wildcard, not the query-string separator, so
  // a glob here risks ambiguously matching (or shadowing) the plain
  // POST /api/interviews route above.
  await page.route(/\/api\/interviews\?/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ ...INTERVIEW_SUMMARY, status: 'SCORED', overallScore: 4 }],
        nextCursor: null,
      }),
    });
  });

  await page.route('**/api/progress', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [{ id: INTERVIEW_ID, completedAt: new Date().toISOString(), overallScore: 4, role: 'Frontend Engineer' }],
        trend: { first: 4, latest: 4, delta: 0, sessionCount: 1 },
        starCoverage: { situation: 1, task: 1, action: 1, result: 1 },
      }),
    });
  });
}

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe('Full path', () => {
  test('setup -> live room (auto-ends) -> feedback -> history, one continuous walk', async ({
    page,
  }) => {
    await mockEverything(page);

    await page.goto('/');
    await page.getByLabel(/role/i).fill('Frontend Engineer');
    await page.getByRole('button', { name: /^mid$/i }).click();
    await page.getByRole('button', { name: /^ownership$/i }).click();
    await page.getByRole('button', { name: /start setup/i }).click();

    await expect(page).toHaveURL(`/interview/${INTERVIEW_ID}`, { timeout: 10000 });

    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    // timeLimitSecs: 5 — the timer reaches zero and auto-ends, which
    // triggers the final flush, /complete, then a client-side navigation
    // to the feedback screen (live-room.tsx's `state === 'ended'` effect).
    await expect(page).toHaveURL(`/interview/${INTERVIEW_ID}/feedback`, { timeout: 12000 });

    await expect(page.getByRole('heading', { name: /star report/i })).toBeVisible();
    await expect(page.getByText(/owned a project end to end/i)).toBeVisible();
    await expect(page.getByText('Clear ownership')).toBeVisible();

    await page.goto('/history');
    await expect(page.getByText('Frontend Engineer')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/situation/i)).toBeVisible();
  });

  test('has no serious or critical accessibility violations on all four screens', async ({
    page,
  }) => {
    await mockEverything(page);

    async function assertNoSeriousViolations(label: string) {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious, `${label}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }

    await page.goto('/');
    await assertNoSeriousViolations('Setup');

    await page.getByLabel(/role/i).fill('Frontend Engineer');
    await page.getByRole('button', { name: /^ownership$/i }).click();
    await page.getByRole('button', { name: /start setup/i }).click();
    await expect(page).toHaveURL(`/interview/${INTERVIEW_ID}`, { timeout: 10000 });
    await assertNoSeriousViolations('Live room (idle)');

    await page.route(`**/api/interviews/${INTERVIEW_ID}/feedback`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(FEEDBACK_FIXTURE),
      });
    });
    await page.goto(`/interview/${INTERVIEW_ID}/feedback`);
    await expect(page.getByRole('heading', { name: /star report/i })).toBeVisible();
    await assertNoSeriousViolations('Feedback');

    await page.goto('/history');
    await expect(page.getByText('Frontend Engineer')).toBeVisible({ timeout: 10000 });
    await assertNoSeriousViolations('History');
  });

  test('is usable at 375px with no horizontal scroll on any screen', async ({ page }) => {
    await mockEverything(page);
    await page.setViewportSize({ width: 375, height: 812 });

    async function assertNoHorizontalScroll(label: string) {
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflowing, `${label} overflows horizontally at 375px`).toBe(false);
    }

    await page.goto('/');
    await assertNoHorizontalScroll('Setup');

    await page.getByLabel(/role/i).fill('Frontend Engineer');
    await page.getByRole('button', { name: /^ownership$/i }).click();
    await page.getByRole('button', { name: /start setup/i }).click();
    await expect(page).toHaveURL(`/interview/${INTERVIEW_ID}`, { timeout: 10000 });
    await assertNoHorizontalScroll('Live room');

    await page.goto(`/interview/${INTERVIEW_ID}/feedback`);
    await expect(page.getByRole('heading', { name: /star report/i })).toBeVisible();
    await assertNoHorizontalScroll('Feedback');

    await page.goto('/history');
    await expect(page.getByText('Frontend Engineer')).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalScroll('History');
  });

  test('prefers-reduced-motion disables the status pulse', async ({ page }) => {
    await mockEverything(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto(`/interview/${INTERVIEW_ID}`);
    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    const pulseDot = page.locator('.ui-status-pulse');
    await expect(pulseDot).toBeVisible();
    const animationName = await pulseDot.evaluate(
      (el) => getComputedStyle(el).animationName,
    );
    expect(animationName).toBe('none');
  });
});
