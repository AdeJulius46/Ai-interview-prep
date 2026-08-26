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
  // implementing"). Kept behind this interface so that when the real path
  // and shape are confirmed in Phase 7, only this method changes — the
  // reconciliation step elsewhere degrades to a no-op until then.
  async getSessionTranscript(_sessionId: string): Promise<AnamTranscriptLine[]> {
    throw new Error(
      'AnamService#getSessionTranscript is not implemented yet. The Anam post-session ' +
        'transcript endpoint is unverified (see README.md); confirm it against ' +
        'https://api.anam.ai/swagger.json before implementing in Phase 7.',
    );
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
