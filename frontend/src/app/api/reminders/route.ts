import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTimelineEvent } from "@/lib/timeline";
import { ReminderChannel, ReminderStatus, SeverityLevel, TimelineEventType } from "@prisma/client";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";
import { sendCareEmail } from "@/lib/email";

const reminderSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(500),
  channel: z.nativeEnum(ReminderChannel).default(ReminderChannel.APP),
  email: z.string().trim().email().optional().nullable(),
  scheduledFor: z.string().datetime(),
  sendNow: z.boolean().optional(),
});

type DeliveryResult = {
  ok: boolean;
  provider: string;
  mode: string;
  messageId?: string;
  error?: string;
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const reminders = await prisma.reminder.findMany({
    where: scopedBabyWhere(user.id, profile?.id),
    orderBy: { scheduledFor: "asc" },
    take: 20,
  });

  return NextResponse.json({ reminders });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reminderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reminder." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);

  const email = parsed.data.email || process.env.PARENT_NOTIFICATION_EMAIL || user.email;
  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      title: parsed.data.title,
      message: parsed.data.message,
      channel: parsed.data.channel,
      phoneNumber: parsed.data.channel === ReminderChannel.EMAIL ? email : null,
      scheduledFor: new Date(parsed.data.scheduledFor),
      status: parsed.data.sendNow ? ReminderStatus.DRAFT : ReminderStatus.SCHEDULED,
    },
  });

  await createTimelineEvent({
    userId: user.id,
    babyProfileId: profile?.id ?? null,
    type: TimelineEventType.REMINDER_CREATED,
    title: "إنشاء تذكير جديد",
    summary: `${parsed.data.title} - ${parsed.data.channel === ReminderChannel.EMAIL ? "بريد إلكتروني" : "داخل التطبيق"}`,
    severity: SeverityLevel.LOW,
    metadata: {
      reminderId: reminder.id,
      channel: parsed.data.channel,
      scheduledFor: parsed.data.scheduledFor,
    },
  });

  let delivery: DeliveryResult | null = null;

  if (parsed.data.sendNow) {
    if (parsed.data.channel === ReminderChannel.EMAIL) {
      delivery = await sendCareEmail({
        to: email,
        subject: parsed.data.title,
        body: parsed.data.message,
      });
    } else if (parsed.data.channel === ReminderChannel.APP) {
      delivery = { ok: true, provider: "app" as const, mode: "stored" as const };
    } else {
      delivery = {
        ok: false,
        provider: "app" as const,
        mode: "failed" as const,
        error: "هذه القناة غير مفعلة.",
      };
    }

    const updated = await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status: delivery.ok ? ReminderStatus.SENT : ReminderStatus.FAILED,
        provider: delivery.provider,
        providerMessageId: delivery.messageId,
        errorMessage: delivery.error,
        lastAttemptAt: new Date(),
      },
    });

    if (delivery.ok) {
      await createTimelineEvent({
        userId: user.id,
        babyProfileId: profile?.id ?? null,
        type: TimelineEventType.REMINDER_SENT,
        title: "تم إرسال التذكير",
        summary: `${updated.title} تم حفظه/إرساله ${updated.channel === ReminderChannel.EMAIL ? "بالبريد الإلكتروني" : "داخل التطبيق"}.`,
        severity: SeverityLevel.LOW,
        metadata: {
          reminderId: updated.id,
          provider: delivery.provider,
          providerMessageId: delivery.messageId,
        },
      });
    }

    return NextResponse.json({ reminder: updated, delivery });
  }

  return NextResponse.json({ reminder });
}
