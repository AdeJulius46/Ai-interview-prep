import { z } from 'zod';

// Validated once at boot (see config.module.ts). A missing or malformed
// required variable must throw here so the process crashes at startup,
// never surfacing as a 500 at request time. See backend.md, "Boot-time
// guarantees", and testing.md gate:0.
export const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ANAM_API_KEY: z.string().min(1, 'ANAM_API_KEY is required'),
  ANAM_API_BASE: z.string().url('ANAM_API_BASE must be a valid URL'),
  ANAM_AVATAR_MODEL: z.string().min(1, 'ANAM_AVATAR_MODEL is required'),
  ANAM_AVATAR_ID: z.string().min(1, 'ANAM_AVATAR_ID is required'),
  ANAM_VOICE_ID: z.string().min(1, 'ANAM_VOICE_ID is required'),
  ANAM_LLM_ID: z.string().min(1, 'ANAM_LLM_ID is required'),
  SESSION_TIME_LIMIT_SECONDS: z.coerce.number().int().positive().default(180),
  // Backoff schedule for retrying Anam's (unverified) post-session transcript
  // endpoint from TranscriptService — backend.md: "retry with backoff (3
  // attempts, 1s/3s/7s) and degrade gracefully". Overridable in .env.test so
  // the gate:7 backoff/degrade tests don't burn ~11s of real wall-clock time
  // per test while still exercising a real multi-attempt retry loop.
  ANAM_TRANSCRIPT_RETRY_DELAYS_MS: z.string().default('1000,3000,7000'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  // The scoring LLM is swappable behind ScoringProvider (backend.md,
  // "FeedbackService > Scoring call"); this selects which implementation
  // feedback.module.ts binds. OPENROUTER_API_KEY is only required when
  // this is actually set to 'openrouter' — enforced below via
  // superRefine, not by making it unconditionally required, so accounts
  // that only ever use Anthropic never need an OpenRouter key at all.
  SCORING_PROVIDER: z.enum(['anthropic', 'openrouter']).default('anthropic'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-3.5-lightning:free'),
  WEB_ORIGIN: z.string().url('WEB_ORIGIN must be a valid URL'),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
}).superRefine((env, ctx) => {
  if (env.SCORING_PROVIDER === 'openrouter' && !env.OPENROUTER_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENROUTER_API_KEY'],
      message: 'OPENROUTER_API_KEY is required when SCORING_PROVIDER=openrouter',
    });
  }
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
