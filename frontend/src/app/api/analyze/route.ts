import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assessRisk } from "@/lib/risk-engine";
import { createTimelineEvent } from "@/lib/timeline";
import { monthsBetween } from "@/lib/baby-utils";
import { buildAudioConversationTitle } from "@/lib/chat-title";
import { ReminderChannel, ReminderStatus, TimelineEventType } from "@prisma/client";
import { getActiveBabyProfile } from "@/lib/active-baby";
import { getCryClassInfo } from "@/lib/cry-classification";

const execFileAsync = promisify(execFile);

const inferResultSchema = z.object({
  predicted_class: z.string().min(1),
  confidence: z.number().min(0).max(1),
  advice: z.string().min(1),
  signal_quality: z.string().optional(),
  top_predictions: z.array(z.object({ label: z.string(), score: z.number() })).optional(),
});

type InferResult = z.infer<typeof inferResultSchema>;
type AnalysisEngine = "model" | "heuristic-fallback";
type ExecFileError = Error & { stderr?: string | Buffer; stdout?: string | Buffer };
type QuickAudioCheck = {
  temperatureC?: number | null;
  wetDiapers24h?: number | null;
  cryingHours?: number | null;
  poorFeeding?: boolean;
  sleepIssue?: boolean;
};

export const runtime = "nodejs";

function sanitizeAudioExtension(fileName: string) {
  const ext = path.extname(fileName || "").toLowerCase();
  return /^[a-z0-9.]+$/.test(ext) && ext.length <= 8 ? ext : ".wav";
}

function toShortError(error: unknown) {
  const execError = error as Partial<ExecFileError> | null;
  const stderr = Buffer.isBuffer(execError?.stderr) ? execError.stderr.toString("utf8") : execError?.stderr;
  const stdout = Buffer.isBuffer(execError?.stdout) ? execError.stdout.toString("utf8") : execError?.stdout;
  const message = [
    error instanceof Error ? error.message : String(error),
    typeof stderr === "string" ? stderr : "",
    typeof stdout === "string" ? stdout : "",
  ]
    .filter(Boolean)
    .join(" ");

  return message.replace(/\s+/g, " ").slice(0, 360);
}

function allowsHeuristicFallback() {
  const mode = (process.env.AUDIO_MODEL_FALLBACK_MODE ?? "error").trim().toLowerCase();
  return ["heuristic", "fallback", "demo", "enabled", "true", "1"].includes(mode);
}

function shouldExposeAudioModelErrors() {
  const override = (process.env.AUDIO_MODEL_EXPOSE_ERRORS ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(override)) return true;
  if (["false", "0", "no"].includes(override)) return false;
  return process.env.NODE_ENV !== "production";
}

function buildModelUnavailableResponse(error: unknown) {
  const details = toShortError(error);

  return NextResponse.json(
    {
      error: "تعذر تشغيل مودل تحليل الصوت، لذلك لم أعرض نتيجة بديلة حتى لا تظهر إجابة مختلفة عن توقع المودل.",
      code: "AUDIO_MODEL_UNAVAILABLE",
      details: shouldExposeAudioModelErrors() ? details : undefined,
      fix: "ثبّت مكتبات Python من ../ml/requirements.txt، واضبط PYTHON_BIN على نفس البيئة، وتأكد من وجود ../ml/models/best_model.keras.",
    },
    { status: 503 },
  );
}

async function resolvePythonBin() {
  const candidates = [process.env.PYTHON_BIN, "python3", "python"].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 3000, maxBuffer: 1024 * 64 });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("No Python runtime is available.");
}

async function normalizeAudioForInference(inputPath: string, cleanupPaths: string[]) {
  const outputPath = path.join(path.dirname(inputPath), `${randomUUID()}.wav`);

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-ac",
        "1",
        "-ar",
        "22050",
        "-t",
        "3",
        outputPath,
      ],
      { timeout: 25000, maxBuffer: 1024 * 1024 },
    );
    cleanupPaths.push(outputPath);
    return outputPath;
  } catch (error) {
    console.info(`Audio normalization skipped: ${toShortError(error)}`);
    return inputPath;
  }
}

