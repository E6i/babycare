import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CareLogType, Prisma, SeverityLevel, TimelineEventType } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const careLogSchema = z.object({
  type: z.nativeEnum(CareLogType),
  value: z.number().min(0).max(1000).optional().nullable(),
  unit: z.string().trim().max(24).optional().nullable(),
  note: z.string().trim().max(800).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const TYPE_LABELS: Record<CareLogType, string> = {
  FEEDING: "رضاعة",
  SLEEP: "نوم",
  TEMPERATURE: "حرارة",
  DIAPER: "حفاضات",
  CRYING: "بكاء",
  MEDICATION: "دواء",
  VOMITING: "قيء",
  NOTE: "ملاحظة",
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const take = Math.min(Number(searchParams.get("take") || 40), 100);
  const profile = await getActiveBabyProfile(user.id);
  const careLogs = await prisma.careLog.findMany({
    where: scopedBabyWhere(user.id, profile?.id),
    orderBy: { occurredAt: "desc" },
    take,
  });

  return NextResponse.json({ careLogs });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = careLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid care log." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const careLog = await prisma.careLog.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: parsed.data.type,
      value: parsed.data.value ?? null,
      unit: parsed.data.unit || null,
      note: parsed.data.note || null,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.NOTE,
      title: `تسجيل ${TYPE_LABELS[parsed.data.type]}`,
      summary: parsed.data.note || `${TYPE_LABELS[parsed.data.type]} محفوظ في سجل اليوم.`,
      severity: parsed.data.type === CareLogType.TEMPERATURE && (parsed.data.value ?? 0) >= 38 ? SeverityLevel.MEDIUM : SeverityLevel.LOW,
      metadata: {
        careLogId: careLog.id,
        type: parsed.data.type,
        value: parsed.data.value ?? null,
        unit: parsed.data.unit ?? null,
      },
    }),
    writeAuditLog({
      userId: user.id,
      action: "care_log.created",
      entityType: "CareLog",
      entityId: careLog.id,
      request,
      metadata: { type: parsed.data.type },
    }),
  ]);

  return NextResponse.json({ careLog });
}
