# Backend Specification (NestJS + Prisma + PostgreSQL)

Location: `apps/api`. Read `README.md` first for the phase order and env vars.

## Responsibilities

The API owns four things the browser must never own:

1. The Anam API key, exchanged for short-lived session tokens.
2. The persona system prompt, built from the candidate's setup choices.
3. The session time limit, enforced server side as well as client side.
4. The transcript of record and the STAR scoring.

## Module structure

```
src/
├─ main.ts
├─ app.module.ts
├─ config/
│  ├─ config.module.ts
│  └─ env.validation.ts        # Zod validation of process.env at boot
├─ prisma/
│  ├─ prisma.module.ts
│  └─ prisma.service.ts
├─ interviews/
│  ├─ interviews.module.ts
│  ├─ interviews.controller.ts
│  ├─ interviews.service.ts
│  └─ dto/
├─ persona/
│  ├─ persona.module.ts
│  └─ persona.service.ts       # builds personaConfig from setup
├─ anam/
│  ├─ anam.module.ts
│  ├─ anam.service.ts          # session-token + transcript API client
│  └─ anam.types.ts
├─ transcript/
│  ├─ transcript.module.ts
│  ├─ transcript.controller.ts
│  └─ transcript.service.ts    # append, dedupe, reconcile, segment
├─ feedback/
│  ├─ feedback.module.ts
│  ├─ feedback.controller.ts
│  ├─ feedback.service.ts      # STAR analysis orchestration
│  └─ llm/
│     ├─ llm.interface.ts      # ScoringProvider
│     └─ anthropic.provider.ts
├─ progress/
│  ├─ progress.module.ts
│  ├─ progress.controller.ts
│  └─ progress.service.ts
└─ common/
   ├─ http-exception.filter.ts
   └─ redact.ts                # strips secrets from logs and error bodies
```

### Boot-time guarantees (`main.ts`)

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalFilters(new HttpExceptionFilter());
app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: false });
app.setGlobalPrefix('api');
```

`env.validation.ts` throws on boot if any required variable is missing. A missing
`ANAM_API_KEY` must crash the process, not surface as a 500 at request time.

## Prisma schema

`apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Seniority {
  JUNIOR
  MID
  SENIOR
  STAFF
}

// Values must stay byte-identical to CompetencySchema in packages/contracts.
// Guarded by the parity assertion in apps/api/src/common/enum-parity.ts.
enum Competency {
  OWNERSHIP
  CONFLICT
  FAILURE
  AMBIGUITY
  INFLUENCE
  DELIVERY
}

enum InterviewStatus {
  CREATED      // setup saved, not started
  LIVE         // streaming
  COMPLETED    // session ended, transcript final
  SCORED       // feedback generated
  ABANDONED    // started but never completed, reaped by cron
}

enum Speaker {
  INTERVIEWER
  CANDIDATE
}

model Interview {
  id             String          @id @default(uuid())
  createdAt      DateTime        @default(now())
  startedAt      DateTime?
  endedAt        DateTime?
  status         InterviewStatus @default(CREATED)

  // setup choices
  role           String
  seniority      Seniority
  competencies   Competency[]
  questionCount  Int             @default(3)
  timeLimitSecs  Int             @default(180)
  interviewerName String         @default("John")

  // anam linkage
  anamSessionId  String?         @unique

  questions      InterviewQuestion[]
  messages       Message[]
  feedback       Feedback?

  @@index([createdAt])
  @@index([status])
}

model Question {
  id           String     @id @default(uuid())
  competency   Competency
  seniority    Seniority[]        // which levels this question suits
  text         String
  active       Boolean    @default(true)

  asked        InterviewQuestion[]

  @@index([competency])
}

model InterviewQuestion {
  id          String    @id @default(uuid())
  interviewId String
  interview   Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  questionId  String
  question    Question  @relation(fields: [questionId], references: [id])
  position    Int       // 0-based order within the interview

  @@unique([interviewId, position])
  @@unique([interviewId, questionId])
}

