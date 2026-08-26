# Shared Packages Specification

Two workspace packages sit between the API and the web app. Build both in phase 1 and 4
respectively, before anything consumes them.

---

# Part A: `packages/contracts`

The single definition of every shape crossing the network. NestJS validates against it, the
Next.js client types against it, and the scoring LLM's output parses against it. When a
field changes, both apps fail to compile in the same commit. That is the entire point.

## Structure

```
packages/contracts/src/
├─ index.ts
├─ enums.ts          # Seniority, Competency, InterviewStatus, Speaker
├─ interview.ts      # CreateInterviewInput, InterviewDto, InterviewSummaryDto
├─ session.ts        # SessionTokenResponse
├─ transcript.ts     # TranscriptLine, AppendMessagesInput, AppendMessagesResult
├─ feedback.ts       # AnswerFeedbackDto, FeedbackDto, ScoringResult
├─ progress.ts       # ProgressDto, StarCoverage
└─ errors.ts         # ApiErrorCode union, ApiErrorBody
```

Zod is the source, types are derived. Never hand-write a type that duplicates a schema.

## Enum convention (applies everywhere)

**All enum values are SCREAMING_SNAKE_CASE, and the same string is used in the database, on
the wire, and in client state.** No casing translation layer exists anywhere in the
codebase. `Seniority`, `InterviewStatus`, `Speaker`, and `Competency` all follow this.

The reason is that a mapping layer between wire casing and Prisma casing is a place bugs
hide: it is invisible in types, it silently drops unknown values, and it has to be
maintained in two directions. Uppercase-everywhere costs one display-label map, which you
need regardless because "OWNERSHIP" was never going to be a chip label.

Human-readable strings live in `COMPETENCY_LABELS` and are used only for rendering.

```ts
export const CompetencySchema = z.enum([
  'OWNERSHIP', 'CONFLICT', 'FAILURE', 'AMBIGUITY', 'INFLUENCE', 'DELIVERY',
]);
export type Competency = z.infer<typeof CompetencySchema>;

export const COMPETENCY_LABELS: Record<Competency, string> = {
  OWNERSHIP: 'Ownership',
  CONFLICT:  'Handling conflict',
  FAILURE:   'Learning from failure',
  AMBIGUITY: 'Working with ambiguity',
  INFLUENCE: 'Influence without authority',
  DELIVERY:  'Delivering under pressure',
};

export const SenioritySchema = z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF']);
export const SENIORITY_LABELS: Record<Seniority, string> = {
  JUNIOR: 'Junior', MID: 'Mid', SENIOR: 'Senior', STAFF: 'Staff',
};

export const CreateInterviewInputSchema = z.object({
  role: z.string().trim().min(2).max(80),
  seniority: SenioritySchema,
  competencies: z.array(CompetencySchema).min(1).max(5),
  questionCount: z.number().int().min(1).max(5).default(3),
});
export type CreateInterviewInput = z.infer<typeof CreateInterviewInputSchema>;
```

## The scoring schema

This one earns its keep twice: it validates the LLM response, and it generates the JSON
shape description embedded in the prompt. Derive the prompt's schema description from the
Zod object with `zod-to-json-schema` rather than maintaining a prose copy that drifts.

```ts
export const AnswerFeedbackSchema = z.object({
  questionIndex: z.number().int().min(0),
  question: z.string().min(1),
  answerSummary: z.string().min(1).max(400),
  hasSituation: z.boolean(),
  hasTask: z.boolean(),
  hasAction: z.boolean(),
  hasResult: z.boolean(),
  score: z.number().int().min(1).max(5),
  improvement: z.string().min(1).max(300),
});

export const ScoringResultSchema = z.object({
  answers: z.array(AnswerFeedbackSchema).min(1),
  strengths: z.array(z.string().min(1)).min(2).max(4),
});
```

`overallScore` is deliberately absent. It is computed server side from `answers`, never
asked of the model.

## Using it in NestJS

Do not maintain parallel `class-validator` DTOs. Write one `ZodValidationPipe` and use the
contract schemas directly:

```ts
@Post()
create(@Body(new ZodValidationPipe(CreateInterviewInputSchema)) input: CreateInterviewInput) {}
```

Keep the global `ValidationPipe` for anything the Zod pipe does not cover, but Zod schemas
are the rule and class DTOs are the exception.

### Enum parity guard

Prisma generates its own enum types from `schema.prisma`. Those must stay identical to the
contracts enums, so `apps/api` carries a compile-time assertion and a runtime test:

```ts
// apps/api/src/common/enum-parity.ts
import { Competency as PrismaCompetency, Seniority as PrismaSeniority } from '@prisma/client';
import { CompetencySchema, SenioritySchema } from '@coach/contracts';

// fails to compile if the two drift
const _competency: Record<PrismaCompetency, true> =
  Object.fromEntries(CompetencySchema.options.map((v) => [v, true])) as never;
```

