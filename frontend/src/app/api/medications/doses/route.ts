import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MedicationDoseStatus, TimelineEventType } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";

const doseSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(MedicationDoseStatus),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = doseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid dose update." }, { status: 400 });
  }

  const existing = await prisma.medicationDose.findFirst({
    where: { id: parsed.data.id, medication: { userId: user.id } },
    include: { medication: true },
  });
  if (!existing) return NextResponse.json({ error: "Dose not found." }, { status: 404 });

  const now = new Date();
  const dose = await prisma.medicationDose.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      takenAt: parsed.data.status === MedicationDoseStatus.TAKEN ? now : null,
      skippedAt: parsed.data.status === MedicationDoseStatus.SKIPPED ? now : null,
      note: parsed.data.note || null,
    },
    include: { medication: true },
  });

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: dose.medication.babyProfileId,
      type: TimelineEventType.NOTE,
      title: dose.status === MedicationDoseStatus.TAKEN ? "تم أخذ جرعة" : "تحديث جرعة دواء",
      summary: `${dose.medication.name} - ${dose.medication.dosage}`,
      metadata: { medicationId: dose.medicationId, doseId: dose.id, status: dose.status },
    }),
    writeAuditLog({
      userId: user.id,
      action: "medication_dose.updated",
      entityType: "MedicationDose",
      entityId: dose.id,
      request,
      metadata: { status: dose.status },
    }),
  ]);

  return NextResponse.json({ dose });
}
