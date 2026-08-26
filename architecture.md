# Architecture and Flow

Visual companion to the spec pack. Every diagram here is normative: if an implementation
disagrees with a diagram, the implementation is wrong.

Mermaid renders on GitHub, in VS Code with the Markdown Preview Mermaid extension, and in
most md viewers.

---

## 1. System topology

The single most important line in this diagram is the trust boundary. `ANAM_API_KEY` and
`ANTHROPIC_API_KEY` exist only inside the trusted box. The browser receives a short-lived
session token and nothing else.

```mermaid
flowchart LR
  subgraph browser["Browser (untrusted)"]
    UI["Next.js app<br/>apps/web"]
    SDK["@anam-ai/js-sdk"]
    VID["video element"]
    MIC["microphone"]
  end

  subgraph server["Your server (trusted)"]
    API["NestJS API<br/>apps/api"]
    DB[("PostgreSQL<br/>via Prisma")]
  end

  subgraph third["Third party"]
    ANAM["Anam<br/>api.anam.ai"]
    LLM["Scoring LLM<br/>Anthropic Messages API"]
  end

  UI -->|"1. POST /interviews"| API
  API -->|"2. select questions"| DB
  UI -->|"3. POST /:id/session-token"| API
  API -->|"4. Bearer ANAM_API_KEY<br/>+ personaConfig"| ANAM
  ANAM -->|"5. sessionToken"| API
  API -->|"6. sessionToken only"| UI
  UI --> SDK
  MIC --> SDK
  SDK <-->|"7. WebRTC media"| ANAM
  SDK --> VID
  SDK -->|"8. MESSAGE_HISTORY_UPDATED"| UI
  UI -->|"9. POST /:id/messages"| API
  API --> DB
  API -->|"10. GET session transcript<br/>(unverified, see README)"| ANAM
  API -->|"11. transcript + scoring prompt"| LLM
  LLM -->|"12. STAR JSON"| API
```

**The key never crosses arrow 6.** Gate 3 asserts this against the raw serialised response
body, not the parsed object.

---

## 2. Interview lifecycle, end to end

```mermaid
sequenceDiagram
  autonumber
  actor C as Candidate
  participant W as Next.js (apps/web)
  participant A as NestJS (apps/api)
  participant DB as PostgreSQL
  participant AN as Anam
  participant L as Scoring LLM

  Note over C,W: Setup screen
  C->>W: role, seniority, competencies, count
  W->>A: POST /api/interviews
  A->>DB: QuestionBankService.select()
  DB-->>A: 3 questions (shuffled, seniority-matched)
  A->>DB: INSERT Interview + InterviewQuestion rows
  A-->>W: 201 { id, status: CREATED }
  W->>C: route to /interview/:id

  Note over C,W: Live room. Nothing fires until the click.
  C->>W: click "Start interview"
  W->>A: POST /api/interviews/:id/session-token
  A->>DB: load Interview + questions
  A->>A: PersonaService.build() renders prompt<br/>with the exact question list
  A->>AN: POST /v1/auth/session-token<br/>Bearer key, personaConfig
  AN-->>A: { sessionToken }
  A->>DB: status = LIVE, startedAt = now
  A-->>W: { sessionToken, timeLimitSecs }

  W->>W: lazy import SDK, register listeners
  W->>AN: createClient + streamToVideoElement
  AN-->>W: SESSION_READY
  W->>W: state = live, start countdown

  loop each completed turn
    AN-->>W: MESSAGE_HISTORY_UPDATED (full snapshot)
    W->>W: replace transcript, sequence = array index
  end

  loop every 5s
    W->>A: POST /:id/messages (slice from lastFlushedIndex)
    A->>DB: upsert on (interviewId, sequence)
  end

  Note over C,W: Timer hits zero, or candidate clicks End
  W->>W: stopStreaming, stop media tracks
  W->>A: final flush, then POST /:id/complete
  A->>AN: GET session transcript (retry 1s/3s/7s)
  AN-->>A: authoritative lines
  A->>DB: insert anything the SDK missed, status = COMPLETED
  A-->>W: 200

  W->>A: POST /:id/feedback
  A->>A: segment transcript on marker phrases
  A->>L: strict-JSON scoring prompt
  L-->>A: { answers[], strengths[] }
  A->>A: Zod parse, retry once on failure
  A->>A: compute overallScore in TypeScript
  A->>DB: INSERT Feedback + AnswerFeedback, status = SCORED
  A-->>W: FeedbackDto
  W->>C: STAR report
```

