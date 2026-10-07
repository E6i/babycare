import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const shareSchema = z.object({
  reportId: z.string().min(1),
  expiresInHours: z.number().min(1).max(24 * 30).default(72),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid share request." }, { status: 400 });
  }

  const report = await prisma.doctorReport.findFirst({
    where: { id: parsed.data.reportId, userId: user.id },
  });
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000);
  const shareLink = await prisma.shareLink.create({
    data: {
      userId: user.id,
      doctorReportId: report.id,
      token,
      expiresAt,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "share_link.created",
    entityType: "ShareLink",
    entityId: shareLink.id,
    request,
    metadata: { reportId: report.id, expiresAt: expiresAt.toISOString() },
  });

  const origin = request.headers.get("origin") || new URL(request.url).origin;
  return NextResponse.json({ shareLink, url: `${origin}/share/${token}` });
}
