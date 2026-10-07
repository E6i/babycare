import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeChatMessage, buildLocalFallbackReply } from "@/lib/chatbot-regex";
import { assessRisk } from "@/lib/risk-engine";
import { createTimelineEvent } from "@/lib/timeline";
import { buildConversationTitle } from "@/lib/chat-title";
import { formatCryClassLabel, getCryClassInfo } from "@/lib/cry-classification";
import { TimelineEventType } from "@prisma/client";
import { monthsBetween } from "@/lib/baby-utils";
import { getActiveBabyProfile } from "@/lib/active-baby";

const bodySchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().optional(),
});

const SYSTEM_PROMPT = `أنت مساعد ذكي وآمن للأمهات في مشروع SuperMamy.
الأسلوب الأساسي عربي واضح ومهني ومطمئن، مختصر، وسريع الوصول للنقطة، وإذا كانت رسالة المستخدم بالإنجليزية يمكن الرد بالإنجليزية.
قدّم نصائح عملية قصيرة وآمنة عن الرضاعة، النوم، البكاء، الألم، النظافة، والإجهاد اليومي للأم.
داخل هذه الواجهة يستطيع المستخدم رفع ملف صوتي أو تسجيله من الميكروفون لتحليل بكاء الطفل، لذلك لا تقل أبدًا إنك لا تستطيع استقبال التسجيلات الصوتية أو الملفات الصوتية هنا.
إذا قال المستخدم إنه سيرسل تسجيلًا أو ملفًا صوتيًا لبكاء الطفل، شجّعه بوضوح على رفعه أو تسجيله ثم الضغط على "تحليل الصوت".
لا تعد بتحليل الصور أو الفيديو إلا إذا كانت متاحة صراحة في الواجهة الحالية، لكن لا تنفِ دعم الصوت لأن رفع وتسجيل الصوت مدعومان هنا.
عند ذكر ألم أو مغص أو بكاء شديد، ابدأ فورًا بخطوات تهدئة وعوامل فحص سريعة ثم اذكر متى يلزم الطبيب.
إذا ظهر أي مؤشر خطورة مثل صعوبة التنفس أو التشنج أو الجفاف أو زرقة الشفاه أو حرارة عالية مستمرة، وجّه لطلب المساعدة الطبية العاجلة فورًا.
لا تدّع تشخيصًا طبيًا نهائيًا، واذكر دائمًا متى يلزم الطبيب أو الطوارئ.
تجنب أي شرح تقني أو ميتا عن الذكاء الاصطناعي أو مزودات الخدمة أو واجهات API.`;

type DeepSeekChoice = {
  message?: {
    content?: string;
  };
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
};

type RecentAudioAnalysis = {
  predictedClass: string;
  confidence: number | null;
  createdAt: Date;
};

async function readRequestPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => null);
    return {
      message: json?.message || json?.text || json?.content || json?.prompt || "",
      conversationId: json?.conversationId || json?.chatId || undefined,
    };
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    return {
      message:
        formData?.get("message")?.toString() ||
        formData?.get("text")?.toString() ||
        formData?.get("content")?.toString() ||
        "",
      conversationId:
        formData?.get("conversationId")?.toString() || formData?.get("chatId")?.toString() || undefined,
    };
  }

  const rawText = await request.text().catch(() => "");
  if (!rawText) {
    return { message: "", conversationId: undefined };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawText);
    return {
      message: params.get("message") || params.get("text") || params.get("content") || params.get("prompt") || "",
      conversationId: params.get("conversationId") || params.get("chatId") || undefined,
    };
  }

  try {
    const parsed = JSON.parse(rawText);
    return {
      message: parsed?.message || parsed?.text || parsed?.content || parsed?.prompt || rawText,
      conversationId: parsed?.conversationId || parsed?.chatId || undefined,
    };
  } catch {
    return {
      message: rawText.trim(),
      conversationId: undefined,
    };
  }
}

async function callDeepSeek(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const apiKey = process.env.DEEPSEEK_API || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DeepSeek API key is missing. Set DEEPSEEK_API or DEEPSEEK_API_KEY.");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.25,
      max_tokens: 420,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DeepSeek request failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }
  return content;
}

function formatConfidence(confidence?: number | null) {
  return typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "غير محددة";
}

