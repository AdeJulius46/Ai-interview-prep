// msw handlers for the API's outbound calls to Anam. See testing.md, "hard
// mocking rule #1": Anam is never called for real in an automated test.
// `setupServer` intercepts Node's fetch/http so AnamService's real
// `fetch()` call never leaves the process.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export interface CapturedAnamRequest {
  url: string;
  authorization: string | null;
  body: {
    clientLabel: string;
    personaConfig: Record<string, unknown>;
    sessionOptions?: Record<string, unknown>;
  };
}

export const capturedAnamRequests: CapturedAnamRequest[] = [];

export function resetCapturedAnamRequests(): void {
  capturedAnamRequests.length = 0;
}

const FIXTURE_SESSION_TOKEN = 'anam-mock-session-token-abc123';
const FIXTURE_SESSION_ID = 'anam-mock-session-id-xyz789';

async function captureRequest(request: Request): Promise<CapturedAnamRequest> {
  const body = (await request.clone().json()) as CapturedAnamRequest['body'];
  const captured: CapturedAnamRequest = {
    url: request.url,
    authorization: request.headers.get('authorization'),
    body,
  };
  capturedAnamRequests.push(captured);
  return captured;
}

// Default success handler: fixed token, records what was sent.
const successHandler = http.post('https://api.anam.ai/v1/auth/session-token', async ({ request }) => {
  await captureRequest(request);
  return HttpResponse.json(
    { sessionToken: FIXTURE_SESSION_TOKEN, sessionId: FIXTURE_SESSION_ID },
    { status: 201 },
  );
});

export const anamServer = setupServer(successHandler);

// Failure handler set, used by the resilience tests (testing.md, "There is
// one exception handler set for failure paths (429, 500, timeout)"). The
// body is a distinctive marker string so tests can assert it never reaches
// the client-facing response.
export const UPSTREAM_ERROR_MARKER = 'upstream-secret-leak-marker-do-not-forward';

export function anam500Handler() {
  return http.post('https://api.anam.ai/v1/auth/session-token', async ({ request }) => {
    await captureRequest(request);
    return HttpResponse.json(
      { error: 'internal_error', detail: UPSTREAM_ERROR_MARKER },
      { status: 500 },
    );
  });
}

export { FIXTURE_SESSION_TOKEN, FIXTURE_SESSION_ID };

// Handlers for AnamService#getSessionTranscript (the unverified post-session
// transcript endpoint — see README.md and backend.md). Used by
// transcript.e2e-spec.ts to exercise TranscriptService's retry/backoff and
// degrade-gracefully paths (gate:7) without ever hitting a real network.
export interface AnamTranscriptLineFixture {
  role: 'user' | 'assistant';
  content: string;
  spokenAt?: string;
}

export function transcriptSuccessHandler(lines: AnamTranscriptLineFixture[]) {
  return http.get('https://api.anam.ai/v1/sessions/:sessionId/transcript', () => {
    return HttpResponse.json(lines, { status: 200 });
  });
}

export function transcriptAlwaysFailHandler() {
  return http.get('https://api.anam.ai/v1/sessions/:sessionId/transcript', () => {
    return HttpResponse.json({ error: 'not_found' }, { status: 404 });
  });
}

// Fails with 404 on the first `failCount` requests, then returns `lines`.
// Proves TranscriptService's backoff actually retries rather than giving up
// on the first failure.
export function transcriptFailThenSucceedHandler(
  failCount: number,
  lines: AnamTranscriptLineFixture[],
) {
  let calls = 0;
  return http.get('https://api.anam.ai/v1/sessions/:sessionId/transcript', () => {
    calls += 1;
    if (calls <= failCount) {
      return HttpResponse.json({ error: 'not_ready' }, { status: 404 });
    }
    return HttpResponse.json(lines, { status: 200 });
  });
}
