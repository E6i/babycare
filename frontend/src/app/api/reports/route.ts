import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TimelineEventType } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createTimelineEvent } from "@/lib/timeline";
import { doctorReportText, latestAssessment } from "@/lib/care-report";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const reportSchema = z.object({
  title: z.string().trim().max(180).optional(),
  summary: z.string().trim().max(500).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reports = await prisma.doctorReport.findMany({
    where: scopedBabyWhere(user.id, (await getActiveBabyProfile(user.id))?.id),
    include: {
      shareLinks: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid report." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const [timeline, reminders] = await Promise.all([
    prisma.timelineEvent.findMany({ where: scopedBabyWhere(user.id, profile?.id), orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.reminder.findMany({ where: scopedBabyWhere(user.id, profile?.id), orderBy: { scheduledFor: "asc" }, take: 10 }),
  ]);

  const assessment = latestAssessment(timeline);
  const content = doctorReportText({ profile, timeline, reminders, assessment });
  const report = await prisma.doctorReport.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      title: parsed.data.title || `تقرير ${profile?.babyName || "الطفل"}`,
      summary: parsed.data.summary || assessment?.headline || "تقرير حالة طفل من SuperMamy",
      content,
      riskScore: assessment?.riskScore ?? null,
      triage: assessment?.triage ?? null,
      severity: assessment?.severity ?? null,
    },
  });

  await Promise.all([
    createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.NOTE,
      title: "إنشاء تقرير طبي",
      summary: report.summary,
      severity: assessment?.severity,
      triage: assessment?.triage,
      riskScore: assessment?.riskScore,
      metadata: { doctorReportId: report.id },
    }),
    writeAuditLog({
      userId: user.id,
      action: "doctor_report.created",
      entityType: "DoctorReport",
      entityId: report.id,
      request,
    }),
  ]);

  return NextResponse.json({ report });
}
