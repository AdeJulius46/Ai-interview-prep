// Setup screen e2e coverage. See frontend.md, "Screens > 1. Setup (/)", and
// testing.md gate:5: "Keyboard-only completion of the whole form works,
// verified in Playwright with Tab and Enter only." No `.click()` is used
// anywhere in this file — every control is reached with Tab and activated
// with Enter. The API is mocked at the network layer (`page.route`) rather
// than requiring a live `apps/api` instance; this phase never touches Anam,
// so nothing beyond `POST /api/interviews` needs stubbing.
import { test, expect, type Page, type Locator } from '@playwright/test';

const MOCK_INTERVIEW_ID = '11111111-1111-4111-8111-111111111111';

/** Presses Tab (never clicks) until `locator` is the focused element. */
async function tabTo(page: Page, locator: Locator, maxTabs = 40): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    const isFocused = await locator.evaluate((el) => el === document.activeElement);
    if (isFocused) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach element by tabbing within the step limit');
}

test.describe('Setup screen (/) — keyboard-only', () => {
  test('completes the whole form with Tab and Enter and routes to /interview/<id>', async ({
    page,
  }) => {
    let requestBody: unknown = null;

    await page.route('**/api/interviews', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      requestBody = request.postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_INTERVIEW_ID,
          role: 'Frontend Engineer',
          seniority: 'STAFF',
          competencies: ['OWNERSHIP'],
          questionCount: 3,
          timeLimitSecs: 180,
          interviewerName: 'John',
          status: 'CREATED',
          createdAt: new Date().toISOString(),
          startedAt: null,
          endedAt: null,
        }),
      });
    });

    await page.goto('/');

    // Tab into the role field (the first tabbable control) and type the
    // role. Typing is keyboard input, not a click; Tab/Enter drive every
    // control activation below.
    const roleInput = page.getByLabel(/role/i);
    await tabTo(page, roleInput);
    await page.keyboard.type('Frontend Engineer');

    // Reach the "Staff" seniority segment and activate it with Enter.
    const staffButton = page.getByRole('button', { name: /^staff$/i });
    await tabTo(page, staffButton);
    await page.keyboard.press('Enter');
    await expect(staffButton).toHaveAttribute('aria-pressed', 'true');

    // Reach the Ownership competency chip and activate it with Enter.
    const ownershipChip = page.getByRole('button', { name: /^ownership$/i });
    await tabTo(page, ownershipChip);
    await page.keyboard.press('Enter');
    await expect(ownershipChip).toHaveAttribute('aria-pressed', 'true');

    // Reach the submit button and activate it with Enter.
    const submitButton = page.getByRole('button', { name: /start setup/i });
    await tabTo(page, submitButton);
    await expect(submitButton).toBeEnabled();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`/interview/${MOCK_INTERVIEW_ID}`);
    expect(requestBody).toEqual({
      role: 'Frontend Engineer',
      seniority: 'STAFF',
      competencies: ['OWNERSHIP'],
      questionCount: 3,
    });
  });
});