---

## 3. Interview status (server side)

Persisted on the `Interview` row. Owned by the API, never set by the client.

```mermaid
stateDiagram-v2
  [*] --> CREATED: POST /interviews
  CREATED --> LIVE: session-token minted
  CREATED --> CREATED: second token request<br/>409 InterviewAlreadyStarted
  LIVE --> COMPLETED: POST /complete
  LIVE --> ABANDONED: cron reaper<br/>startedAt + timeLimit + 120s
  COMPLETED --> SCORED: POST /feedback
  COMPLETED --> COMPLETED: fewer than 2 candidate turns<br/>409 TranscriptTooShort
  SCORED --> SCORED: repeat POST /feedback<br/>returns cached, no LLM call
  SCORED --> [*]
  ABANDONED --> [*]
```

`ABANDONED` exists because a closed tab otherwise leaves rows stuck `LIVE` forever and the
history screen fills with ghosts.

---

## 4. Session state (client side)

Owned by `useAnamSession`. Drives every control in the live room.

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> connecting: user clicks Start
  connecting --> live: SESSION_READY
  connecting --> error: mic denied / AnamUnavailable
  live --> ending: End clicked, timer zero,<br/>unmount, or beforeunload
  live --> error: stream drops
  ending --> ended: stopStreaming + tracks stopped<br/>+ final flush + /complete
  error --> idle: user retries
  ended --> [*]

  note right of connecting
    streamToVideoElement resolving
    is NOT the live signal.
    Wait for SESSION_READY.
  end note
```

Control availability by state:

| State | Start | Skip | End |
|---|---|---|---|
| idle | enabled | disabled | disabled |
| connecting | disabled, "Connecting..." | disabled | enabled |
| live | disabled | enabled | enabled |
| ending / ended / error | disabled | disabled | disabled |

---

## 5. Transcript flow

The subtlest part of the system, and the one most likely to be implemented wrong.

```mermaid
flowchart TD
  EV["AnamEvent.MESSAGE_HISTORY_UPDATED<br/>full snapshot, not a delta"]
  ST["client state: transcript[]<br/>sequence = array index"]
  PART["MESSAGE_STREAM_EVENT_RECEIVED<br/>partial caption"]
  CAP["live caption under video<br/>never persisted"]
  SS["sessionStorage mirror<br/>survives refresh"]
  FL{"flush tick<br/>every 5s"}
  POST["POST /:id/messages<br/>slice(lastFlushedIndex)"]
  UPS["UPSERT on (interviewId, sequence)"]
  BEAC["navigator.sendBeacon<br/>on beforeunload"]
  COMP["POST /:id/complete"]
  REC{"Anam transcript<br/>available?"}
  MERGE["insert missed lines<br/>source = anam-api"]
  DEG["keep SDK-only transcript<br/>degrade, do not fail"]
  DONE["status = COMPLETED"]

  EV --> ST
  PART --> CAP
  ST --> SS
  ST --> FL
  FL --> POST
  POST --> UPS
  ST --> BEAC
  BEAC --> UPS
  UPS --> COMP
  COMP --> REC
  REC -->|"yes, within 3 retries"| MERGE
  REC -->|"no"| DEG
  MERGE --> DONE
  DEG --> DONE
