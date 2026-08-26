# Testing Specification

The point of this document is that no phase in `README.md` is allowed to be declared
finished on a manual browser check. Each phase has one command. It goes red, then the
implementation makes it green, then the next phase starts.

## Tooling

| Scope | Tool |
|---|---|
| Backend unit | Jest (Nest default) |
| Backend integration / e2e | Jest + Supertest against a real test Postgres |
| Contracts | Vitest |
| UI primitives | Vitest + React Testing Library + `jest-axe` |
| Web e2e | Playwright, Chromium with fake media devices |
| HTTP mocking | `msw/node` for the API's outbound calls to Anam and the LLM |

## The two hard mocking rules

**1. Anam is never called in an automated test.**

`msw` intercepts `https://api.anam.ai/*`. The handler returns a fixed token and a fixture
transcript. There is one exception handler set for failure paths (429, 500, timeout) used by
the resilience tests.

In Playwright, the SDK itself is stubbed. Install a fake before the app's module loads:

```ts
await page.addInitScript(() => {
  (window as any).__ANAM_MOCK__ = true;
});
```

`live-room.tsx` checks `window.__ANAM_MOCK__` in its lazy import and loads
`app/testing/anam-mock.ts` instead of the real package. That mock drives the same events on
a timer: connect after 300ms, emit a greeting, emit question one, accept a scripted candidate
turn, emit a probe. Deterministic, offline, and fast.

This is the only production-code concession to testing, and it is worth it. The alternative
is either untestable live-room logic or a real 3 minute paid session per CI run.

**2. The scoring LLM is never called in an automated test.**

`msw` returns fixture JSON. Keep at least three fixtures: a complete STAR answer, an answer
missing Action and Result, and a malformed response with markdown fences and a trailing
comma. The third one exists to prove the parse-retry path works.

## Test database

`docker-compose.yml` runs a second Postgres on port 5433 for tests. `apps/api/.env.test`
points `DATABASE_URL` at it. The Jest global setup runs
`prisma migrate reset --force --skip-seed` once, and each test file truncates the tables it
touches in `beforeEach`. Do not share state between test files.

## Gates

Each gate is a script in the root `package.json`. Every gate re-runs all previous gates, so
`pnpm gate:6` implies gates 0 through 5 still pass. Regressions surface immediately.

---

### `gate:0` — Workspace boots

```
pnpm -r typecheck && pnpm --filter api test:boot && pnpm --filter web build
```

- `docker compose up -d` brings up both Postgres instances.
- `prisma migrate dev` applies cleanly from empty.
- `test:boot` starts the Nest app in a testing module and asserts `GET /api/health` returns
  200 with `{ db: 'up' }`.
- A test asserts the app **fails to boot** when `ANAM_API_KEY` is absent. Missing config
  must crash at startup, not at request time.
- `web build` succeeds with zero type errors.

### `gate:1` — Contracts

```
pnpm --filter contracts test
```

- Every schema accepts its valid fixture and rejects at least three invalid ones.
- `CreateInterviewInputSchema` rejects: empty role, 6 competencies, questionCount 0,
  questionCount 6, an unknown competency string.
- `CompetencySchema` rejects lowercase input (`'ownership'`). Enum values are uppercase
  everywhere and there is no casing tolerance, so a client sending lowercase must get a 400
  rather than being quietly coerced.
- **Enum parity:** `CompetencySchema.options` and `SenioritySchema.options` are deep-equal to
  the corresponding Prisma enum values imported from `@prisma/client`. This is the test that
  catches a schema change made on one side only.
- `COMPETENCY_LABELS` and `SENIORITY_LABELS` have a key for every enum member, so a new
  competency cannot ship without a display label.
- `ScoringResultSchema` rejects a score of 0 and a score of 6.
- A round-trip test parses `zod-to-json-schema` output back and confirms it describes the
  same required fields, so the prompt's schema description cannot drift from the validator.

### `gate:2` — Interview setup and question bank

```
pnpm --filter api test:e2e -- interviews.create
```

- `POST /api/interviews` returns 201 with a uuid and the echoed setup.
- The row exists in Postgres with the right competencies array.
- `timeLimitSecs` is 180 **even when the client sends 999**. The client cannot raise its own
  limit. This is a specific test, not an assumption.
- Invalid bodies return 400 with the `ApiErrorBody` shape.
- `forbidNonWhitelisted` strips unknown fields, verified by sending `{ isAdmin: true }`.

