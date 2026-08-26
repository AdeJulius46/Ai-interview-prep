# Frontend Specification (Next.js 15 + Tailwind v4)

Location: `apps/web`. Read `README.md` first. UI primitives live in `apps/web/app/ui`,
colocated inside `app/` per Next.js's own App Router convention rather than a separate
workspace package — see `shared.md`.

## Route structure

```
app/
├─ layout.tsx                    # fonts, tokens, page chrome
├─ page.tsx                      # Setup: role, seniority, competencies, question count
├─ interview/
│  └─ [id]/
│     ├─ page.tsx                # Live room (server shell)
│     ├─ live-room.tsx           # "use client", owns the SDK
│     └─ feedback/page.tsx       # STAR report
├─ history/page.tsx              # past sessions + progress trend
├─ ui/                           # React primitives, see shared.md Part B
├─ tokens.css                    # design tokens, imported by globals.css
└─ api-client/                   # typed fetch wrappers over packages/contracts
```

Server components fetch interview data. Only `live-room.tsx` and its children are client
components. The Anam SDK is imported there and nowhere else.

## The critical integration rule

`@anam-ai/js-sdk` touches `window`, `navigator.mediaDevices`, and DOM elements. It must
never be evaluated during SSR.

```tsx
// live-room.tsx
'use client';
// dynamic import INSIDE the start handler, not at module scope
const { createClient } = await import('@anam-ai/js-sdk');
```

Importing at module scope inside a `'use client'` file still runs during the server render
pass of that component in the App Router. Import it lazily inside the click handler. This
also means the SDK bundle is not downloaded until the candidate actually starts.

## `useAnamSession` hook

The whole live experience is one hook. Signature:

```ts
function useAnamSession(interviewId: string): {
  state: 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';
  error: string | null;
  secondsRemaining: number | null;
  transcript: TranscriptLine[];
  questionsAnswered: number;
  start: () => Promise<void>;
  skipQuestion: () => void;
  end: (reason: 'user' | 'timeout' | 'unload') => Promise<void>;
}
```

### `start()`

1. `POST /api/interviews/:id/session-token`, receive `{ sessionToken, timeLimitSecs }`.
2. Lazy-import the SDK, `createClient(sessionToken)`.
3. Register listeners **before** streaming, or you lose the greeting:
   `AnamEvent.SESSION_READY`, `AnamEvent.MESSAGE_HISTORY_UPDATED`,
   `AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED`.
4. `await client.streamToVideoElement(videoElId)`.
5. Transition to `live` on `SESSION_READY`, not on the `streamToVideoElement` promise
   resolving. The promise resolving means the stream was attached, `SESSION_READY` means the
   persona is actually able to talk. Enabling Skip and End too early is a real bug here.
6. Start the countdown when `SESSION_READY` fires, so connection time is not billed against
   the candidate's 3 minutes.

Must be triggered by a click. Never on mount, never in an effect. Autoplay policy will
silently block the stream otherwise, and the failure looks like a network problem.

### Transcript buffering

`AnamEvent.MESSAGE_HISTORY_UPDATED` fires each time a participant finishes speaking and
delivers **the complete conversation so far**, not a delta:

```ts
client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
  // messages: { role: 'user' | 'assistant', content: string }[]
});
```

That makes the design simpler than an append-only buffer. Treat each event as authoritative:

- Replace local `transcript` state with the snapshot wholesale.
- `sequence` is the **array index** in the snapshot. It is stable because history only grows.
- `role: 'assistant'` maps to `INTERVIEWER`, `role: 'user'` maps to `CANDIDATE`.
- Track `lastFlushedIndex`. Flush `snapshot.slice(lastFlushedIndex)` every 5 seconds and
  immediately on session end. On success advance the marker, on failure leave it and retry.
  Re-sending an already-stored range is harmless, the server dedupes on
  `(interviewId, sequence)`.

One caveat this design handles for free: Anam rewrites history when a turn is interrupted,
so a line's content can change after you first saw it. Because sequence is the array index,
a corrected line re-flushes to the same slot. Make the server's upsert an actual upsert on
`(interviewId, sequence)`, updating content, rather than a `skipDuplicates` insert.

Use `AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED` only for the live partial caption under the
video. Never persist partials, they are superseded by the next history snapshot.

Mirror the snapshot and `lastFlushedIndex` into `sessionStorage` keyed by interview id so a
refresh mid-session does not lose unflushed lines.

