// Live room e2e coverage. See testing.md, gate:6, and frontend.md's
// `useAnamSession` / visual spec sections. The real Anam SDK is never
// loaded: `window.__ANAM_MOCK__` (set via addInitScript below) makes
// live-room.tsx's lazy import load `app/testing/anam-mock.ts` instead (see
// testing.md, "The two hard mocking rules > 1. Anam is never called in an
// automated test"). The API is mocked at the network layer with
// `page.route`, same pattern as e2e/setup.spec.ts, so this spec never
// requires a live apps/api instance.
import { test, expect, type Page } from '@playwright/test';

const INTERVIEW_ID = '22222222-2222-4222-8222-222222222222';

// Chromium's fake video/audio devices, so getUserMedia resolves with real
// (fake) MediaStreamTracks instead of hitting actual hardware or a
// permission dialog that would hang headless CI.
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

/** Stubs POST /api/interviews/:id/session-token. Resolves after `delayMs` so
 * tests can assert nothing fires before the click and (for the double-click
 * test) that a request is still in flight when a second click lands. */
async function mockSessionToken(
  page: Page,
  { timeLimitSecs = 180, delayMs = 0 }: { timeLimitSecs?: number; delayMs?: number } = {},
): Promise<{ calls: number }> {
  const state = { calls: 0 };
  await page.route(`**/api/interviews/${INTERVIEW_ID}/session-token`, async (route) => {
    state.calls += 1;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionToken: 'mock-session-token',
        timeLimitSecs,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    });
  });
  return state;
}

async function installAnamMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __ANAM_MOCK__: boolean }).__ANAM_MOCK__ = true;
  });
  // useAnamSession's end() flushes the transcript and calls /complete
  // (Phase 7). None of gate:6's assertions are about persistence, so these
  // are stubbed with an always-succeeds response purely to keep this spec
  // free of any live apps/api dependency, per this file's header comment.
  await page.route(`**/api/interviews/${INTERVIEW_ID}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: 0, skipped: 0 }),
    });
  });
  await page.route(`**/api/interviews/${INTERVIEW_ID}/complete`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: INTERVIEW_ID,
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
      }),
    });
  });
}

test.describe('Live room (/interview/[id])', () => {
  test('lands idle: Start enabled, Skip/End disabled, status pill "Ready"', async ({ page }) => {
    await installAnamMock(page);
    await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await expect(page.getByRole('button', { name: /^start interview$/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^skip question$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^end interview$/i })).toBeDisabled();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  });

  test('fires no token request before the click', async ({ page }) => {
    await installAnamMock(page);
    const state = await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);
    await page.waitForTimeout(300);

    expect(state.calls).toBe(0);
  });

  test('a second click while the request is in flight does not mint a second token', async ({
    page,
  }) => {
    await installAnamMock(page);
    const state = await mockSessionToken(page, { delayMs: 500 });
    await page.goto(`/interview/${INTERVIEW_ID}`);

    const startButton = page.getByRole('button', { name: /start interview|connecting/i });
    await startButton.click();
    // The button disables itself on the next render, but the click handler's
    // own re-entrancy guard is what's actually under test here — dispatch a
    // second click immediately, before the request resolves.
    await startButton.click({ force: true });
    await page.waitForTimeout(700);

    expect(state.calls).toBe(1);
  });

  test('becomes live only on SESSION_READY, not when the stream promise resolves', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();

    // Mock timeline: streamToVideoElement resolves at ~300ms,
    // SESSION_READY fires 400ms after that (~700ms). At 500ms the stream is
    // attached but SESSION_READY has not fired yet — Skip must still be
    // disabled.
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /^skip question$/i })).toBeDisabled();
    await expect(page.getByText('Live', { exact: true })).not.toBeVisible();

    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('button', { name: /^skip question$/i })).toBeEnabled();
  });

  test('after ready: pill "Live", Skip/End enabled, Start disabled, countdown running', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page, { timeLimitSecs: 180 });
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    await expect(page.getByRole('button', { name: /^start interview$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^skip question$/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^end interview$/i })).toBeEnabled();
    // Countdown started at SESSION_READY: the remaining-time readout is
    // present and counting down from the full limit (formatted m:ss), not
    // null/absent. Match loosely on the minute digit since scheduling under
    // load can let a second or two tick by before this assertion runs.
    await expect(page.getByText(/[23]:\d\d remaining/)).toBeVisible();
  });

  test('the timer reaching zero auto-ends the session with the "Time\'s up" message', async ({
    page,
  }) => {
    await installAnamMock(page);
    await mockSessionToken(page, { timeLimitSecs: 5 });
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    await expect(page.getByText("Time's up. Scoring your answers.")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByRole('button', { name: /^end interview$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^skip question$/i })).toBeDisabled();
  });

  test('after End, stopStreaming is called and no media tracks remain live', async ({ page }) => {
    await installAnamMock(page);
    await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    await page.getByRole('button', { name: /^end interview$/i }).click();
    await expect(page.getByRole('button', { name: /^end interview$/i })).toBeDisabled();

    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __anamMockCallLog?: string[];
        __anamMockLocalStream?: MediaStream;
      };
      return {
        calls: w.__anamMockCallLog ?? [],
        tracksAllEnded:
          w.__anamMockLocalStream?.getTracks().every((t) => t.readyState === 'ended') ?? false,
      };
    });

    expect(result.calls).toContain('stopStreaming');
    expect(result.tracksAllEnded).toBe(true);
  });

  test('navigating away mid-session calls teardown', async ({ page }) => {
    await installAnamMock(page);
    await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 6000 });

    const logBeforeNav = await page.evaluate(
      () => (window as unknown as { __anamMockCallLog?: string[] }).__anamMockCallLog ?? [],
    );
    expect(logBeforeNav).not.toContain('stopStreaming');

    // `useAnamSession`'s teardown effect listens for `pagehide` — one of
    // the paths frontend.md requires ("beforeunload and pagehide") — and,
    // like a real navigation, it runs synchronously with no `await` before
    // the mock's `stopStreaming` (itself synchronous internally) actually
    // stops tracks and logs the call. Firing it directly on the still-live
    // page lets the assertion read `window` state that a real cross-document
    // navigation would tear down before Playwright could observe it.
    const result = await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      const w = window as unknown as {
        __anamMockCallLog?: string[];
        __anamMockLocalStream?: MediaStream;
      };
      return {
        calls: w.__anamMockCallLog ?? [],
        tracksAllEnded:
          w.__anamMockLocalStream?.getTracks().every((t) => t.readyState === 'ended') ?? false,
      };
    });

    expect(result.calls).toContain('stopStreaming');
    expect(result.tracksAllEnded).toBe(true);
  });

  test('denying microphone permission renders the exact permission message', async ({ page }) => {
    await installAnamMock(page);
    await page.addInitScript(() => {
      const denied = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      Object.defineProperty(window.navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: denied,
      });
    });
    await mockSessionToken(page);
    await page.goto(`/interview/${INTERVIEW_ID}`);

    await page.getByRole('button', { name: /^start interview$/i }).click();

    await expect(
      page.getByText(
        "Microphone access is blocked. Allow it in your browser's site settings, then start again.",
      ),
    ).toBeVisible({ timeout: 2000 });
    await expect(page.getByText('Error', { exact: true })).toBeVisible();
  });
});
