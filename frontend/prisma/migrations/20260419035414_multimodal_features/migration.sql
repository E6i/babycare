-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('PROFILE_UPDATED', 'CRY_ANALYSIS', 'TRIAGE_ASSESSMENT', 'CHAT_GUIDANCE', 'REMINDER_CREATED', 'REMINDER_SENT', 'NOTE');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('HOME_CARE', 'WATCH_CLOSELY', 'PEDIATRICIAN_SOON', 'URGENT_NOW');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('APP', 'WHATSAPP');

-- CreateTable
CREATE TABLE "BabyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "babyName" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "weightKg" DOUBLE PRECISION,
    "feedingStyle" TEXT,
    "medicalNotes" TEXT,
    "emergencyPhone" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BabyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "babyProfileId" TEXT,
    "type" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "SeverityLevel" NOT NULL DEFAULT 'LOW',
    "triage" "TriageLevel",
    "riskScore" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "babyProfileId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'APP',
    "phoneNumber" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BabyProfile_userId_key" ON "BabyProfile"("userId");

-- CreateIndex
CREATE INDEX "TimelineEvent_userId_createdAt_idx" ON "TimelineEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_babyProfileId_createdAt_idx" ON "TimelineEvent"("babyProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_userId_scheduledFor_idx" ON "Reminder"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Reminder_status_scheduledFor_idx" ON "Reminder"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "BabyProfile" ADD CONSTRAINT "BabyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_babyProfileId_fkey" FOREIGN KEY ("babyProfileId") REFERENCES "BabyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_babyProfileId_fkey" FOREIGN KEY ("babyProfileId") REFERENCES "BabyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
