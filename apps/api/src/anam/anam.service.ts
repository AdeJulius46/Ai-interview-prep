// Thin HTTP client for Anam. See backend.md, "AnamService": everything
// Anam-shaped lives here so tests can mock one class (via msw intercepting
// the outbound fetch — see testing.md's "hard mocking rule #1", Anam is
// never called for real in an automated test).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redact } from '../common/redact';
import { AnamUnavailableException } from '../common/api-exception';
import type { AnamTranscriptLine, CreateSessionTokenResult, PersonaConfig } from './anam.types';

const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class AnamService {
  private readonly logger = new Logger(AnamService.name);

  constructor(private readonly configService: ConfigService) {}

  async createSessionToken(
    clientLabel: string,
    personaConfig: PersonaConfig,
  ): Promise<CreateSessionTokenResult> {
    const base = this.configService.get<string>('ANAM_API_BASE');
    const apiKey = this.configService.get<string>('ANAM_API_KEY');
    const url = `${base}/auth/session-token`;

    const doRequest = () =>
      this.fetchWithTimeout(url, apiKey!, { clientLabel, personaConfig });

    const response = await this.requestWithOneRetry(doRequest);

    if (!response.ok) {
      // Never forward the upstream body: backend.md, AnamService: "Map
      // upstream failures to a 502 with a generic message. Never forward
      // the upstream body to the client, it can echo request headers."
      this.logger.error(redact(`Anam session-token request failed with status ${response.status}`));
      throw new AnamUnavailableException();
    }

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      this.logger.error(redact(`Anam session-token response was not valid JSON: ${String(err)}`));
      throw new AnamUnavailableException();
    }

    const sessionToken = data.sessionToken;
    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      this.logger.error('Anam session-token response was missing sessionToken');
      throw new AnamUnavailableException();
    }

    const anamSessionId = data.sessionId ?? data.anamSessionId;

    return {
      sessionToken,
      anamSessionId: typeof anamSessionId === 'string' ? anamSessionId : undefined,
    };
  }

  // Unverified endpoint (README.md, "Not verified, confirm before
  // implementing"): the path/shape below have not been confirmed against
  // https://api.anam.ai/swagger.json. Kept behind this interface so that
  // confirming the real endpoint is a one-file change. This method is a
  // single attempt with its own timeout — it throws on any failure (4xx,
  // 5xx, timeout, malformed body) and lets the caller (TranscriptService)
  // own the "not ready yet" business-level retry/backoff described in
  // backend.md's POST /complete section, since that's a different concern
  // than this class's own network-resilience retry on createSessionToken.
  async getSessionTranscript(sessionId: string): Promise<AnamTranscriptLine[]> {
    const base = this.configService.get<string>('ANAM_API_BASE');
    const apiKey = this.configService.get<string>('ANAM_API_KEY');
    const url = `${base}/sessions/${sessionId}/transcript`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.warn(redact(`Anam transcript request failed: ${String(err)}`));
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Anam transcript request failed with status ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(`Anam transcript response was not valid JSON: ${String(err)}`);
    }

    if (!Array.isArray(data)) {
      throw new Error('Anam transcript response was not an array');
    }

    return data.map((line) => {
      const record = line as Record<string, unknown>;
      const role = record.role ?? record.speaker;
      return {
        speaker: role === 'user' || role === 'CANDIDATE' ? 'CANDIDATE' : 'INTERVIEWER',
        content: String(record.content ?? ''),
        spokenAt:
          typeof record.spokenAt === 'string' ? record.spokenAt : new Date().toISOString(),
      };
    });
  }

  private async fetchWithTimeout(
    url: string,
    apiKey: string,
    body: unknown,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // No retry on 4xx, one retry on 5xx or timeout/network error. See
  // backend.md, AnamService: "10s timeout, no retry on 4xx, one retry on
  // 5xx or timeout."
  private async requestWithOneRetry(doRequest: () => Promise<Response>): Promise<Response> {
    let response: Response | undefined;
    let lastError: unknown;

    try {
      response = await doRequest();
    } catch (err) {
      lastError = err;
    }

    const shouldRetry = !response || response.status >= 500;
    if (shouldRetry) {
      try {
        response = await doRequest();
      } catch (err) {
        lastError = err;
      }
    }

    if (!response) {
      this.logger.error(redact(`Anam request failed after retry: ${String(lastError)}`));
      throw new AnamUnavailableException();
    }

    return response;
  }
}
