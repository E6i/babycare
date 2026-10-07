import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTimelineEvent } from "@/lib/timeline";
import { SeverityLevel, TimelineEventType } from "@prisma/client";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const noteSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(2).max(500),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "12")));
  const profile = await getActiveBabyProfile(user.id);
  const events = await prisma.timelineEvent.findMany({
    where: scopedBabyWhere(user.id, profile?.id),
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid note." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const event = await createTimelineEvent({
    userId: user.id,
    babyProfileId: profile?.id ?? null,
    type: TimelineEventType.NOTE,
    title: parsed.data.title,
    summary: parsed.data.summary,
    severity: SeverityLevel.LOW,
  });

  return NextResponse.json({ event }, { status: 201 });
}
