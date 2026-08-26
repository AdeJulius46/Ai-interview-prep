import { z } from 'zod';
import { SpeakerSchema } from './enums.js';

export const TranscriptLineSchema = z.object({
  speaker: SpeakerSchema,
  content: z.string().min(1),
  spokenAt: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const AppendMessagesInputSchema = z.object({
  messages: z.array(TranscriptLineSchema).min(1),
});
export type AppendMessagesInput = z.infer<typeof AppendMessagesInputSchema>;

export const AppendMessagesResultSchema = z.object({
  accepted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type AppendMessagesResult = z.infer<typeof AppendMessagesResultSchema>;
