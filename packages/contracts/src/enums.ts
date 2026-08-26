import { z } from 'zod';

// All enum values are SCREAMING_SNAKE_CASE, and the same string is used in
// the database, on the wire, and in client state. No casing translation
// layer exists anywhere in the codebase. See shared.md, "Enum convention".

export const CompetencySchema = z.enum([
  'OWNERSHIP',
  'CONFLICT',
  'FAILURE',
  'AMBIGUITY',
  'INFLUENCE',
  'DELIVERY',
]);
export type Competency = z.infer<typeof CompetencySchema>;

export const COMPETENCY_LABELS: Record<Competency, string> = {
  OWNERSHIP: 'Ownership',
  CONFLICT: 'Handling conflict',
  FAILURE: 'Learning from failure',
  AMBIGUITY: 'Working with ambiguity',
  INFLUENCE: 'Influence without authority',
  DELIVERY: 'Delivering under pressure',
};

export const SenioritySchema = z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF']);
export type Seniority = z.infer<typeof SenioritySchema>;

export const SENIORITY_LABELS: Record<Seniority, string> = {
  JUNIOR: 'Junior',
  MID: 'Mid',
  SENIOR: 'Senior',
  STAFF: 'Staff',
};

export const InterviewStatusSchema = z.enum([
  'CREATED',
  'LIVE',
  'COMPLETED',
  'SCORED',
  'ABANDONED',
]);
export type InterviewStatus = z.infer<typeof InterviewStatusSchema>;

export const SpeakerSchema = z.enum(['INTERVIEWER', 'CANDIDATE']);
export type Speaker = z.infer<typeof SpeakerSchema>;