function buildHistoryContent(message: {
  content: string;
  predictedClass?: string | null;
  confidence?: number | null;
}) {
  if (!message.predictedClass) return message.content;

  return [
    `[تحليل صوت محفوظ] الفئة: ${formatCryClassLabel(message.predictedClass)} | الثقة: ${formatConfidence(message.confidence)}`,
    message.content,
  ].join("\n");
}

function buildLatestAudioSystemHint(latestAudioAnalysis: RecentAudioAnalysis) {
  const classInfo = getCryClassInfo(latestAudioAnalysis.predictedClass);

  return [
    "يوجد في هذه المحادثة آخر تحليل صوت موثّق ومحفوظ من نفس الحالة.",
    `الفئة الأحدث المعتمدة: ${classInfo.label}.`,
    `درجة الثقة: ${formatConfidence(latestAudioAnalysis.confidence)}.`,
    `المعنى: ${classInfo.meaning}`,
    `التوجيه العملي: ${classInfo.guidance}`,
    "إذا احتوى السجل على أكثر من تحليل صوت قديم، فاعتمد آخر تحليل محفوظ فقط باعتباره المرجع الأحدث.",
    "إذا سأل المستخدم عن نتيجة التسجيل أو سبب البكاء الحالي أو قارن بين مغص/جوع/انزعاج/تعب، فلا تغيّر الفئة من النص وحده ولا تخترع تصنيفًا جديدًا. استخدم آخر تحليل صوت محفوظ ما لم يوضح المستخدم أن لديه تسجيلًا جديدًا أو حالة جديدة مختلفة.",
  ].join("\n");
}

function shouldGroundReplyWithLatestAudio(message: string, detectedTopics: string[]) {
  const text = message.toLowerCase().trim();
  if (!text) return false;

  const directResultPatterns = [
    /(result|analysis|analy[sz]e|audio|recording|prediction|predicted|classification|class|latest file|same file|same audio)/i,
    /(النتيجة|التحليل|الصوت|التسجيل|التصنيف|الفئة|التوقع|التوقّع|ايه اللي طلع|إيه اللي طلع|طلع ايه|طلع إيه|ظهر ايه|ظهر إيه|نفس الملف|نفس التسجيل|نفس الصوت)/i,
  ];
  if (directResultPatterns.some((pattern) => pattern.test(message))) {
    return true;
  }

  const classComparisonPatterns = [
    /\b(colic|belly pain|hungry|discomfort|tired)\b.{0,24}\b(or|vs)\b.{0,24}\b(colic|belly pain|hungry|discomfort|tired)\b/i,
    /(مغص|ألم بطني|جوع|انزعاج|نعاس|تعب|غازات).{0,24}(او|أو|ولا|vs).{0,24}(مغص|ألم بطني|جوع|انزعاج|نعاس|تعب|غازات)/i,
  ];
  if (classComparisonPatterns.some((pattern) => pattern.test(message))) {
    return true;
  }

  return detectedTopics.includes("crying") && /(سبب|يعني|meaning|reason)/i.test(text);
}

