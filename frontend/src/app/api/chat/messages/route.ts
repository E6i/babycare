import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveBabyProfile } from "@/lib/active-baby";

const querySchema = z.object({
  conversationId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parse = querySchema.safeParse({
    conversationId: request.nextUrl.searchParams.get("conversationId") ?? "",
  });
  if (!parse.success) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const profile = await getActiveBabyProfile(user.id);
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parse.data.conversationId,
      userId: user.id,
      babyProfileId: profile?.id ?? null,
    },
    select: {
      id: true,
      title: true,
      babyProfileId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          predictedClass: true,
          confidence: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json(
    { conversation },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