async function runModelInference(audioPath: string) {
  const pythonBin = await resolvePythonBin();
  const inferScriptPath = path.join(process.cwd(), "scripts", "infer_cry.py");

  const { stdout, stderr } = await execFileAsync(pythonBin, [inferScriptPath, audioPath], {
    cwd: process.cwd(),
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: "3" },
  });

  if (stderr && stderr.trim().length > 0) {
    console.error(stderr);
  }

  const rawOutput = stdout.trim();
  const jsonPayload = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));

  if (!jsonPayload) {
    throw new Error(`Model script returned no JSON payload. stdout=${rawOutput.slice(0, 220)}`);
  }

  return inferResultSchema.parse(JSON.parse(jsonPayload));
}

function buildFallbackInference(message: string): InferResult {
  const text = message.toLowerCase();
  const patterns: Array<{ label: string; confidence: number; advice: string; match: RegExp }> = [
    {
      label: "belly_pain",
      confidence: 0.64,
      advice: "العلامات المكتوبة تميل إلى مغص أو غازات. يمكن تجربة التجشؤ، تدليك البطن برفق، ووضعية كرة القدم مع متابعة التحسن.",
      match: /(مغص|بطن|غاز|غازات|انتفاخ|تقلص|colic|belly|stomach|gas)/i,
    },
    {
      label: "hungry",
      confidence: 0.62,
      advice: "العلامات المكتوبة قد تشير إلى الجوع أو احتياج رضعة. يمكن تجربة رضعة هادئة ومتابعة ما إذا كان البكاء يهدأ بعدها.",
      match: /(جوع|جائع|رضاع|رضاعة|بيمص|hungry|feed|feeding)/i,
    },
    {
      label: "tired",
      confidence: 0.61,
      advice: "العلامات المكتوبة قد تشير إلى تعب أو احتياج للنوم. يفضل تقليل الإضاءة والضوضاء وبدء روتين تهدئة قصير.",
      match: /(نوم|نعسان|تعب|مرهق|سهر|sleep|tired)/i,
    },
    {
      label: "discomfort",
      confidence: 0.6,
      advice: "العلامات المكتوبة تميل إلى انزعاج عام. يفضل فحص الحفاض والملابس والحرارة ووضعية الطفل.",
      match: /(حفاض|بلل|حر|برد|ملابس|مضايق|وجع|diaper|hot|cold|discomfort)/i,
    },
  ];

  const match = patterns.find((item) => item.match.test(text));
  if (match) {
    return {
      predicted_class: match.label,
      confidence: match.confidence,
      advice: match.advice,
      signal_quality: "تقييم احتياطي آمن",
      top_predictions: [
        { label: match.label, score: match.confidence },
        { label: "discomfort", score: 0.22 },
        { label: "background", score: 0.14 },
      ],
    };
  }

  return {
    predicted_class: "uncertain",
    confidence: 0.48,
    advice:
      "تم استلام التسجيل، لكن لا توجد مؤشرات كافية للجزم بالسبب. يفضل فحص الجوع والحفاض والحرارة والغازات، ومراقبة أي علامات خطر مثل صعوبة التنفس أو الخمول.",
    signal_quality: "تقييم احتياطي آمن",
    top_predictions: [
      { label: "uncertain", score: 0.48 },
      { label: "discomfort", score: 0.28 },
      { label: "hungry", score: 0.24 },
    ],
  };
}