function buildGroundedAudioReply(latestAudioAnalysis: RecentAudioAnalysis) {
  const classInfo = getCryClassInfo(latestAudioAnalysis.predictedClass);

  return [
    `آخر تحليل صوت محفوظ في هذه المحادثة رجّح: **${classInfo.label}** (${formatConfidence(latestAudioAnalysis.confidence)}).`,
    `المعنى: ${classInfo.meaning}`,
    `اعملي الآن: ${classInfo.guidance}`,
    "هذا هو المرجع الأحدث لنفس التسجيل/الحالة داخل المحادثة، لذلك لن أغيّر التصنيف من الرسالة النصية وحدها.",
    "إذا لديك تسجيل جديد مختلف، ارفعيه كتحليل جديد وسأعتمد نتيجته بشكل مستقل.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const inputConversationId = parsed.data.conversationId;
  const profile = await getActiveBabyProfile(user.id);
  let conversation =
    inputConversationId && inputConversationId.length > 0
      ? await prisma.conversation.findFirst({
          where: {
            id: inputConversationId,
            userId: user.id,
            babyProfileId: profile?.id ?? null,
          },
          select: { id: true, title: true },
        })
      : null;

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        babyProfileId: profile?.id ?? null,
        title: buildConversationTitle(parsed.data.message),
      },
      select: { id: true, title: true },
    });
  }

  const [historyRows, latestAudioAnalysis] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { role: true, content: true, predictedClass: true, confidence: true },
    }),
    prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        predictedClass: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        predictedClass: true,
        confidence: true,
        createdAt: true,
      },
    }),
  ]);

  const history = [...historyRows].reverse();

  const normalizedLatestAudio =
    latestAudioAnalysis?.predictedClass
      ? {
          predictedClass: latestAudioAnalysis.predictedClass,
          confidence: latestAudioAnalysis.confidence,
          createdAt: latestAudioAnalysis.createdAt,
        }
      : null;

  const regexAnalysis = analyzeChatMessage(parsed.data.message);
  const shouldGroundReply = normalizedLatestAudio
    ? shouldGroundReplyWithLatestAudio(parsed.data.message, regexAnalysis.detectedTopics)
    : false;

  const riskAssessment = assessRisk({
    babyAgeMonths: monthsBetween(profile?.birthDate),
    message: parsed.data.message,
    predictedClass: shouldGroundReply ? normalizedLatestAudio?.predictedClass : undefined,
    confidence: shouldGroundReply ? normalizedLatestAudio?.confidence : undefined,
  });

  if (regexAnalysis.directReply) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: parsed.data.message,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: regexAnalysis.directReply,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CHAT_GUIDANCE,
      title: "إرشاد فوري عبر المحادثة",
      summary: regexAnalysis.directReply,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        matchedTopics: regexAnalysis.detectedTopics,
        source: "regex",
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      reply: regexAnalysis.directReply,
      matchedTopics: regexAnalysis.detectedTopics,
      source: "regex",
      risk: riskAssessment,
    });
  }

  if (normalizedLatestAudio && shouldGroundReply) {
    const groundedReply = buildGroundedAudioReply(normalizedLatestAudio);

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: parsed.data.message,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: groundedReply,
          predictedClass: normalizedLatestAudio.predictedClass,
          confidence: normalizedLatestAudio.confidence,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CHAT_GUIDANCE,
      title: "توضيح مبني على آخر تحليل صوت",
      summary: groundedReply,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        matchedTopics: regexAnalysis.detectedTopics,
        source: "latest-audio-context",
        groundedPredictedClass: normalizedLatestAudio.predictedClass,
        groundedConfidence: normalizedLatestAudio.confidence,
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      reply: groundedReply,
      matchedTopics: regexAnalysis.detectedTopics,
      source: "latest-audio-context",
      risk: riskAssessment,
    });
  }

  const deepSeekMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(normalizedLatestAudio ? [{ role: "system" as const, content: buildLatestAudioSystemHint(normalizedLatestAudio) }] : []),
    ...regexAnalysis.extraSystemHints.map((content) => ({ role: "system" as const, content })),
    ...history.map(
      (m): { role: "user" | "assistant"; content: string } => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: buildHistoryContent(m),
      }),
    ),
    { role: "user", content: parsed.data.message },
  ];

  const apiKey = process.env.DEEPSEEK_API || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const fallbackReply = buildLocalFallbackReply(parsed.data.message, regexAnalysis.detectedTopics);

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: parsed.data.message,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: fallbackReply,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CHAT_GUIDANCE,
      title: "إرشاد محلي احتياطي",
      summary: fallbackReply,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        matchedTopics: regexAnalysis.detectedTopics,
        source: "local-fallback",
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      reply: fallbackReply,
      matchedTopics: regexAnalysis.detectedTopics,
      source: "local-fallback",
      risk: riskAssessment,
    });
  }

  try {
    const assistantReply = await callDeepSeek(deepSeekMessages);

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: parsed.data.message,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: assistantReply,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CHAT_GUIDANCE,
      title: "استشارة ذكية سريعة",
      summary: assistantReply,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        matchedTopics: regexAnalysis.detectedTopics,
        source: "deepseek",
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      reply: assistantReply,
      matchedTopics: regexAnalysis.detectedTopics,
      source: "deepseek",
      risk: riskAssessment,
    });
  } catch (error) {
    const fallbackReply = buildLocalFallbackReply(parsed.data.message, regexAnalysis.detectedTopics);

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: parsed.data.message,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: fallbackReply,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CHAT_GUIDANCE,
      title: "إرشاد محلي احتياطي",
      summary: fallbackReply,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        matchedTopics: regexAnalysis.detectedTopics,
        source: "local-fallback",
        warning: error instanceof Error ? error.message : "Failed to call DeepSeek.",
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      reply: fallbackReply,
      matchedTopics: regexAnalysis.detectedTopics,
      source: "local-fallback",
      risk: riskAssessment,
      warning: error instanceof Error ? error.message : "Failed to call DeepSeek.",
    });
  }
}
