// ScoringProvider: the LLM is swappable behind this interface (backend.md,
// "FeedbackService > Scoring call"). Only AnthropicProvider implements it
// today; a test double or a different model provider is a drop-in.
import type { ScoringResult, Seniority } from '@coach/contracts';

export interface ScoringSegment {
  questionIndex: number;
  question: string;
  // The segment's dialogue after the question was asked — candidate turns
  // and any interviewer probes, in order — so the model has the same
  // context a human grader would (backend.md: "One segment, one score").
  turns: { speaker: 'INTERVIEWER' | 'CANDIDATE'; content: string }[];
}

export interface ScoringInput {
  role: string;
  seniority: Seniority;
  segments: ScoringSegment[];
}

export interface ScoringOutput {
  result: ScoringResult;
  // The raw text the model returned (post any internal retry), kept for
  // Feedback.rawResponse — backend.md: "kept for debugging prompt
  // regressions".
  rawResponse: string;
  // e.g. "claude-sonnet-4-6" — persisted on Feedback.model.
  modelName: string;
}

export interface ScoringProvider {
  // Strict JSON only, temperature 0. Parses and validates against
  // ScoringResultSchema; retries once internally with the parse error
  // appended to the prompt on failure per backend.md, "Scoring call". Throws
  // after a second failure — the caller (FeedbackService) maps that to a 502
  // ScoringFailed and persists nothing.
  score(input: ScoringInput): Promise<ScoringOutput>;
}

export const SCORING_PROVIDER = Symbol('SCORING_PROVIDER');
