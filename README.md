# Mock Interview Coach: Build Specification

A behavioural interview practice tool. A photorealistic AI interviewer (Anam `cara-4`) asks
STAR questions over live video, the candidate answers by voice, and the transcript is scored
against the STAR framework afterwards.

Based on Coding Challenges #128.

## Documents

| File | Covers |
|---|---|
| `README.md` | This file. Stack, repo layout, build order, phase gates. |
| `architecture.md` | Diagrams: topology, lifecycle sequence, state machines, data model. Read this second. |
| `backend.md` | NestJS API, Prisma schema, Anam token exchange, LLM scoring. |
| `frontend.md` | Next.js App Router, Anam SDK integration, screens, visual spec. |
| `shared.md` | Shared contracts package (types + Zod) and the UI primitive library. |
| `testing.md` | Test strategy, tooling, and the exact gate command for every phase. |

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS 10, TypeScript strict |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Frontend | Next.js 15 (App Router), React 19 |
| Styling | Tailwind CSS v4 |
| Avatar | `@anam-ai/js-sdk`, `cara-4-latest` avatar model |
| Scoring LLM | Anthropic Messages API (swappable behind an interface) |
| Package manager | pnpm workspaces |

## Repo layout

```
mock-interview-coach/
├── apps/
│  ├── api/                 # NestJS
│  └── web/                 # Next.js
│     └── app/
│        └── ui/            # React primitives, colocated per Next.js convention (see shared.md)
├── packages/
│  └── contracts/           # shared TS types + Zod schemas, used by both apps (see shared.md)
├── docker-compose.yml      # postgres (dev) + postgres_test (tests)
├── pnpm-workspace.yaml
└── turbo.json              # optional, for task orchestration
```

`apps/web` never talks to `api.anam.ai` directly except through the streaming SDK using a
token minted by `apps/api`. The Anam API key exists in exactly one place: the API process
environment.

## Environment variables

`apps/api/.env`

```
DATABASE_URL=postgresql://coach:coach@localhost:5432/coach
ANAM_API_KEY=...                 # never exposed to the browser
ANAM_API_BASE=https://api.anam.ai/v1
ANAM_AVATAR_MODEL=cara-4-latest
ANAM_AVATAR_ID=...
ANAM_VOICE_ID=...
ANAM_LLM_ID=...
SESSION_TIME_LIMIT_SECONDS=180   # must stay under the free tier's 3 min cap
ANTHROPIC_API_KEY=...
WEB_ORIGIN=http://localhost:3000
PORT=8080
```

`apps/web/.env.local`

```
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

Nothing prefixed `NEXT_PUBLIC_` may ever hold a provider key. Add a CI grep that fails the
build if `ANAM_API_KEY` or `ANTHROPIC_API_KEY` appears anywhere under `apps/web`.

## Build order and phase gates

Build strictly in this order. **Do not start a phase until the previous phase's gate passes.**
Each gate is a single command defined in `testing.md`.

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Workspace, Docker Postgres, Prisma migrated, both apps boot | `pnpm gate:0` |
| 1 | `packages/contracts` types + Zod schemas, both apps import them | `pnpm gate:1` |
| 2 | Interview setup persisted, question bank seeded, per-session question selection varies | `pnpm gate:2` |
| 3 | Session token endpoint, Anam call mocked in tests, key never leaks | `pnpm gate:3` |
| 4 | `apps/web/app/ui` primitives with visual snapshot coverage | `pnpm gate:4` |
| 5 | Setup screen wired to phase 2 | `pnpm gate:5` |
| 6 | Live room streams avatar, timer enforces limit, teardown is clean | `pnpm gate:6` |
| 7 | Transcript captured, flushed to API, reconciled on complete | `pnpm gate:7` |
| 8 | STAR feedback report generated and persisted | `pnpm gate:8` |
| 9 | History and progress trend across sessions | `pnpm gate:9` |
| 10 | Full Playwright happy path with a mocked SDK, a11y pass | `pnpm gate:10` |

### Rules for the implementing agent

1. Write the test in the phase's gate **before** the implementation. Every gate command must
   fail for the right reason before it passes.
2. Never mark a phase done on the strength of a manual browser check alone. The gate command
   is the source of truth.
3. No phase may modify a file owned by an earlier phase without re-running that earlier gate.
4. Anam and the scoring LLM are **always** mocked in automated tests. Real network calls are
   confined to the manual smoke checklist at the end of `testing.md`.
5. If a gate cannot pass because of a genuine external constraint (Anam free tier expired,
   no mic on the machine), stop and report rather than weakening the test.

## Verification status of external API details

Confirmed against Anam's docs at time of writing:

- `POST https://api.anam.ai/v1/auth/session-token`, `Authorization: Bearer <apiKey>`.
- Body shape `{ clientLabel, personaConfig: { name, avatarId, avatarModel, voiceId, llmId,
  systemPrompt, maxSessionLengthSeconds, skipGreeting }, sessionOptions: { ... } }`.
  **`maxSessionLengthSeconds` sits inside `personaConfig`, not `sessionOptions`.**
- `avatarModel: "cara-4-latest"` for cara-4, and it is early access per organisation.
- SDK events: `AnamEvent.SESSION_READY`, `AnamEvent.MESSAGE_HISTORY_UPDATED` (full
  conversation snapshot, `{ role: "user" | "assistant", content }[]`, emitted each time a
  participant finishes speaking), `AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED` (partial live
  transcription), `userSpeechStarted` / `userSpeechEnded`.

**Not verified, confirm before implementing:**

- The post-session transcript retrieval endpoint. The challenge states one exists, but the
  path and response shape were not confirmed. Check `https://api.anam.ai/swagger.json`
  first. If it does not exist or is not on the free tier, the SDK snapshot is the only
  transcript source and the reconciliation step in `backend.md` collapses to a no-op. Build
  it behind the `AnamService` interface so this is a one-file change.
- Whether `maxSessionLengthSeconds` is honoured on the free tier or the 3 minute cap is
  applied independently. Assume both apply and take the minimum.

## Known constraints to design around

- **3 minute conversation cap on the Anam free tier.** Default question count is 3 and the
  default time limit is 180s. Every design decision assumes short sessions.
- **Secure context required for microphone.** `localhost` or HTTPS only.
- **Autoplay policy.** The avatar stream must be started from a user gesture, not on mount.
- **Browser-only SDK.** `@anam-ai/js-sdk` touches the DOM and must not be imported into a
  server component or evaluated during SSR.
- **Transcript can be lost.** A closed tab loses live SDK events, so the client flushes
  incrementally and the server reconciles against Anam's post-session transcript API.