### `questionsAnswered`

Count interviewer turns that contain the marker phrase the persona emits ("Question two.",
"Question three.") rather than counting candidate turns. Probes would otherwise inflate the
count. Display as `N of {questionCount} questions answered`.

### Teardown

Every one of these paths must call `client.stopStreaming()` and stop all tracks on the local
media stream:

- The End interview button.
- Timer reaching zero.
- Component unmount (`useEffect` cleanup).
- `beforeunload` and `pagehide`.
- Route change away from the live room.

On `beforeunload`, also flush pending transcript with `navigator.sendBeacon` since a normal
`fetch` will be cancelled.

Failing to stop tracks leaves the camera or mic indicator on and burns free-tier minutes on
an abandoned session. Add a Playwright assertion that no active tracks remain after End.

### Timer

Client countdown drives the UI. It is not the enforcement mechanism. The server refuses to
mint a second token for a `LIVE` interview, and the reaper cleans up. At `T-30s` the timer
changes to the warning treatment. At zero, `end('timeout')` runs automatically and the user
sees "Time's up. Scoring your answers." rather than a silent freeze.

### Error states, written as directions not apologies

| Cause | Message |
|---|---|
| Mic permission denied | "Microphone access is blocked. Allow it in your browser's site settings, then start again." |
| `AnamUnavailable` | "Could not reach the interviewer. Check your connection and start again." |
| Stream drops mid-session | "The connection dropped. Your answers so far are saved. End the session to get your report." |
| Transcript too short at scoring | "Answer at least two questions to get a report." |

## Screens

### 1. Setup (`/`)

Role (text), seniority (segmented control), competencies (multi-select chips, 1 to 5),
question count (1 to 5, default 3).

Chips and the segmented control render `COMPETENCY_LABELS[value]` and
`SENIORITY_LABELS[value]` from `@coach/contracts`. The underlying value held in state and
sent to the API is the uppercase enum member (`OWNERSHIP`, `SENIOR`), unchanged. Never
lowercase, title-case, or otherwise transform an enum value on its way to the API. The
label map is for eyes only. Primary action: "Start setup" creates the
interview and routes to `/interview/[id]`.

Show the time limit as read-only context: "Sessions run for 3 minutes." It is a real
constraint and hiding it makes the hard stop feel like a bug.

### 2. Live room (`/interview/[id]`)

This is the screen in the supplied screenshot. Layout below.

### 3. Feedback (`/interview/[id]/feedback`)

Per question: the question, the candidate's answer summary, a four-cell STAR strip showing
present/missing, the 1 to 5 score, and the one improvement sentence. Then overall strengths
and the mean score. Missing STAR elements are the visual emphasis, not the score. The score
is a summary, the missing element is the instruction.

Scoring takes several seconds. Show a determinate-feeling progress state, and generate on
arrival rather than making the user press a button.

### 4. History (`/history`)

A list of past sessions (date, role, seniority, competencies, score) and a score trend
across sessions. Also render `starCoverage`: a four-bar view of how often each STAR element
appeared. That is the screen's actual payload.

## Visual specification

The screenshot pins the direction, so follow it rather than reinventing. Extract these
tokens into `apps/web/app/tokens.css` as CSS custom properties consumed by Tailwind v4's
`@theme`.

### Palette

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#EDF3EF` | Page background, soft mint |
| `--surface` | `#FFFFFF` | Cards |
| `--ink` | `#111614` | Headings |
| `--ink-muted` | `#5B6B64` | Body, descriptions |
| `--ink-faint` | `#8A9993` | Empty states, meta labels |
| `--accent` | `#0F8A63` | Eyebrows, status dot, focus rings |
| `--accent-soft` | `#8FBFA9` | Primary button in its resting/disabled tint |
| `--line` | `#DCE6E0` | Card borders, dividers, dashed empty state |
| `--warn` | `#B4541F` | Timer under 30s |

Eyebrow labels (`BEHAVIOURAL INTERVIEW PRACTICE`, `LIVE ROOM`, `CAPTURE`, `INTERVIEWER`) are
`--accent` for section eyebrows and `--ink-faint` for the meta strip, uppercase, letter
spacing `0.08em`, size `11px`, weight 600.

### Type

