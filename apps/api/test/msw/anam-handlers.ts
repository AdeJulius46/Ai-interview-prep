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