model Message {
  id           String    @id @default(uuid())
  interviewId  String
  interview    Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  speaker      Speaker
  content      String
  spokenAt     DateTime
  sequence     Int         // monotonic per interview, assigned by the client buffer
  source       String      // "sdk" | "anam-api"

  @@unique([interviewId, sequence])
  @@index([interviewId, spokenAt])
}

model Feedback {
  id            String    @id @default(uuid())
  interviewId   String    @unique
  interview     Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())
  overallScore  Float                 // mean of answer scores, 1.0 to 5.0
  strengths     String[]
  answers       AnswerFeedback[]
  model         String                // e.g. "claude-sonnet-4-6"
  rawResponse   Json                  // kept for debugging prompt regressions
}

model AnswerFeedback {
  id            String   @id @default(uuid())
  feedbackId    String
  feedback      Feedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)

  questionIndex Int
  question      String
  answerSummary String
  hasSituation  Boolean
  hasTask       Boolean
  hasAction     Boolean
  hasResult     Boolean
  score         Int      // 1..5
  improvement   String

  @@unique([feedbackId, questionIndex])
}
```

`@@unique([interviewId, sequence])` is what makes transcript flushes idempotent. A retried
flush hits the constraint and is skipped rather than duplicating lines.

## Endpoints

All under `/api`.

### `POST /interviews`

Creates the interview from the setup screen.

```jsonc
// request
{ "role": "Frontend Engineer", "seniority": "MID", "competencies": ["OWNERSHIP", "CONFLICT"], "questionCount": 3 }
// 201 response
{ "id": "uuid", "role": "...", "seniority": "MID", "competencies": [...], "questionCount": 3, "timeLimitSecs": 180, "interviewerName": "John", "status": "CREATED" }
```

Validation: role 2 to 80 chars, competencies 1 to 5 entries from a fixed enum in
`packages/contracts`, questionCount 1 to 5. `timeLimitSecs` is **not** client supplied. It
comes from `SESSION_TIME_LIMIT_SECONDS` and is clamped to a hard ceiling of 180.

### `POST /interviews/:id/session-token`

The security boundary. Steps:

1. Load the interview. 404 if missing. 409 if status is not `CREATED`.
2. `personaService.build(interview)` produces the persona config.
3. `anamService.createSessionToken(interview.id, personaConfig)`. The length limit already
   lives inside `personaConfig`.
4. Persist `startedAt`, `status = LIVE`, and `anamSessionId` if the response carries one.
5. Return only the token and the limit.

```jsonc
// 201 response
{ "sessionToken": "...", "timeLimitSecs": 180, "expiresAt": "2026-08-26T10:03:00.000Z" }
```

The response must contain no persona config, no avatar id, and no API key. A test asserts
the serialised body does not contain the string in `ANAM_API_KEY`.

### `POST /interviews/:id/messages`

Incremental transcript flush from the browser.

```jsonc
{ "messages": [ { "speaker": "CANDIDATE", "content": "...", "spokenAt": "...", "sequence": 4 } ] }
// 200
{ "accepted": 1, "skipped": 0 }
```

Batch upsert with `skipDuplicates`. Reject if interview status is `COMPLETED` or `SCORED`.

### `POST /interviews/:id/complete`

1. Set `endedAt`, `status = COMPLETED`.
2. If `anamSessionId` exists, call Anam's session transcript API and reconcile.

Reconciliation rule: the Anam API transcript wins on content, SDK events win on nothing.
Match on normalised content per speaker. Insert anything Anam has that the SDK missed with
`source = "anam-api"` and a sequence continuing after the max existing sequence. Anam may
not have the transcript ready immediately, so retry with backoff (3 attempts, 1s/3s/7s) and
degrade gracefully to the SDK-only transcript rather than failing the request.

### `POST /interviews/:id/feedback`

Runs STAR analysis. Idempotent: if `Feedback` already exists, return it rather than
re-billing the LLM. 409 if the interview is not `COMPLETED` or has fewer than 2 candidate
messages.

### `GET /interviews/:id`

Interview with messages ordered by sequence, and feedback if scored.

### `GET /interviews?limit=20&cursor=`

History list. Returns id, date, role, seniority, competencies, status, overallScore.

### `GET /progress`

```jsonc
{
  "sessions": [ { "id": "...", "completedAt": "...", "overallScore": 3.3, "role": "..." } ],
  "trend": { "first": 2.7, "latest": 3.7, "delta": 1.0, "sessionCount": 5 },
  "starCoverage": { "situation": 1.0, "task": 0.8, "action": 0.6, "result": 0.4 }
}
```

`starCoverage` is the fraction of scored answers containing each element. It is the most
useful number in the product: it names the specific thing the candidate keeps dropping.

## QuestionBankService

**This was a stated challenge requirement and it is easy to miss.** The backend generates
each interview from the setup choices by drawing from a question bank, so that repeated
sessions with the same setup produce *different* questions rather than the same script.

Seed the bank in `prisma/seed.ts`: at least 6 questions per competency, tagged with the
seniority levels they suit. A senior `CONFLICT` question ("Tell me about a time you
disagreed with a director") should not be served to a junior candidate.

```ts
select(input: { competencies: Competency[]; seniority: Seniority; count: number }): Question[]
```

Selection rules:

1. Filter to `active` questions whose `seniority` array contains the requested level and
   whose competency is in the requested set.
2. Distribute across competencies as evenly as `count` allows. Two competencies and three
   questions gives 2/1, and which competency gets two is randomised.
3. Shuffle, then take `count`. Persist the chosen ids as `InterviewQuestion` rows with
   `position`.
4. If the filtered pool is smaller than `count`, return what exists and reduce the
   interview's `questionCount` to match rather than repeating a question.

The persisted `InterviewQuestion` rows are what let the feedback step know the exact
question text without parsing it back out of the transcript, and what let a future version
avoid repeating a question the candidate has already had.

Selection happens at `POST /interviews` (creation time), not at token time. The questions
must exist before the persona prompt is built.

## PersonaService

Builds the Anam persona config. This is where the product lives, and it is prompt
engineering, so expect to iterate. Keep the prompt in a versioned constant, not inline.

```ts
build(interview: InterviewWithQuestions): PersonaConfig {
  return {
    name: interview.interviewerName,
    avatarId: env.ANAM_AVATAR_ID,
    voiceId: env.ANAM_VOICE_ID,
    llmId: env.ANAM_LLM_ID,
    avatarModel: env.ANAM_AVATAR_MODEL,          // "cara-4-latest"
    systemPrompt: renderPrompt(PROMPT_V1, interview),
    maxSessionLengthSeconds: interview.timeLimitSecs,  // inside personaConfig, confirmed
    skipGreeting: false,                          // we WANT the greeting, see prompt rules
  };
}
```

`maxSessionLengthSeconds` belongs to `personaConfig`, not `sessionOptions`. Set
`clientLabel` on the outer request body to the interview id so sessions are traceable in the
Anam dashboard.

The prompt template must enforce:

- **Greeting first.** Introduce yourself by name, state the number of questions and the time
  limit, then ask question one. This belongs here, not in frontend JavaScript.
- **One question at a time.** Never list questions. Never ask the next question until the
  current one is resolved.
- **Probe on missing specifics.** If the answer describes a situation without stating what
  the candidate personally did, ask what their own action was. If it has no measurable
  outcome, ask what the result was. Maximum two probes per question, then move on.
- **Do not coach during the interview.** No feedback, no praise, no hints. Scoring happens
  afterwards. This is the rule the model breaks most often.
- **Speech formatting.** Natural spoken language, no markdown, no bullet points, pauses with
  "...", occasional light disfluency.
- **Hard stop.** After the final question, thank the candidate and stop talking.

Interpolate `role`, `seniority`, `questionCount`, and **the exact question list selected by
`QuestionBankService`, in order**. The model must ask those questions, not invent its own.
This is what makes the "same setup, different questions" behaviour deterministic and
testable: variation comes from the bank selection, not from model randomness.

Version the prompt constant (`PROMPT_V1`, `PROMPT_V2`) and store the version on the
interview row. When behaviour regresses you need to know which prompt produced which
transcript.

## AnamService

Thin HTTP client. Everything Anam-shaped lives here so tests can mock one class.

```ts
createSessionToken(clientLabel: string, persona: PersonaConfig): Promise<SessionTokenResult>
getSessionTranscript(sessionId: string): Promise<AnamTranscriptLine[]>
```

- `POST ${ANAM_API_BASE}/auth/session-token` with `Authorization: Bearer ${ANAM_API_KEY}`.
- Body: `{ clientLabel: interview.id, personaConfig }`, where `personaConfig` carries
  `maxSessionLengthSeconds` and `skipGreeting`. Confirmed shape, see `README.md`.
- `getSessionTranscript` is **unverified**. Check `https://api.anam.ai/swagger.json` for the
  real path before implementing. Keep it behind this interface so that if the endpoint does
  not exist or is not available on the free tier, the reconciliation step degrades to a
  no-op and nothing else in the codebase changes.
