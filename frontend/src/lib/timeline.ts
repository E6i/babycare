import { Prisma, TimelineEventType, SeverityLevel, TriageLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TimelineInput = {
  userId: string;
  babyProfileId?: string | null;
  type: TimelineEventType;
  title: string;
  summary: string;
  severity?: SeverityLevel;
  triage?: TriageLevel | null;
  riskScore?: number | null;
  metadata?: Prisma.InputJsonValue;
};

export async function createTimelineEvent(input: TimelineInput) {
  return prisma.timelineEvent.create({
    data: {
      userId: input.userId,
      babyProfileId: input.babyProfileId ?? null,
      type: input.type,
      title: input.title,
      summary: input.summary,
      severity: input.severity ?? SeverityLevel.LOW,
      triage: input.triage ?? null,
      riskScore: input.riskScore ?? null,
      metadata: input.metadata,
    },
  });
}
