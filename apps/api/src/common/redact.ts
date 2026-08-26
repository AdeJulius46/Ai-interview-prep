// Strips secrets from logs and error bodies. See backend.md, AnamService:
// "A logged Bearer token is the failure mode to design against."
const SECRET_ENV_KEYS = ['ANAM_API_KEY', 'ANTHROPIC_API_KEY'] as const;

export function redact(input: string): string {
  let redacted = input;
  for (const key of SECRET_ENV_KEYS) {
    const secret = process.env[key];
    if (secret && secret.length > 0) {
      redacted = redacted.split(secret).join('[REDACTED]');
    }
  }
  return redacted.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
