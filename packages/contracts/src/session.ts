import { z } from 'zod';

// This is the entire boundary between the trusted server and the browser
// for the Anam session. It must never carry avatarId, voiceId, llmId, or
// systemPrompt. See backend.md, "POST /interviews/:id/session-token", and
// architecture.md, "The key never crosses arrow 6."
export const SessionTokenResponseSchema = z.object({
  sessionToken: z.string().min(1),
  timeLimitSecs: z.number().int().positive(),
  expiresAt: z.string().datetime(),
});
export type SessionTokenResponse = z.infer<typeof SessionTokenResponseSchema>;
