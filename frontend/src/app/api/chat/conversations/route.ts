import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveBabyProfile } from "@/lib/active-baby";

const DELETE_PARAM = "conversationId";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const conversations = await prisma.conversation.findMany({
    where: {
      userId: user.id,
      babyProfileId: profile?.id ?? null,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      babyProfileId: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true },
      },
    },
  });

  return NextResponse.json(
    { conversations, activeBabyProfileId: profile?.id ?? null, activeBabyName: profile?.babyName ?? null },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = request.nextUrl.searchParams.get(DELETE_PARAM);
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId: user.id,
      babyProfileId: profile?.id ?? null,
    },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await prisma.conversation.delete({ where: { id: conversation.id } });

  return NextResponse.json(
    { ok: true, deletedId: conversation.id },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