function readOptionalNumber(formData: FormData, key: string, min: number, max: number) {
  const raw = formData.get(key)?.toString().trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function readQuickAudioCheck(formData: FormData): QuickAudioCheck {
  return {
    temperatureC: readOptionalNumber(formData, "temperatureC", 30, 45),
    wetDiapers24h: readOptionalNumber(formData, "wetDiapers24h", 0, 30),
    cryingHours: readOptionalNumber(formData, "cryingHours", 0, 24),
    poorFeeding: formData.get("poorFeeding")?.toString() === "true",
    sleepIssue: formData.get("sleepIssue")?.toString() === "true",
  };
}

function quickCheckLines(check: QuickAudioCheck) {
  return [
    typeof check.temperatureC === "number" ? `الحرارة: ${check.temperatureC}°C` : null,
    typeof check.wetDiapers24h === "number" ? `الحفاضات المبللة/24 ساعة: ${check.wetDiapers24h}` : null,
    typeof check.cryingHours === "number" ? `مدة البكاء: ${check.cryingHours} ساعة` : null,
    check.poorFeeding ? "يوجد ضعف رضاعة" : null,
    check.sleepIssue ? "يوجد اضطراب نوم" : null,
  ].filter(Boolean) as string[];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveBabyProfile(user.id);

  const formData = await request.formData();
  const audio = formData.get("audio");
  const conversationIdInput = formData.get("conversationId");
  const userText = (formData.get("message")?.toString() ?? "Please analyze my baby's cry.").trim();
  const quickCheck = readQuickAudioCheck(formData);
  const quickLines = quickCheckLines(quickCheck);
  const userMessageContent = [
    userText || "حللي بكاء الطفل.",
    quickLines.length > 0 ? `بيانات سريعة قبل التحليل:\n${quickLines.map((line) => `- ${line}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const ext = sanitizeAudioExtension(audio.name || "");
  const tempFilePath = path.join(tmpDir, `${randomUUID()}${ext}`);
  const cleanupPaths = [tempFilePath];

  try {
    const bytes = await audio.arrayBuffer();
    await fs.writeFile(tempFilePath, Buffer.from(bytes));

    const inferenceAudioPath = await normalizeAudioForInference(tempFilePath, cleanupPaths);
    let analysisEngine: AnalysisEngine = "model";
    let modelErrorMessage: string | null = null;
    let inferResult: InferResult;

    try {
      inferResult = await runModelInference(inferenceAudioPath);
    } catch (error) {
      modelErrorMessage = toShortError(error);
      console.error(`Audio model unavailable: ${modelErrorMessage}`);

      if (!allowsHeuristicFallback()) {
        return buildModelUnavailableResponse(error);
      }

      analysisEngine = "heuristic-fallback";
      console.warn(`Audio model unavailable, using explicitly enabled heuristic fallback: ${modelErrorMessage}`);
      inferResult = buildFallbackInference(userText);
    }

    const riskAssessment = assessRisk({
      babyAgeMonths: monthsBetween(profile?.birthDate),
      message: userText,
      predictedClass: inferResult.predicted_class,
      confidence: inferResult.confidence,
      temperatureC: quickCheck.temperatureC,
      wetDiapers24h: quickCheck.wetDiapers24h,
      cryingHours: quickCheck.cryingHours,
      poorFeeding: quickCheck.poorFeeding,
      sleepIssue: quickCheck.sleepIssue,
    });

    const classInfo = getCryClassInfo(inferResult.predicted_class);
    const confidencePercent = Math.round(inferResult.confidence * 100);

    const explainability = [
      `النموذج رجّح الفئة الأقرب: ${classInfo.label}`,
      `درجة الثقة: ${Math.round(inferResult.confidence * 100)}%`,
      ...(inferResult.signal_quality ? [`جودة الإشارة: ${inferResult.signal_quality}`] : []),
      ...(analysisEngine === "heuristic-fallback"
        ? [
            "لم يعمل مودل الصوت في هذه المحاولة؛ النتيجة التالية تقييم احتياطي وليست prediction من best_model.keras.",
            ...(shouldExposeAudioModelErrors() && modelErrorMessage ? [`سبب فشل المودل: ${modelErrorMessage}`] : []),
          ]
        : []),
      ...riskAssessment.explainability,
    ];

    const assistantReply = [
      `تحليل بكاء ${profile?.babyName || "الطفل"}:`,
      `الفئة الأقرب: **${classInfo.label}** (${confidencePercent}%)`,
      `ماذا تعني: ${classInfo.meaning}`,
      quickLines.length > 0 ? `البيانات السريعة: ${quickLines.join(" | ")}` : null,
      `التقييم الصحي: ${riskAssessment.headline}`,
      `ماذا تفعلين الآن: ${classInfo.guidance}`,
      `تفصيل إضافي: ${inferResult.advice}`,
      analysisEngine === "heuristic-fallback"
        ? "تنبيه مهم: هذه ليست نتيجة المودل الصوتي. تم تشغيل fallback احتياطي لأن best_model.keras لم يعمل في هذه المحاولة."
        : null,
      riskAssessment.actions.length > 0 ? `الخطوات المقترحة: ${riskAssessment.actions.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const existingConversationId =
      typeof conversationIdInput === "string" && conversationIdInput.length > 0
        ? conversationIdInput
        : null;

    let conversation = existingConversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: existingConversationId,
            userId: user.id,
            babyProfileId: profile?.id ?? null,
          },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          babyProfileId: profile?.id ?? null,
          title: buildAudioConversationTitle(userText),
        },
      });
    }

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: userMessageContent,
          audioFileName: audio.name || "recorded_audio",
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: assistantReply,
          predictedClass: inferResult.predicted_class,
          confidence: inferResult.confidence,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      prisma.reminder.create({
        data: {
          userId: user.id,
          babyProfileId: profile?.id ?? null,
          title: "مراجعة الحرارة بعد التحليل",
          message: `مراجعة حرارة ${profile?.babyName || "الطفل"} بعد ساعتين وتسجيل ما إذا كان البكاء أو الأعراض قد تحسنت.`,
          channel: ReminderChannel.APP,
          scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000),
          status: ReminderStatus.SCHEDULED,
          provider: "auto-audio-follow-up",
        },
      }),
    ]);

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.CRY_ANALYSIS,
      title: "تحليل بكاء متعدد الوسائط",
      summary: `${riskAssessment.headline} - ${classInfo.label}`,
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        userText,
        predictedClass: inferResult.predicted_class,
        confidence: inferResult.confidence,
        signalQuality: inferResult.signal_quality,
        topPredictions: inferResult.top_predictions,
        analysisEngine,
        modelError: analysisEngine === "heuristic-fallback" && shouldExposeAudioModelErrors() ? modelErrorMessage : undefined,
        quickCheck,
        explainability,
        riskAssessment,
      },
    });

    await createTimelineEvent({
      userId: user.id,
      babyProfileId: profile?.id ?? null,
      type: TimelineEventType.REMINDER_CREATED,
      title: "تذكير متابعة تلقائي",
      summary: "مراجعة الحرارة بعد ساعتين من تحليل الصوت.",
      severity: riskAssessment.severity,
      triage: riskAssessment.triage,
      riskScore: riskAssessment.riskScore,
      metadata: {
        source: "audio-analysis",
        scheduledAfterHours: 2,
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      result: {
        ...inferResult,
        advice: assistantReply,
        risk: riskAssessment,
        explainability,
        analysisEngine,
        modelError: analysisEngine === "heuristic-fallback" && shouldExposeAudioModelErrors() ? modelErrorMessage : undefined,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "تعذر حفظ نتيجة تحليل الصوت الآن. يرجى المحاولة مرة أخرى بعد لحظات.",
      },
      { status: 500 },
    );
  } finally {
    await Promise.all(cleanupPaths.map((filePath) => fs.rm(filePath, { force: true })));
  }
}
