ALTER TABLE "Conversation" ADD COLUMN "babyProfileId" TEXT;

UPDATE "Conversation" AS c
SET "babyProfileId" = u."activeBabyProfileId"
FROM "User" AS u
WHERE c."userId" = u."id"
  AND c."babyProfileId" IS NULL
  AND u."activeBabyProfileId" IS NOT NULL;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_babyProfileId_fkey"
FOREIGN KEY ("babyProfileId") REFERENCES "BabyProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Conversation_babyProfileId_updatedAt_idx"
ON "Conversation"("babyProfileId", "updatedAt");
