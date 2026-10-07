import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TimelineEventType } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const medicationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(800).optional().nullable(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional().nullable(),
  doses: z.array(z.string().datetime()).max(14).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const medications = await prisma.medication.findMany({
    where: scopedBabyWhere(user.id, (await getActiveBabyProfile(user.id))?.id),
    include: {
      doses: {
        orderBy: { scheduledFor: "asc" },
        take: 12,
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 40,
  });

  return NextResponse.json({ medications });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = medicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid medication." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const medication = await prisma.medication.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      name: parsed.data.name,
      dosage: parsed.data.dosage,
      frequency: parsed.data.frequency,
      instructions: parsed.data.instructions || null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : new Date(),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      doses: parsed.data.doses?.length
        ? {
            create: parsed.data.doses.map((scheduledFor) => ({ scheduledFor: new Date(scheduledFor) })),
          }
        : undefined,
    },
    include: { doses: true },
  });

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.NOTE,
      title: "إضافة دواء",
      summary: `${medication.name} - ${medication.dosage} - ${medication.frequency}`,
      metadata: { medicationId: medication.id },
    }),
    writeAuditLog({
      userId: user.id,
      action: "medication.created",
      entityType: "Medication",
      entityId: medication.id,
      request,
    }),
  ]);

  return NextResponse.json({ medication });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid medication update." }, { status: 400 });
  }

  const existing = await prisma.medication.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Medication not found." }, { status: 404 });

  const medication = await prisma.medication.update({
    where: { id: existing.id },
    data: { active: parsed.data.active },
    include: { doses: true },
  });

  await writeAuditLog({
    userId: user.id,
    action: "medication.updated",
    entityType: "Medication",
    entityId: medication.id,
    request,
    metadata: { active: medication.active },
  });

  return NextResponse.json({ medication });
}