- 10s timeout, no retry on 4xx, one retry on 5xx or timeout.
- Map upstream failures to a 502 with a generic message. **Never** forward the upstream body
  to the client, it can echo request headers.
- Log with `redact()` applied. A logged Bearer token is the failure mode to design against.

## FeedbackService

### Segmentation

The transcript is a flat list. Feedback is per question. Segment before scoring:

1. Walk messages in sequence order.
2. Each `INTERVIEWER` message that ends in a question opens or continues a segment.
3. A new segment starts when the interviewer asks a question that is not a probe. Detect
   this positionally: the first interviewer question after a candidate turn that followed at
   least one candidate turn in the current segment. Simpler and more reliable: have the
   persona prompt emit a marker phrase such as "Question two." at the start of each new
   question and split on that.
4. A segment is one question plus its probes plus all candidate turns between. **One
   segment, one score.** A question with two probes and three replies is one answer, not
   three.

Prefer the marker-phrase approach. It moves an ambiguous parsing problem into the prompt
where you can actually control it.

### Scoring call

`ScoringProvider` interface so the LLM is swappable:

```ts
interface ScoringProvider {
  score(input: ScoringInput): Promise<ScoringResult>;
}
```

Requirements:

- Ask for **strict JSON only**, no prose, no markdown fences.
- Parse with the Zod schema from `packages/contracts`. On parse failure, retry once with the
  parse error appended to the prompt. On second failure, throw a 502 and persist nothing.
