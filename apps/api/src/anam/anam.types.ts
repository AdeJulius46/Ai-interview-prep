// Shapes for the Anam HTTP boundary. Everything Anam-shaped lives behind
// AnamService so tests only ever mock this one class's transport (via msw).
// See backend.md, "AnamService", and README.md's "Verification status of
// external API details".

// Confirmed body shape: `{ clientLabel, personaConfig: { name, avatarId,
// avatarModel, voiceId, llmId, systemPrompt, maxSessionLengthSeconds,
// skipGreeting } }`. `maxSessionLengthSeconds` sits inside `personaConfig`,
// not `sessionOptions` — see README.md, confirmed against Anam's docs.
export interface PersonaConfig {
  name: string;
  avatarId: string;
  voiceId: string;
  llmId: string;
  avatarModel: string;
  systemPrompt: string;
  maxSessionLengthSeconds: number;
  skipGreeting: boolean;
}

export interface CreateSessionTokenResult {
  sessionToken: string;
  // Anam's session id for this token, if the response carries one. Persisted
  // as Interview.anamSessionId when present (backend.md, "POST
  // /interviews/:id/session-token", step 4).
  anamSessionId?: string;
}

// Post-session transcript line shape. Endpoint is unverified per README.md
// ("Not verified, confirm before implementing") — kept behind
// AnamService#getSessionTranscript so a Phase 7 confirmation is a one-file
// change.
export interface AnamTranscriptLine {
  speaker: 'INTERVIEWER' | 'CANDIDATE';
  content: string;
  spokenAt: string;
}
