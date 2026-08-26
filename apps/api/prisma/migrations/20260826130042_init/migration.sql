-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'STAFF');

-- CreateEnum
CREATE TYPE "Competency" AS ENUM ('OWNERSHIP', 'CONFLICT', 'FAILURE', 'AMBIGUITY', 'INFLUENCE', 'DELIVERY');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'LIVE', 'COMPLETED', 'SCORED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('INTERVIEWER', 'CANDIDATE');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" "InterviewStatus" NOT NULL DEFAULT 'CREATED',
    "role" TEXT NOT NULL,
    "seniority" "Seniority" NOT NULL,
    "competencies" "Competency"[],
    "questionCount" INTEGER NOT NULL DEFAULT 3,
    "timeLimitSecs" INTEGER NOT NULL DEFAULT 180,
    "interviewerName" TEXT NOT NULL DEFAULT 'John',
    "anamSessionId" TEXT,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "competency" "Competency" NOT NULL,
    "seniority" "Seniority"[],
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "content" TEXT NOT NULL,
    "spokenAt" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "strengths" TEXT[],
    "model" TEXT NOT NULL,
    "rawResponse" JSONB NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerFeedback" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answerSummary" TEXT NOT NULL,
    "hasSituation" BOOLEAN NOT NULL,
    "hasTask" BOOLEAN NOT NULL,
    "hasAction" BOOLEAN NOT NULL,
    "hasResult" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "improvement" TEXT NOT NULL,

    CONSTRAINT "AnswerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Interview_anamSessionId_key" ON "Interview"("anamSessionId");

-- CreateIndex
CREATE INDEX "Interview_createdAt_idx" ON "Interview"("createdAt");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "Question_competency_idx" ON "Question"("competency");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_interviewId_position_key" ON "InterviewQuestion"("interviewId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_interviewId_questionId_key" ON "InterviewQuestion"("interviewId", "questionId");

-- CreateIndex
CREATE INDEX "Message_interviewId_spokenAt_idx" ON "Message"("interviewId", "spokenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_interviewId_sequence_key" ON "Message"("interviewId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_interviewId_key" ON "Feedback"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerFeedback_feedbackId_questionIndex_key" ON "AnswerFeedback"("feedbackId", "questionIndex");

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
