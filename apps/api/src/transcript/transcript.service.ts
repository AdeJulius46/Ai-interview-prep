// Append, dedupe, reconcile. See backend.md, "POST /interviews/:id/messages"
// and "POST /interviews/:id/complete", and architecture.md diagram 5 (the
// transcript flow) — the two rules it encodes are both implemented here:
// upsert-not-skipDuplicates (Anam rewrites history when a turn is
// interrupted, so content at a sequence can change), and partials are never
// persisted (enforced client-side; this service only ever sees full lines).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { InterviewDto, TranscriptLine } from '@coach/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AnamService } from '../anam/anam.service';
import { toInterviewDto } from '../interviews/dto/interview.mapper';
import { InterviewAlreadyCompletedException, InterviewNotFoundException } from '../common/api-exception';

function normalize(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anamService: AnamService,
    private readonly configService: ConfigService,
  ) {}

  private get retryDelaysMs(): number[] {
    const raw = this.configService.get<string>('ANAM_TRANSCRIPT_RETRY_DELAYS_MS') ?? '';
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }

  // POST /interviews/:id/messages. Batch upsert on (interviewId, sequence):
  // an unseen sequence is a genuine insert, an existing sequence with
  // identical content/speaker is a true no-op duplicate ("skipped"), and an
  // existing sequence whose content changed is a real update ("accepted") —
  // testing.md gate:7 is explicit that a content change must UPDATE the row,
  // never be silently skipped as if it were an exact duplicate.
  async appendMessages(
    interviewId: string,
    messages: TranscriptLine[],
  ): Promise<{ accepted: number; skipped: number }> {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) {
      throw new InterviewNotFoundException();
    }
    if (interview.status === 'COMPLETED' || interview.status === 'SCORED') {
      throw new InterviewAlreadyCompletedException();
    }

    const sequences = messages.map((m) => m.sequence);
    const existing = await this.prisma.message.findMany({
      where: { interviewId, sequence: { in: sequences } },
    });
    const existingBySequence = new Map(existing.map((m) => [m.sequence, m]));

    let accepted = 0;
    let skipped = 0;
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const message of messages) {
      const current = existingBySequence.get(message.sequence);
      const isExactDuplicate =
        current !== undefined &&
        current.content === message.content &&
        current.speaker === message.speaker;

      if (isExactDuplicate) {
        skipped += 1;
        continue;
      }

      accepted += 1;
      writes.push(
        this.prisma.message.upsert({
          where: { interviewId_sequence: { interviewId, sequence: message.sequence } },
          create: {
            interviewId,
            speaker: message.speaker,
            content: message.content,
            spokenAt: new Date(message.spokenAt),
            sequence: message.sequence,
            source: 'sdk',
          },
          update: {
            speaker: message.speaker,
            content: message.content,
            spokenAt: new Date(message.spokenAt),
          },
        }),
      );
    }

    if (writes.length > 0) {
      await this.prisma.$transaction(writes);
    }

    return { accepted, skipped };
  }

  // POST /interviews/:id/complete. Sets status = COMPLETED, then — if this
  // interview ever minted a session — attempts to reconcile against Anam's
  // (unverified) post-session transcript. Degrades to a no-op on failure
  // rather than failing the request: backend.md, "degrade gracefully to the
  // SDK-only transcript rather than failing the request".
  async complete(interviewId: string): Promise<InterviewDto> {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) {
      throw new InterviewNotFoundException();
    }

    if (interview.status === 'COMPLETED' || interview.status === 'SCORED') {
      return toInterviewDto(interview);
    }

    const updated = await this.prisma.interview.update({
      where: { id: interviewId },
      data: { status: 'COMPLETED', endedAt: new Date() },
    });

    if (interview.anamSessionId) {
      await this.reconcileTranscript(interviewId, interview.anamSessionId);
    }

    return toInterviewDto(updated);
  }

  private async reconcileTranscript(interviewId: string, anamSessionId: string): Promise<void> {
    const delays = this.retryDelaysMs;
    const attempts = Math.max(delays.length, 1);
    let lines: Awaited<ReturnType<AnamService['getSessionTranscript']>> | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        lines = await this.anamService.getSessionTranscript(anamSessionId);
        break;
      } catch (err) {
        this.logger.warn(
          `Anam transcript attempt ${attempt + 1}/${attempts} failed: ${String(err)}`,
        );
        if (attempt < attempts - 1) {
          await sleep(delays[attempt] ?? 0);
        }
      }
    }

    if (!lines) {
      // Degrade to the SDK-only transcript rather than failing the request.
      return;
    }

    const existing = await this.prisma.message.findMany({ where: { interviewId } });
    const existingKeys = new Set(existing.map((m) => `${m.speaker}::${normalize(m.content)}`));
    let nextSequence =
      existing.length > 0 ? Math.max(...existing.map((m) => m.sequence)) + 1 : 0;

    const missing = lines.filter(
      (line) => !existingKeys.has(`${line.speaker}::${normalize(line.content)}`),
    );

    if (missing.length === 0) {
      return;
    }

    await this.prisma.message.createMany({
      data: missing.map((line) => ({
        interviewId,
        speaker: line.speaker,
        content: line.content,
        spokenAt: new Date(line.spokenAt),
        sequence: nextSequence++,
        source: 'anam-api',
      })),
    });
  }
}
