import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TimelineEventType, VaccinationStatus } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const vaccinationSchema = z.object({
  vaccineName: z.string().trim().min(2).max(160),
  dueDate: z.string().datetime(),
  completedAt: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(VaccinationStatus).optional(),
  notes: z.string().trim().max(800).optional().nullable(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(VaccinationStatus),
  completedAt: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(800).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vaccinationRecords = await prisma.vaccinationRecord.findMany({
    where: scopedBabyWhere(user.id, (await getActiveBabyProfile(user.id))?.id),
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 60,
  });

  return NextResponse.json({ vaccinationRecords });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = vaccinationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid vaccination." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const vaccinationRecord = await prisma.vaccinationRecord.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      vaccineName: parsed.data.vaccineName,
      dueDate: new Date(parsed.data.dueDate),
      completedAt: parsed.data.completedAt ? new Date(parsed.data.completedAt) : null,
      status: parsed.data.status || VaccinationStatus.DUE,
      notes: parsed.data.notes || null,
    },
  });

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.REMINDER_CREATED,
      title: "إضافة تطعيم",
      summary: `${vaccinationRecord.vaccineName} مجدول في ${vaccinationRecord.dueDate.toLocaleDateString("ar-EG")}.`,
      metadata: { vaccinationRecordId: vaccinationRecord.id },
    }),
    writeAuditLog({
      userId: user.id,
      action: "vaccination.created",
      entityType: "VaccinationRecord",
      entityId: vaccinationRecord.id,
      request,
    }),
  ]);

  return NextResponse.json({ vaccinationRecord });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid vaccination update." }, { status: 400 });
  }

  const existing = await prisma.vaccinationRecord.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Vaccination not found." }, { status: 404 });

  const vaccinationRecord = await prisma.vaccinationRecord.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      completedAt:
        parsed.data.status === VaccinationStatus.COMPLETED
          ? parsed.data.completedAt
            ? new Date(parsed.data.completedAt)
            : new Date()
          : null,
      notes: parsed.data.notes ?? undefined,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "vaccination.updated",
    entityType: "VaccinationRecord",
    entityId: vaccinationRecord.id,
    request,
    metadata: { status: vaccinationRecord.status },
  });

  return NextResponse.json({ vaccinationRecord });
}