Because both sides are uppercase, this is a plain equality check rather than a mapping. If
you had chosen lowercase on the wire, this file would be a translation table instead of an
assertion, and translation tables silently drop values they do not know about.

## Using it in Next.js

`apps/web/app/api-client/` wraps `fetch` and parses every response through the matching
schema before returning. An API that changes shape then fails loudly at the boundary rather
than producing `undefined` three components deep.

```ts
async function getInterview(id: string): Promise<InterviewDto> {
  const res = await fetch(`${API_BASE}/api/interviews/${id}`);
  if (!res.ok) throw await toApiError(res);
  return InterviewDtoSchema.parse(await res.json());
}
```

## Build config

`"type": "module"`, compiled with `tsc` to `dist/`, `main`/`types` pointing there.
Both apps depend on it as `"@coach/contracts": "workspace:*"`. Add it to the Next.js
`transpilePackages` array.

---

# Part B: `packages/ui`

Presentational primitives only. No data fetching, no SDK, no router. Every component takes
props and renders. This keeps them snapshot-testable without mounting the app.

## Tokens

`packages/ui/tokens.css` holds the CSS custom properties from `frontend.md`. Tailwind v4
consumes them:

```css
@import "tailwindcss";
@theme {
  --color-canvas: #EDF3EF;
  --color-surface: #FFFFFF;
  --color-ink: #111614;
  --color-ink-muted: #5B6B64;
  --color-ink-faint: #8A9993;
  --color-accent: #0F8A63;
  --color-accent-soft: #8FBFA9;
  --color-line: #DCE6E0;
  --color-warn: #B4541F;
  --radius-card: 14px;
  --radius-control: 10px;
}
```

No component may use a raw hex value. Add a lint rule that rejects hex literals in
`packages/ui/src` and `apps/web/app`.

## Components

### `<Eyebrow>`
Uppercase micro-label. Props: `children`, `tone?: 'accent' | 'faint'`.
Used for `LIVE ROOM`, `CAPTURE`, `BEHAVIOURAL INTERVIEW PRACTICE`, and the meta cell labels.

### `<Card>`
Surface container. Props: `children`, `className?`.
Composes with `<Card.Header>` which takes `eyebrow`, `title`, and an optional `aside` slot
for the right-aligned pill.

### `<Pill>`
Small rounded label. Props: `children`, `tone?: 'neutral' | 'accent' | 'warn'`.
Used for `3 minute sessions`.

### `<StatusDot>`
Dot plus label. Props: `status: 'ready' | 'connecting' | 'live' | 'error' | 'ended'`,
`label`. Owns the pulse animation and the `prefers-reduced-motion` guard so no consumer has
to remember it.

### `<Button>`
Props: `variant: 'primary' | 'secondary'`, `disabled`, `loading`, `children`, `onClick`.
When `loading`, renders the loading label and sets `aria-busy`. Focus ring is
`--color-accent` at 2px offset. Minimum touch target 44px on mobile.

### `<MetaStrip>`
Props: `items: { label: string; value: string }[]`.
Renders equal cells with `1px` dividers. Values use `tabular-nums`. Three items in the
screenshot: interviewer, questions, time limit.

### `<EmptyState>`
Dashed-border placeholder. Props: `children`, `minHeight?`.

### `<VideoStage>`
Wraps the `<video>` element with the correct attributes so no consumer can get them wrong:
`autoPlay`, `playsInline`, `muted={false}`, black background, fixed aspect ratio. Forwards a
ref so `useAnamSession` can target it. Props: `id`, `state`, `aria-label`.

`playsInline` is not optional. Without it mobile Safari takes the stream fullscreen and the
rest of the interface disappears.

### `<TranscriptList>`
Props: `lines: TranscriptLine[]`, `emptyMessage`.
Renders the `aria-live="polite"` region, the speaker labels, and the auto-scroll-if-at-bottom
behaviour. Falls back to `<EmptyState>` when `lines` is empty.

### `<StarStrip>`
Four cells labelled S / T / A / R, each present or missing. Props: the four booleans.
Missing cells carry the visual weight. Do not encode present/missing with colour alone, use
a fill state and an icon or a strikethrough so it survives colourblindness and greyscale.

### `<ScoreBadge>`
Props: `score: number`, `max?: number`. Tabular numerals.

## Component rules

1. No `useEffect` that fetches. If a component needs data, it takes it as a prop.
2. Every interactive component forwards `ref` and spreads remaining props onto its root.
3. Every component that renders text accepts `children` or an explicit string prop, never
   both for the same slot.
4. Each ships with a story-style fixture file `*.fixtures.ts` exporting its states, which
   the snapshot tests iterate over. Adding a state means adding a fixture, which means the
   snapshot covers it automatically.