```

Two rules the diagram encodes:

1. **Upsert, not insert-skip-duplicates.** Anam rewrites history when a turn is interrupted,
   so the content at a given sequence can change after you first stored it. A
   `skipDuplicates` insert silently keeps the stale text.
2. **Partials are never persisted.** They are superseded by the next snapshot.

---

## 6. Data model

```mermaid
erDiagram
  Interview ||--o{ InterviewQuestion : "asks"
  Question  ||--o{ InterviewQuestion : "drawn as"
  Interview ||--o{ Message : "transcribed as"
  Interview ||--o| Feedback : "scored by"
  Feedback  ||--o{ AnswerFeedback : "breaks down into"

  Interview {
    uuid id PK
    string role
    Seniority seniority
    Competency_array competencies
    int questionCount
    int timeLimitSecs "server set, clamped to 180"
    InterviewStatus status
    string anamSessionId UK
  }
  Question {
    uuid id PK
    Competency competency
    Seniority_array seniority
    string text
    bool active
  }
  InterviewQuestion {
    uuid id PK
    int position "unique per interview"
  }
  Message {
    uuid id PK
    Speaker speaker
    string content
    int sequence "unique per interview, = snapshot index"
    string source "sdk | anam-api"
  }
  Feedback {
    uuid id PK
    float overallScore "computed in TS, not by the LLM"
    string_array strengths
    json rawResponse
  }
  AnswerFeedback {
    uuid id PK
    int questionIndex
    bool hasSituation
    bool hasTask
    bool hasAction
    bool hasResult
    int score "1..5"
    string improvement
  }
```

`InterviewQuestion` is what lets the feedback step know the exact question text without
parsing it back out of the transcript.

---

## 7. Build order and gate dependencies

Each gate re-runs every gate below it, so an arrow means "cannot be green unless this is
green".

```mermaid
flowchart BT
  G0["gate:0<br/>workspace boots"]
  G1["gate:1<br/>contracts + enum parity"]
  G2["gate:2<br/>setup + question bank"]
  G3["gate:3<br/>session token<br/>KEY NEVER LEAKS"]
  G4["gate:4<br/>ui primitives"]
  G5["gate:5<br/>setup screen"]
  G6["gate:6<br/>live room"]
  G7["gate:7<br/>transcript"]
  G8["gate:8<br/>STAR feedback"]
  G9["gate:9<br/>progress"]
  G10["gate:10<br/>full path + a11y"]

  G1 --> G0
  G2 --> G1
  G3 --> G2
  G4 --> G1
  G5 --> G2
  G5 --> G4
  G6 --> G3
  G6 --> G5
  G7 --> G6
  G8 --> G7
  G9 --> G8
  G10 --> G9

  style G3 stroke-width:3px
```

Gate 4 branches off gate 1 rather than gate 3, so UI primitive work can proceed in parallel
with the token service if two agents are running.

---

## 8. Which document governs which arrow

| Diagram element | Spec |
|---|---|
| Trust boundary, env vars, phase order | `README.md` |
| Arrows 1 to 5, 9 to 12 in the topology | `backend.md` |
| Arrows 6 to 9, both client state machines | `frontend.md` |
| Enum casing, wire shapes, UI primitives | `shared.md` |
| Every gate node in diagram 7 | `testing.md` |

---

## 9. What can go wrong, by location

| Failure | Where it surfaces | Designed response |
|---|---|---|
| Anam 5xx at token time | topology arrow 4 | 502 `AnamUnavailable`, upstream body never forwarded |
| Double click on Start | client `connecting` state | Start disabled, and 409 server side as backstop |
| Mic permission denied | client `connecting` to `error` | permission message with the fix, not an apology |
| Stream drops mid-session | client `live` to `error` | answers so far are saved, End still available |
| Tab closed mid-session | no `/complete` call | `sendBeacon` final flush, then cron reaper marks `ABANDONED` |
| Anam transcript API missing | diagram 5, `REC` node | degrade to SDK-only transcript, still return 200 |
| LLM returns malformed JSON | scoring step | one retry with the parse error, then 502 and persist nothing |
| Interrupted turn rewrites history | diagram 5, `UPS` node | upsert on `(interviewId, sequence)` |
