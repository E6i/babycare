import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReminderChannel, ReminderStatus, SeverityLevel, TimelineEventType } from "@prisma/client";
import { sendCareEmail } from "@/lib/email";
import { createTimelineEvent } from "@/lib/timeline";

type DeliveryResult = {
  ok: boolean;
  provider: string;
  mode: string;
  messageId?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dueReminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      status: ReminderStatus.SCHEDULED,
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: 10,
  });

  const results = [];
  for (const reminder of dueReminders) {
    let delivery: DeliveryResult;
    if (reminder.channel === ReminderChannel.EMAIL && reminder.phoneNumber) {
      delivery = await sendCareEmail({
        to: reminder.phoneNumber,
        subject: reminder.title,
        body: reminder.message,
      });
    } else if (reminder.channel === ReminderChannel.APP) {
      delivery = { ok: true, provider: "app" as const, mode: "stored" as const };
    } else {
      delivery = { ok: false, provider: "app" as const, mode: "failed" as const, error: "هذه القناة غير مفعلة." };
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

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: reminder.babyProfileId,
      type: TimelineEventType.REMINDER_SENT,
      title: delivery.ok ? "تم إرسال تذكير مستحق" : "فشل إرسال تذكير",
      summary: delivery.ok
        ? `${updated.title} تم إرساله بنجاح.`
        : `${updated.title} تعذر إرساله: ${delivery.error || "سبب غير معروف"}`,
      severity: delivery.ok ? SeverityLevel.LOW : SeverityLevel.MEDIUM,
      metadata: {
        reminderId: reminder.id,
        provider: delivery.provider,
        providerMessageId: delivery.messageId,
        error: delivery.error,
      },
    });

    results.push({ reminder: updated, delivery });
  }

  return NextResponse.json({ results, processed: results.length });
}
