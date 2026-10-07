import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

const notificationSchema = z.object({
  title: z.string().trim().min(2).max(160),
  message: z.string().trim().min(2).max(800),
  channel: z.nativeEnum(NotificationChannel).default(NotificationChannel.APP),
  scheduledFor: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  read: z.boolean().optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: scopedBabyWhere(user.id, (await getActiveBabyProfile(user.id))?.id),
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = notificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid notification." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      title: parsed.data.title,
      message: parsed.data.message,
      channel: parsed.data.channel,
      scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
      status: parsed.data.scheduledFor ? NotificationStatus.SCHEDULED : NotificationStatus.DRAFT,
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "notification.created",
    entityType: "Notification",
    entityId: notification.id,
    request,
  });

  return NextResponse.json({ notification });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid notification update." }, { status: 400 });
  }

  const existing = await prisma.notification.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Notification not found." }, { status: 404 });

  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: {
      readAt: parsed.data.read ? new Date() : undefined,
      status: parsed.data.status,
    },
  });

  return NextResponse.json({ notification });
}
