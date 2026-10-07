ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeBabyProfileId" TEXT;

ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
DROP INDEX IF EXISTS "BabyProfile_userId_key";

DO $$
BEGIN
  ALTER TYPE "ReminderChannel" ADD VALUE IF NOT EXISTS 'EMAIL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "User" AS u
SET "activeBabyProfileId" = bp.id
FROM "BabyProfile" AS bp
WHERE bp."userId" = u.id
  AND u."activeBabyProfileId" IS NULL;
