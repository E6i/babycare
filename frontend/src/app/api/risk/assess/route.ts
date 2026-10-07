import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { assessRisk } from "@/lib/risk-engine";
import { monthsBetween } from "@/lib/baby-utils";
import { createTimelineEvent } from "@/lib/timeline";
import { TimelineEventType } from "@prisma/client";
import { getActiveBabyProfile } from "@/lib/active-baby";

const bodySchema = z.object({
  message: z.string().trim().min(2).max(1000),
  temperatureC: z.number().min(30).max(45).nullable().optional(),
  poorFeeding: z.boolean().optional(),
  sleepIssue: z.boolean().optional(),
  wetDiapers24h: z.number().min(0).max(30).nullable().optional(),
  cryingHours: z.number().min(0).max(24).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid triage input." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);

  const assessment = assessRisk({
    ...parsed.data,
    babyAgeMonths: monthsBetween(profile?.birthDate),
  });

  const event = await createTimelineEvent({
    userId: user.id,
    babyProfileId: profile?.id ?? null,
    type: TimelineEventType.TRIAGE_ASSESSMENT,
    title: "تقييم فرز سريع",
    summary: `${assessment.headline} - ${parsed.data.message}`,
    severity: assessment.severity,
    triage: assessment.triage,
    riskScore: assessment.riskScore,
    metadata: {
      input: parsed.data,
      assessment,
      babyName: profile?.babyName,
    },
  });

  return NextResponse.json({ assessment, event });
}
