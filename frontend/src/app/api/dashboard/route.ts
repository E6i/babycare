import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFamilyProfiles, scopedBabyWhere } from "@/lib/active-baby";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const family = await getFamilyProfiles(user.id);
  const activeBabyId = family.activeProfile?.id ?? null;
  const activeConversationWhere = { userId: user.id, babyProfileId: activeBabyId };
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [timeline, timeline24h, reminders, conversationCount, conversationsWithCounts] = await Promise.all([
    prisma.timelineEvent.findMany({
      where: scopedBabyWhere(user.id, activeBabyId),
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.timelineEvent.findMany({
      where: {
        ...scopedBabyWhere(user.id, activeBabyId),
        createdAt: { gte: since24h },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.reminder.findMany({
      where: scopedBabyWhere(user.id, activeBabyId),
      orderBy: { scheduledFor: "asc" },
      take: 8,
    }),
    prisma.conversation.count({ where: activeConversationWhere }),
    prisma.conversation.findMany({
      where: activeConversationWhere,
      select: {
        _count: {
          select: { messages: true },
        },
      },
    }),
  ]);

  const messageCount = conversationsWithCounts.reduce((total, item) => total + item._count.messages, 0);

  const latestRiskEvent = timeline.find((event) => event.riskScore !== null);

  return NextResponse.json({
    user: family.user,
    children: family.profiles,
    profile: family.activeProfile,
    timeline,
    timeline24h,
    reminders,
    stats: {
      conversationCount,
      messageCount,
      timelineCount: timeline.length,
      latestRiskScore: latestRiskEvent?.riskScore ?? null,
      latestTriage: latestRiskEvent?.triage ?? null,
    },
  });
}