- Strip ```` ```json ```` fences defensively before parsing anyway.
- Temperature 0 or as low as the provider allows. Scores must be reproducible enough that a
  regression test is meaningful.
- Per answer the model returns: `questionIndex`, `question`, `answerSummary`,
  `hasSituation`, `hasTask`, `hasAction`, `hasResult`, `score` (1 to 5), `improvement`
  (one specific, actionable sentence).
- Plus overall `strengths` (2 to 4 items).
- `overallScore` is computed in TypeScript as the mean of answer scores, not asked of the
  model. Models are bad at arithmetic and you want this number to be trustworthy.

Cross-check rule: if the model marks all four STAR elements present but gives a score of 1
or 2, or marks two or more absent but gives a 5, log a warning. Persist the response anyway
but surface the inconsistency in `rawResponse` for prompt debugging.

## Abandoned session reaper

A `@Cron` job every 5 minutes sets `status = ABANDONED` on any interview that is `LIVE` with
`startedAt` older than `timeLimitSecs + 120`. Without this, a closed tab leaves rows stuck
`LIVE` forever and the history list fills with ghosts.

## Error handling

`HttpExceptionFilter` returns a stable shape and never leaks internals:

```jsonc
{ "statusCode": 502, "error": "AnamUnavailable", "message": "Could not start the interview session. Try again." }
```

Error codes the frontend branches on: `InterviewNotFound`, `InterviewAlreadyStarted`,
`InterviewNotCompleted`, `TranscriptTooShort`, `AnamUnavailable`, `ScoringFailed`.
Write user-facing messages here, in the interface's voice, saying what to do next. The
frontend should display them directly rather than mapping them again.
