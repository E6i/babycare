import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFamilyProfiles, scopedBabyWhere } from "@/lib/active-baby";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const family = await getFamilyProfiles(user.id);
  const activeBabyId = family.activeProfile?.id ?? null;

  const [careLogs, growthRecords, vaccinationRecords, medications, doctorReports, notifications, auditLogs] =
    await Promise.all([
      prisma.careLog.findMany({ where: scopedBabyWhere(user.id, activeBabyId), orderBy: { occurredAt: "desc" }, take: 40 }),
      prisma.growthRecord.findMany({ where: scopedBabyWhere(user.id, activeBabyId), orderBy: { recordedAt: "desc" }, take: 20 }),
      prisma.vaccinationRecord.findMany({ where: scopedBabyWhere(user.id, activeBabyId), orderBy: { dueDate: "asc" }, take: 40 }),
      prisma.medication.findMany({
        where: scopedBabyWhere(user.id, activeBabyId),
        include: { doses: { orderBy: { scheduledFor: "asc" }, take: 8 } },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        take: 30,
      }),
      prisma.doctorReport.findMany({
        where: scopedBabyWhere(user.id, activeBabyId),
        include: { shareLinks: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.findMany({ where: scopedBabyWhere(user.id, activeBabyId), orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

  return NextResponse.json({
    user,
    children: family.profiles,
    profile: family.activeProfile,
    careLogs,
    growthRecords,
    vaccinationRecords,
    medications,
    doctorReports,
    notifications,
    auditLogs,
  });
}