Display and headings: a grotesque with tight tracking at large sizes. `Inter Tight` or
`Geist` at weight 700 for "Mock Interview Coach" (36px, tracking `-0.02em`), 600 for card
titles (18px). Body: the same family at 400/500, 14px, line height 1.55. Numerals in the
meta strip (`3`, `180s`) use `font-variant-numeric: tabular-nums` so the countdown does not
jitter as digits change.

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ EYEBROW                                        ( ● Ready )     │
│ Mock Interview Coach                                            │
│ Practise concise STAR answers with a live interviewer...       │
│                                                                  │
│ ┌─────────────────────────────────┐  ┌──────────────────────┐  │
│ │ LIVE ROOM        (3 min pill)   │  │ CAPTURE               │  │
│ │ Interview stage                 │  │ Live transcript       │  │
│ │ ┌─────────────────────────────┐ │  │ Captured from the...  │  │
│ │ │        <video>              │ │  │ ┌────────────────────┐│  │
│ │ │                             │ │  │ │  (dashed empty)    ││  │
│ │ └─────────────────────────────┘ │  │ └────────────────────┘│  │
│ │ [Start] [Skip] [End]  ┌───────┐ │  └──────────────────────┘  │
│ │                       │status │ │                             │
│ │                       └───────┘ │                             │
│ │ ┌──────────┬─────────┬─────────┐│                             │
│ │ │INTERVI. │QUESTION │TIME LIMIT││                             │
│ │ │ John    │   3     │  180s    ││                             │
│ │ └──────────┴─────────┴─────────┘│                             │
│ └─────────────────────────────────┘                             │
└────────────────────────────────────────────────────────────────┘
```

- Content column max width `1120px`, centred, `--canvas` background.
- Two-column grid, roughly `1.9fr / 1fr`, gap `20px`. Collapses to one column below
  `1024px` with the transcript panel moving below the stage.
- Cards: `--surface`, `1px solid --line`, radius `14px`, padding `20px`, no drop shadow.
  The design reads flat and quiet, do not add elevation.
- Video element: radius `10px`, `1px solid --line`, aspect ratio `16 / 10`, `object-fit:
  cover`, `background: #000` so the pre-connect state is a deliberate black frame rather
  than a flash of white.
- Button row and the status box sit on one line, status box `flex: 1`, `--canvas` fill,
  radius `10px`, containing the connection line plus the bold `0 of 3 questions answered`.
- Meta strip: three equal cells separated by `1px --line` verticals, in its own bordered
  card below the buttons.
- Empty transcript: dashed `1px --line`, radius `10px`, min-height `120px`, centred
  `--ink-faint` text "Transcript will appear here."

### Buttons

Primary (`Start interview`): `--accent` fill, white text, radius `8px`, `10px 18px`.
The screenshot shows it in the `--accent-soft` tint, which is the disabled state before the
setup is loaded. Secondary (`Skip question`, `End interview`): `--surface` fill, `1px solid
--line`, `--ink` text.

Button availability by state:

| State | Start | Skip | End |
|---|---|---|---|
| idle | enabled | disabled | disabled |
| connecting | disabled, label "Connecting..." | disabled | enabled |
| live | disabled | enabled | enabled |
| ending / ended | disabled | disabled | disabled |

Never let Start be clickable twice. A double click that mints two tokens is the most likely
way to burn the free tier.

### Status pill (top right)

Dot plus label. `idle` = `--accent` dot, "Ready". `connecting` = amber, "Connecting".
`live` = `--accent`, "Live", with a slow pulse. `error` = `--warn`, "Error". Respect
`prefers-reduced-motion` and drop the pulse.

### Live transcript rendering

Once lines arrive, replace the empty state with a scrolling list. Interviewer lines get an
`--accent` speaker label, candidate lines get `--ink`. Auto-scroll to the newest line only
when the user is already at the bottom, so reading back is not yanked away. Cap the rendered
list and virtualise only if a 3 minute session ever exceeds a few hundred lines, which it
will not, so do not build virtualisation.

## Quality floor

Non-negotiable, checked in the phase 10 gate:

- Responsive to 375px.
- Visible keyboard focus using `--accent`, never `outline: none` without a replacement.
- All controls reachable and operable by keyboard.
- `prefers-reduced-motion` respected on the pulse and any transitions.
- The transcript panel is an `aria-live="polite"` region so screen reader users get the
  interviewer's questions as text.
- The video element has a meaningful label, and the interview is usable if the avatar video
  fails but audio works.
