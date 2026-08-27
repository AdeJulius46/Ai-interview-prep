// STAR analysis orchestration. See backend.md, "FeedbackService".
import { Inject, Injectable } from '@nestjs/common';
import type { FeedbackDto } from '@coach/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toFeedbackDto } from './dto/feedback.mapper';
import {
  InterviewNotCompletedException,
  InterviewNotFoundException,
  ScoringFailedException,
  TranscriptTooShortException,
} from '../common/api-exception';
import { SCORING_PROVIDER, type ScoringProvider, type ScoringSegment } from './llm/llm.interface';

// The persona prompt (persona/prompts.ts, PROMPT_V1) instructs the
// interviewer to open each new question with this exact marker phrase.
// Segmentation splits on it rather than trying to infer question
// boundaries positionally — backend.md, "FeedbackService > Segmentation":
// "Prefer the marker-phrase approach. It moves an ambiguous parsing
// problem into the prompt where you can actually control it."
const QUESTION_MARKER = /\bQuestion (one|two|three|four|five)\b/i;

const MIN_CANDIDATE_TURNS = 2;

interface TranscriptTurn {
  speaker: 'INTERVIEWER' | 'CANDIDATE';
  content: string;
}

// One segment = one question, its probes, and every candidate turn in
// between — "one segment, one score" (backend.md). A new segment starts
// only on an interviewer turn carrying the marker phrase; ordinary probes
// (interviewer turns without the marker) stay inside the current segment.
function segmentTranscript(turns: TranscriptTurn[]): TranscriptTurn[][] {
  const segments: TranscriptTurn[][] = [];
  for (const turn of turns) {
    const opensNewSegment = turn.speaker === 'INTERVIEWER' && QUESTION_MARKER.test(turn.content);
    if (opensNewSegment || segments.length === 0) {
      segments.push([]);
    }
    segments[segments.length - 1].push(turn);
  }
  return segments;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCORING_PROVIDER) private readonly scoringProvider: ScoringProvider,
  ) {}

  async generate(interviewId: string): Promise<FeedbackDto> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        feedback: { include: { answers: true } },
        messages: { orderBy: { sequence: 'asc' } },
        questions: { include: { question: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!interview) {
      throw new InterviewNotFoundException();
    }

    // Idempotent: return the cached report rather than re-billing the LLM
    // (backend.md: "if Feedback already exists, return it rather than
    // re-billing the LLM"). Checked BEFORE any status/length validation, so
    // this also short-circuits gate:8's "calling POST /feedback twice makes
    // exactly one outbound LLM request" test.
    if (interview.feedback) {
      return toFeedbackDto(interview.feedback);
    }

    if (interview.status !== 'COMPLETED') {
      throw new InterviewNotCompletedException();
    }

    const candidateTurnCount = interview.messages.filter((m) => m.speaker === 'CANDIDATE').length;
    if (candidateTurnCount < MIN_CANDIDATE_TURNS) {
      throw new TranscriptTooShortException();
    }

    const turns: TranscriptTurn[] = interview.messages.map((m) => ({
      speaker: m.speaker,
      content: m.content,
    }));
    const segments = segmentTranscript(turns);
    const orderedQuestions = interview.questions.map((iq) => iq.question.text);

    const scoringSegments: ScoringSegment[] = segments.map((segment, index) => ({
      questionIndex: index,
      question: orderedQuestions[index] ?? segment[0]?.content ?? `Question ${index + 1}`,
      turns: segment,
    }));

    let output: Awaited<ReturnType<ScoringProvider['score']>>;
    try {
      output = await this.scoringProvider.score({
        role: interview.role,
        seniority: interview.seniority,
        segments: scoringSegments,
      });
    } catch {
      // Persist nothing on failure: backend.md, "Two malformed responses
      // produce a 502 ScoringFailed and persist no Feedback row. A
      // half-written report is worse than none."
      throw new ScoringFailedException();
    }

    // overallScore is computed here in TypeScript, never asked of the model
    // (backend.md: "Models are bad at arithmetic and you want this number
    // to be trustworthy").
    const overallScore =
      output.result.answers.reduce((sum, a) => sum + a.score, 0) / output.result.answers.length;

    const created = await this.prisma.feedback.create({
      data: {
        interviewId: interview.id,
        overallScore,
        strengths: output.result.strengths,
        model: output.modelName,
        rawResponse: output.rawResponse,
        answers: {
          create: output.result.answers.map((answer) => ({
            questionIndex: answer.questionIndex,
            // The model's own echo of the question is trusted only as a
            // fallback: a weaker model can paraphrase it instead of
            // copying it verbatim (observed in manual testing with a
            // small free model), and we already know the real text
            // authoritatively from scoringSegments — no reason to let the
            // model's phrasing win.
            question: scoringSegments[answer.questionIndex]?.question ?? answer.question,
            answerSummary: answer.answerSummary,
            hasSituation: answer.hasSituation,
            hasTask: answer.hasTask,
            hasAction: answer.hasAction,
            hasResult: answer.hasResult,
            score: answer.score,
            improvement: answer.improvement,
          })),
        },
      },
      include: { answers: true },
    });

    await this.prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'SCORED' },
    });

    return toFeedbackDto(created);
  }
}
