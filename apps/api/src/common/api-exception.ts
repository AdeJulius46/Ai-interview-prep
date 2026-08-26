import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@coach/contracts';

// Named exceptions for the codes the frontend branches on (backend.md,
// "Error handling"). HttpExceptionFilter already reads `error`/`message`
// off an HttpException's response payload, so these just need to shape that
// payload consistently.
export class ApiException extends HttpException {
  constructor(status: number, error: ApiErrorCode, message: string) {
    super({ statusCode: status, error, message }, status);
  }
}

export class InterviewNotFoundException extends ApiException {
  constructor() {
    super(404, 'InterviewNotFound', 'This interview could not be found.');
  }
}

export class InterviewAlreadyStartedException extends ApiException {
  constructor() {
    super(
      409,
      'InterviewAlreadyStarted',
      'This interview has already started. Refresh and continue the existing session.',
    );
  }
}

export class AnamUnavailableException extends ApiException {
  constructor() {
    super(502, 'AnamUnavailable', 'Could not start the interview session. Try again.');
  }
}

export class InterviewAlreadyCompletedException extends ApiException {
  constructor() {
    super(409, 'InterviewAlreadyCompleted', 'This interview has already ended.');
  }
}

export class InterviewNotCompletedException extends ApiException {
  constructor() {
    super(409, 'InterviewNotCompleted', 'End the interview before requesting a report.');
  }
}

export class TranscriptTooShortException extends ApiException {
  constructor() {
    super(409, 'TranscriptTooShort', 'Answer at least two questions to get a report.');
  }
}

export class ScoringFailedException extends ApiException {
  constructor() {
    super(502, 'ScoringFailed', 'Could not generate your report. Try again.');
  }
}
