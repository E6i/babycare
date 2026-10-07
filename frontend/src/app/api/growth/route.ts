import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TimelineEventType } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const growthSchema = z.object({
  weightKg: z.number().min(0).max(80).optional().nullable(),
  heightCm: z.number().min(0).max(180).optional().nullable(),
  headCircumferenceCm: z.number().min(0).max(80).optional().nullable(),
  recordedAt: z.string().datetime().optional(),
  note: z.string().trim().max(800).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const growthRecords = await prisma.growthRecord.findMany({
    where: scopedBabyWhere(user.id, (await getActiveBabyProfile(user.id))?.id),
    orderBy: { recordedAt: "desc" },
    take: 40,
  });

  return NextResponse.json({ growthRecords });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = growthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid growth record." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const recordedAt = parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : new Date();

  const growthRecord = await prisma.growthRecord.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      weightKg: parsed.data.weightKg ?? null,
      heightCm: parsed.data.heightCm ?? null,
      headCircumferenceCm: parsed.data.headCircumferenceCm ?? null,
      recordedAt,
      note: parsed.data.note || null,
    },
  });

  if (profile?.id) {
    await prisma.babyProfile.update({
      where: { id: profile.id },
      data: {
        weightKg: parsed.data.weightKg ?? undefined,
        heightCm: parsed.data.heightCm ?? undefined,
        headCircumferenceCm: parsed.data.headCircumferenceCm ?? undefined,
      },
    });
  }

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.NOTE,
      title: "تحديث النمو",
      summary: `تم تسجيل قياسات النمو: ${parsed.data.weightKg ? `${parsed.data.weightKg} كجم` : ""} ${parsed.data.heightCm ? `${parsed.data.heightCm} سم` : ""}`.trim(),
      metadata: { growthRecordId: growthRecord.id },
    }),
    writeAuditLog({
      userId: user.id,
      action: "growth_record.created",
      entityType: "GrowthRecord",
      entityId: growthRecord.id,
      request,
    }),
  ]);

  return NextResponse.json({ growthRecord });
}
