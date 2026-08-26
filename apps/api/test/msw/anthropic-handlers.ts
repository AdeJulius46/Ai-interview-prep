// msw handlers for the API's outbound calls to the scoring LLM. See
// testing.md, hard mocking rule #2: "The scoring LLM is never called in an
// automated test." Three fixtures per that rule: a complete STAR answer, an
// answer missing Action and Result, and a malformed response with markdown
// fences and a trailing comma (proves the parse-retry path).
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const capturedAnthropicRequests: { prompt: string }[] = [];

export function resetCapturedAnthropicRequests(): void {
  capturedAnthropicRequests.length = 0;
}

function textResponse(text: string) {
  return HttpResponse.json({ content: [{ type: 'text', text }] }, { status: 200 });
}

async function captureAndReturn(request: Request, text: string) {
  const body = (await request.clone().json()) as { messages: { content: string }[] };
  capturedAnthropicRequests.push({ prompt: body.messages[0]?.content ?? '' });
  return textResponse(text);
}

// A complete STAR answer for question 0, used as the default fixture.
export const COMPLETE_STAR_RESULT = {
  answers: [
    {
      questionIndex: 0,
      question: 'Tell me about a time you owned a project end to end.',
      answerSummary: 'Led the billing service migration end to end, improving reliability.',
      hasSituation: true,
      hasTask: true,
      hasAction: true,
      hasResult: true,
      score: 4,
      improvement: 'Quantify the reliability improvement with a specific metric.',
    },
  ],
  strengths: ['Clear ownership', 'Structured explanation'],
};

// Missing Action and Result — the challenge's own stated test case (a
// deliberately incomplete answer must be caught).
export const INCOMPLETE_STAR_RESULT = {
  answers: [
    {
      questionIndex: 0,
      question: 'Tell me about a time you owned a project end to end.',
      answerSummary: 'Described a situation and a task but never said what they did or what happened.',
      hasSituation: true,
      hasTask: true,
      hasAction: false,
      hasResult: false,
      score: 2,
      improvement: 'State the specific actions taken and the measurable outcome.',
    },
  ],
  strengths: ['Clear situation description', 'Sets up the task well'],
};

export function anthropicSuccessHandler(result: unknown = COMPLETE_STAR_RESULT) {
  return http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    return captureAndReturn(request, JSON.stringify(result));
  });
}

// Malformed on the first call, valid strict JSON on the second — proves the
// parse-retry path (backend.md: "On parse failure, retry once with the
// parse error appended to the prompt").
export function anthropicMalformedThenValidHandler(result: unknown = COMPLETE_STAR_RESULT) {
  let calls = 0;
  return http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    calls += 1;
    if (calls === 1) {
      // Markdown fences + a trailing comma — testing.md, gate:8: "a
      // malformed response with markdown fences and a trailing comma".
      const malformed = '```json\n{"answers": [,],"strengths": [}\n```';
      return captureAndReturn(request, malformed);
    }
    return captureAndReturn(request, JSON.stringify(result));
  });
}

// Malformed on every call — proves the "two malformed responses produce a
// 502 and persist nothing" path.
export function anthropicAlwaysMalformedHandler() {
  return http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const malformed = '```json\n{"answers": [,],"strengths": [}\n```';
    return captureAndReturn(request, malformed);
  });
}

export const anthropicServer = setupServer(anthropicSuccessHandler());
