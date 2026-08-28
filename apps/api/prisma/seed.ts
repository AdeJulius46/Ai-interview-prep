// Question bank seed. See backend.md, "QuestionBankService": "at least 6
// questions per competency, tagged with the seniority levels they suit".
//
// Each competency gets 8 questions: 6 tagged with SENIOR (a mix of
// ALL_LEVELS, MID_UP, and SENIOR_UP) and 2 tagged JUNIOR_MID only, so a
// senior-only phrased question ("... with a director") is never served to a
// junior candidate, and the filtered pool for any single seniority level
// still comfortably clears the default questionCount of 3-5.
import { PrismaClient, Competency, Seniority } from '@prisma/client';

export const ALL_LEVELS: Seniority[] = ['JUNIOR', 'MID', 'SENIOR', 'STAFF'];
export const MID_UP: Seniority[] = ['MID', 'SENIOR', 'STAFF'];
export const SENIOR_UP: Seniority[] = ['SENIOR', 'STAFF'];
export const JUNIOR_MID: Seniority[] = ['JUNIOR', 'MID'];

export interface SeedQuestion {
  competency: Competency;
  seniority: Seniority[];
  text: string;
}

function bank(competency: Competency, prompts: { seniority: Seniority[]; text: string }[]): SeedQuestion[] {
  return prompts.map((p) => ({ competency, ...p }));
}

export const SEED_QUESTIONS: SeedQuestion[] = [
  ...bank('OWNERSHIP', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you took ownership of a project outside your usual role.' },
    { seniority: ALL_LEVELS, text: 'Describe a situation where you noticed a problem nobody had asked you to fix, and you fixed it anyway.' },
    { seniority: ALL_LEVELS, text: 'Tell me about a time you owned a mistake in front of your team.' },
    { seniority: MID_UP, text: 'Describe a time you drove a project to completion despite unclear ownership across teams.' },
    { seniority: MID_UP, text: 'Tell me about a time you were the last line of defence before something shipped broken.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time you took ownership of an outcome that spanned multiple teams you did not manage.' },
    { seniority: JUNIOR_MID, text: 'Describe a time you volunteered for a task nobody else wanted.' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you followed through on a commitment even after it got harder than expected.' },
  ]),
  ...bank('CONFLICT', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you disagreed with a teammate about the right technical approach.' },
    { seniority: ALL_LEVELS, text: 'Describe a conflict with a coworker and how you resolved it.' },
    { seniority: ALL_LEVELS, text: 'Tell me about a time you had to give someone feedback they did not want to hear.' },
    { seniority: MID_UP, text: 'Describe a time you had to push back on a product decision you thought was wrong.' },
    { seniority: MID_UP, text: 'Tell me about a disagreement with a peer that escalated before it was resolved.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time you disagreed with a director.' },
    { seniority: JUNIOR_MID, text: 'Describe a time a teammate reviewed your work harshly. How did you respond?' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you had to say no to a request from someone senior to you.' },
  ]),
  ...bank('FAILURE', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you failed at something important.' },
    { seniority: ALL_LEVELS, text: 'Describe a project that did not go as planned. What did you learn?' },
    { seniority: ALL_LEVELS, text: 'Tell me about a mistake that taught you something you still use today.' },
    { seniority: MID_UP, text: 'Describe a time you shipped something that caused an incident.' },
    { seniority: MID_UP, text: 'Tell me about a time your estimate was badly wrong and what you changed afterward.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time a strategic bet you championed failed, and how you communicated that upward.' },
    { seniority: JUNIOR_MID, text: 'Describe a time you asked for help too late. What would you do differently?' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you misunderstood requirements and built the wrong thing.' },
  ]),
  ...bank('AMBIGUITY', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you had to make progress with incomplete information.' },
    { seniority: ALL_LEVELS, text: 'Describe a project where the requirements changed halfway through.' },
    { seniority: ALL_LEVELS, text: 'Tell me about a time you had to define the problem yourself before you could solve it.' },
    { seniority: MID_UP, text: 'Describe a time you had to choose a direction with no clear right answer and defend it.' },
    { seniority: MID_UP, text: 'Tell me about a time you scoped a project that had no existing precedent to follow.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time you set direction for a team facing conflicting signals from stakeholders.' },
    { seniority: JUNIOR_MID, text: 'Describe a time you were given a vague task and had to figure out what was actually being asked.' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you had to start work before all your questions were answered.' },
  ]),
  ...bank('INFLUENCE', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you convinced someone to change their mind.' },
    { seniority: ALL_LEVELS, text: 'Describe a time you got buy-in for an idea without formal authority.' },
    { seniority: ALL_LEVELS, text: 'Tell me about a time you had to persuade a skeptical stakeholder.' },
    { seniority: MID_UP, text: 'Describe a time you rallied a team around an approach they initially resisted.' },
    { seniority: MID_UP, text: 'Tell me about a time you influenced a roadmap decision you were not the owner of.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time you changed an executive\'s mind on a decision that mattered to your team.' },
    { seniority: JUNIOR_MID, text: 'Describe a time you had to convince a more experienced colleague to try your idea.' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you presented an idea and had to adapt it based on pushback.' },
  ]),
  ...bank('DELIVERY', [
    { seniority: ALL_LEVELS, text: 'Tell me about a time you delivered something under a tight deadline.' },
    { seniority: ALL_LEVELS, text: 'Describe a time you had to cut scope to hit a date.' },
    { seniority: ALL_LEVELS, text: 'Tell me about a time competing priorities put your delivery at risk.' },
    { seniority: MID_UP, text: 'Describe a time you managed a delivery risk that only became visible late.' },
    { seniority: MID_UP, text: 'Tell me about a time you kept a project on track after a key dependency slipped.' },
    { seniority: SENIOR_UP, text: 'Tell me about a time you had to renegotiate a commitment across multiple teams under pressure.' },
    { seniority: JUNIOR_MID, text: 'Describe a time you had to work extra hours to meet a deadline. What did you learn about pacing?' },
    { seniority: JUNIOR_MID, text: 'Tell me about a time you flagged early that a deadline was at risk.' },
  ]),
];

export async function seedQuestions(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.question.count();
  if (existing > 0) {
    console.log(`Question table already has ${existing} rows, skipping seed.`);
    return;
  }

  await prisma.question.createMany({
    data: SEED_QUESTIONS.map((q) => ({
      competency: q.competency,
      seniority: q.seniority,
      text: q.text,
    })),
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedQuestions(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