Question bank assertions (the challenge's own stated test for this step):

- Seeded bank has at least 6 questions per competency.
- Creating an interview for `SENIOR` with `['CONFLICT','FAILURE']` selects 3 questions, all
  of which have a competency in that set and `SENIOR` in their seniority array.
- **Creating a second interview with the identical setup yields a different question set.**
  Run it 10 times and assert at least 8 distinct sets, so a flaky shuffle cannot pass by
  accident.
- Changing competencies changes the selected competencies, asserted directly.
- A pool smaller than `questionCount` reduces `questionCount` rather than repeating a
  question.

### `gate:3` — Session token exchange

```
pnpm --filter api test:e2e -- session-token
```

The most important gate in the project. Assertions:

1. `POST /api/interviews/:id/session-token` returns `{ sessionToken, timeLimitSecs, expiresAt }`.
2. **The serialised response body does not contain `process.env.ANAM_API_KEY`.** Assert on
   the raw string, not the parsed object.
3. The response contains no `avatarId`, `voiceId`, `llmId`, or `systemPrompt`.
4. The outbound msw handler received `Authorization: Bearer <key>`, `clientLabel` equal to
   the interview id, and a `personaConfig` whose `systemPrompt` contains the exact text of
   every question selected from the bank for that interview, in order.
5. The outbound request set `personaConfig.avatarModel` to `cara-4-latest`,
   `personaConfig.maxSessionLengthSeconds` to the interview's `timeLimitSecs`, and
   `personaConfig.skipGreeting` to `false`. Assert the field is inside `personaConfig`, not
   `sessionOptions`, since that is where it actually belongs and getting it wrong fails
   silently by ignoring the limit.
6. Interview status flips `CREATED` to `LIVE` and `startedAt` is set.
7. A second call on the same interview returns 409 `InterviewAlreadyStarted`. Double-minting
   is how the free tier gets burned.
8. Anam returning 500 produces a 502 `AnamUnavailable`, and the upstream body is **not**
   present in the response.
9. A captured log line, with the logger spied on, does not contain the API key.

### `gate:4` — UI primitives

```
pnpm --filter web test -- ui
```

`apps/web/app/ui` (see `shared.md` Part B — folded in from the originally spec'd separate
`packages/ui`) is a Vitest project inside `apps/web`; the `-- ui` filters the run to test
files under that directory.

- Snapshot every fixture state of every component in `shared.md` Part B.
- `jest-axe` reports zero violations for each.
- `<Button disabled>` does not fire `onClick`.
- `<VideoStage>` renders with `playsinline` and `autoplay` present. Regression guard, these
  get dropped in refactors and the failure only shows on a real phone.
- `<StarStrip>` distinguishes present from missing without relying on colour: assert the
  accessible name differs, for example "Result: missing".
- A lint assertion that no file under `apps/web/app/ui` contains a hex colour literal.

### `gate:5` — Setup screen

```
pnpm --filter web test -- setup && pnpm --filter web test:e2e -- setup.spec
```

- Form cannot submit with zero competencies selected.
- Selecting a 6th competency is blocked and explained inline.
- Submit posts the right body and routes to `/interview/<returned id>`.
- API 400 renders the server's message, not a generic one.
- Keyboard-only completion of the whole form works, verified in Playwright with `Tab` and
  `Enter` only.

### `gate:6` — Live room

```
pnpm --filter web test:e2e -- live-room.spec
```

Playwright with `--use-fake-device-for-media-stream` and permissions granted, running
against the SDK mock.

- Landing on the page shows state `idle`: Start enabled, Skip and End disabled, status pill
  "Ready".
- No token request fires before the click. Assert on the intercepted network, this proves
  the autoplay-safe design.
- Clicking Start once while the request is in flight and clicking again does not produce a
  second `POST .../session-token`.
- State becomes `live` only after `SESSION_READY`, not when `streamToVideoElement` resolves.
  The mock resolves the stream promise 400ms before firing `SESSION_READY`, and the test
  asserts Skip is still disabled in that window.
- The countdown starts at `SESSION_READY`, so connection time is not billed to the candidate.
- After ready, the pill reads "Live", Skip and End are enabled and Start is disabled.
- With the time limit stubbed to 5s, the timer reaches zero and the session auto-ends with
  the "Time's up" message, without a manual click.
- **After End, `stopStreaming` was called and no media tracks remain live.** Assert by
  reading `navigator.mediaDevices` track state from the page context.
- Navigating away mid-session calls teardown, asserted through the mock's call log.
- Denying microphone permission renders the exact permission message from `frontend.md`.

### `gate:7` — Transcript capture

```
pnpm --filter api test:e2e -- transcript && pnpm --filter web test:e2e -- transcript.spec
```

Backend:

- Appending the same batch twice yields `accepted: N` then `accepted: 0, skipped: N`.
  Idempotency is not optional, retries will happen.
- **Re-sending sequence 3 with changed content updates the stored row rather than skipping
  it.** Anam rewrites history when a turn is interrupted, so this is an upsert, not a
  `skipDuplicates` insert. A test that only covers exact-duplicate skipping will let the
  interrupted-turn bug through.
- Appending to a `COMPLETED` interview returns 409.
- `POST /complete` with a stubbed Anam transcript containing one line the SDK missed inserts
  exactly that line, with `source: 'anam-api'` and a sequence after the existing max.
- Anam's transcript endpoint 404ing on the first two attempts and succeeding on the third
  still completes, proving the backoff.
- Anam's transcript endpoint failing all three attempts still returns 200 and leaves the
  SDK-only transcript intact. Degradation, not failure.

Frontend:

- The SDK mock emits `MESSAGE_HISTORY_UPDATED` as a **full snapshot** each time, matching
  real behaviour. A mock that emits deltas will let a broken implementation pass.
- Lines appear in the transcript panel within one flush interval.
- Only `snapshot.slice(lastFlushedIndex)` is sent, verified on the intercepted request body,
  so a 40-turn session does not re-POST the whole history every 5 seconds.
- Partial `MESSAGE_STREAM_EVENT_RECEIVED` text is never included in a flush.
- A flush that fails once is retried and the line is not lost.
- Reloading mid-session restores unflushed lines from `sessionStorage`.
- Two interviews run in sequence produce two separate stored transcripts, matching the
  challenge's own test instruction.

### `gate:8` — STAR feedback

```
pnpm --filter api test:e2e -- feedback
```

- Given the "missing Action and Result" fixture transcript, the persisted feedback has
  `hasAction: false` and `hasResult: false` for that answer. This is the challenge's stated
  test: give one deliberately incomplete answer and confirm the report catches it.
- `overallScore` equals the arithmetic mean of the answer scores, computed in TypeScript.
  Feed a fixture whose model output claims a different overall and assert ours wins.
- The malformed-JSON fixture triggers exactly one retry, and the retried prompt includes the
  parse error.
- Two malformed responses produce a 502 `ScoringFailed` and persist **no** `Feedback` row.
  A half-written report is worse than none.
- Calling `POST /feedback` twice makes exactly one outbound LLM request.
- A transcript with fewer than two candidate turns returns 409 `TranscriptTooShort`.
- Segmentation test: a transcript with one question and two probes produces exactly one
  `AnswerFeedback`, not three.

### `gate:9` — Progress

```
pnpm --filter api test:e2e -- progress && pnpm --filter web test -- history
```

- Three seeded scored interviews produce a `trend` with the correct `first`, `latest`, and
  `delta`.
- `starCoverage` fractions are correct against a hand-computed fixture.
- Unscored and abandoned interviews are excluded from the trend.
- A single session returns `delta: 0` rather than dividing by zero or returning null.
- The history list orders newest first and paginates by cursor.

### `gate:10` — Full path

```
pnpm gate:all
```

- Playwright runs setup, live room with the SDK mock, auto-end on the shortened timer,
  feedback generation with the LLM mock, and the history screen, in one spec.
- `jest-axe` or `@axe-core/playwright` reports zero serious or critical violations on all
  four screens.
- Viewport 375px: no horizontal scroll, all controls reachable.
- `prefers-reduced-motion: reduce` disables the status pulse, asserted on computed style.
- A CI step greps `apps/web` for `ANAM_API_KEY` and `ANTHROPIC_API_KEY` and fails if found.

---

## Manual smoke checklist

Run once per phase group against the real Anam free tier, since automated tests never touch
it. Keep it short, sessions are 3 minutes and the tier is finite.

1. Start an interview. The interviewer appears within a few seconds, greets you by name,
   states how many questions to expect, and asks question one without being prompted.
2. Give a complete STAR answer. It moves to question two without coaching you.
3. Give a deliberately incomplete answer: describe a situation, never say the result. It
   asks a follow-up about the outcome. This is the single behaviour most likely to regress
   when the prompt changes.
4. Let it hit the time limit rather than ending manually. Confirm the hard stop is graceful.
5. Open the feedback report. Confirm the incomplete answer is marked missing Result.
6. Check the mic indicator in the browser chrome is off after the session ends.
7. Repeat once and confirm the history screen shows two distinct sessions and a trend.

Record the prompt version used for each smoke run. When behaviour drifts, the prompt version
plus the stored `rawResponse` is what lets you find out why.
