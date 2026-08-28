// Builds the Anam persona config from the candidate's setup choices. See
// backend.md, "PersonaService".
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Interview, InterviewQuestion, Question } from '@prisma/client';
import type { PersonaConfig } from '../anam/anam.types';
import { PROMPT_V1 } from './prompts';

export type InterviewWithQuestions = Interview & {
  questions: (InterviewQuestion & { question: Question })[];
};

@Injectable()
export class PersonaService {
  constructor(private readonly configService: ConfigService) {}

  build(interview: InterviewWithQuestions): PersonaConfig {
    // The question list interpolated into the prompt must be in the exact
    // order QuestionBankService persisted (backend.md, "Interpolate...the
    // exact question list selected by QuestionBankService, in order").
    const orderedQuestions = [...interview.questions]
      .sort((a, b) => a.position - b.position)
      .map((iq) => iq.question.text);

    const systemPrompt = PROMPT_V1.render({
      interviewerName: interview.interviewerName,
      role: interview.role,
      seniority: interview.seniority,
      questions: orderedQuestions,
      timeLimitSecs: interview.timeLimitSecs,
    });

    return {
      name: interview.interviewerName,
      avatarId: this.configService.get<string>('ANAM_AVATAR_ID')!,
      voiceId: this.configService.get<string>('ANAM_VOICE_ID')!,
      llmId: this.configService.get<string>('ANAM_LLM_ID')!,
      avatarModel: this.configService.get<string>('ANAM_AVATAR_MODEL')!,
      systemPrompt,
      // Inside personaConfig, not sessionOptions — see README.md, confirmed
      // against Anam's docs, and backend.md's explicit warning that getting
      // this wrong silently ignores the time limit.
      maxSessionLengthSeconds: interview.timeLimitSecs,
      skipGreeting: false,
    };
  }
}
