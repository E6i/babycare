import type { BabyProfile, Reminder, TimelineEvent } from "@prisma/client";
import { SeverityLevel, TriageLevel } from "@prisma/client";
import { formatAgeLabel } from "@/lib/baby-utils";
import { formatCryClassLabel } from "@/lib/cry-classification";

export type TopPrediction = { label: string; score: number };
export type RiskAssessmentView = {
  riskScore: number;
  severity: SeverityLevel;
  triage: TriageLevel;
  headline: string;
  reasons: string[];
  actions: string[];
  explainability: string[];
};

export const TRIAGE_LABELS: Record<TriageLevel, string> = {
  HOME_CARE: "رعاية منزلية",
  WATCH_CLOSELY: "مراقبة قريبة",
  PEDIATRICIAN_SOON: "مراجعة طبيب قريبًا",
  URGENT_NOW: "طوارئ الآن",
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "عال",
  CRITICAL: "حرج",
};

const SIGNAL_QUALITY_LABELS: Record<string, string> = {
  clear: "إشارة واضحة",
  ready: "جاهز للتحليل",
  "تقييم احتياطي آمن": "تقييم احتياطي آمن",
  noisy: "ضوضاء مرتفعة",
  low_confidence: "ثقة منخفضة",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  CRY_ANALYSIS: "تحليل بكاء",
  RISK_ASSESSMENT: "تقييم خطورة",
  REMINDER_CREATED: "تذكير متابعة",
  CHAT_GUIDANCE: "إرشاد محادثة",
  CARE_LOG: "سجل رعاية",
  GROWTH_RECORD: "قياس نمو",
  VACCINATION: "تطعيم",
  MEDICATION: "دواء",
  NOTE: "ملاحظة",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSeverity(value: unknown): SeverityLevel {
  return Object.values(SeverityLevel).includes(value as SeverityLevel) ? (value as SeverityLevel) : SeverityLevel.LOW;
}

function normalizeTriage(value: unknown): TriageLevel {
  return Object.values(TriageLevel).includes(value as TriageLevel) ? (value as TriageLevel) : TriageLevel.HOME_CARE;
}

export function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value?: Date | string | null) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

export function formatClassLabel(label?: string | null) {
  return label ? formatCryClassLabel(label) : "غير محدد";
}

export function formatSignalQuality(value?: string | null) {
  if (!value) return "غير محدد";
  return SIGNAL_QUALITY_LABELS[value] || value;
}

export function formatTimelineEventType(value?: string | null) {
  if (!value) return "نشاط";
  return EVENT_TYPE_LABELS[value] || value.replace(/_/g, " ");
}

export function eventMetadata(event?: TimelineEvent | null) {
  return isRecord(event?.metadata) ? event.metadata : {};
}

export function getAssessmentFromEvent(event?: TimelineEvent | null): RiskAssessmentView | null {
  const metadata = eventMetadata(event);
  const raw = metadata.riskAssessment || metadata.assessment;
  if (!isRecord(raw)) return null;

  const riskScore = typeof raw.riskScore === "number" ? raw.riskScore : event?.riskScore ?? 0;
  return {
    riskScore,
    severity: normalizeSeverity(raw.severity || event?.severity),
    triage: normalizeTriage(raw.triage || event?.triage),
    headline: typeof raw.headline === "string" ? raw.headline : "تقييم الحالة غير مكتمل",
    reasons: stringList(raw.reasons),
    actions: stringList(raw.actions),
    explainability: stringList(raw.explainability),
  };
}

export function latestRiskEvent(timeline: TimelineEvent[]) {
  return timeline.find((event) => event.riskScore !== null) || null;
}

export function latestAssessment(timeline: TimelineEvent[]) {
  for (const event of timeline) {
    const assessment = getAssessmentFromEvent(event);
    if (assessment) return assessment;
  }
  return null;
}

export function latestCryEvent(timeline: TimelineEvent[]) {
  return timeline.find((event) => event.type === "CRY_ANALYSIS") || null;
}

export function topPredictions(event?: TimelineEvent | null): TopPrediction[] {
  const value = eventMetadata(event).topPredictions;
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter(isRecord)
    .map((item) => ({
      label: typeof item.label === "string" ? item.label : "uncertain",
      score: typeof item.score === "number" ? item.score : 0,
    }));
}

export function profileName(profile?: BabyProfile | null) {
  return profile?.babyName || "الطفل";
}

export function profileCompleteness(profile?: BabyProfile | null) {
  if (!profile) return 0;
  const fields = [
    profile.babyName,
    profile.birthDate,
    profile.gender,
    profile.weightKg,
    profile.feedingStyle,
    profile.emergencyPhone,
    profile.medicalNotes,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

export function carePlanItems(assessment: RiskAssessmentView | null, profile?: BabyProfile | null) {
  const name = profileName(profile);
  const fallback = [
    `تسجيل الرضاعة والحرارة والحفاضات الخاصة بـ ${name} في نفس المكان.`,
    "بدء تحليل صوت أو تقييم سريع عند ظهور بكاء غير معتاد.",
    "مراجعة التذكير القادم قبل نهاية اليوم.",
    "تجهيز تقرير الطبيب عند استمرار الأعراض أو ارتفاع درجة الخطورة.",
  ];
  return assessment?.actions?.length ? assessment.actions.slice(0, 5) : fallback;
}

export function dailyCareBlocks(
  profile: BabyProfile | null,
  assessment: RiskAssessmentView | null,
  reminders: Reminder[],
) {
  const name = profileName(profile);
  const scheduled = reminders
    .filter((reminder) => reminder.status === "SCHEDULED")
    .slice(0, 3)
    .map((reminder) => `${reminder.title}: ${reminder.message}`);

  return [
    {
      title: "الآن",
      summary: assessment?.headline || `بدء تسجيل حالة ${name} الحالية.`,
      items: carePlanItems(assessment, profile).slice(0, 2),
    },
    {
      title: "خلال 4 ساعات",
      summary: "مراقبة التغيرات المهمة بدل الاعتماد على الذاكرة.",
      items: scheduled.length ? scheduled.slice(0, 2) : ["قياس الحرارة", "تسجيل الرضاعة والحفاضات"],
    },
    {
      title: "قبل النوم",
      summary: "مراجعة اليوم وتحضير ملخص واضح عند الحاجة للطبيب.",
      items: ["مراجعة آخر تقييم خطورة", "تسجيل ملاحظة قصيرة عن النوم والبكاء", "فتح تقرير الطبيب عند الحاجة"],
    },
  ];
}

export function doctorReportText(params: {
  profile: BabyProfile | null;
  timeline: TimelineEvent[];
  reminders: Reminder[];
  assessment: RiskAssessmentView | null;
}) {
  const { profile, timeline, reminders, assessment } = params;
  const cryEvent = latestCryEvent(timeline);
  const cryMeta = eventMetadata(cryEvent);
  const predictions = topPredictions(cryEvent)
    .slice(0, 3)
    .map((prediction) => `${formatClassLabel(prediction.label)} ${Math.round(prediction.score * 100)}%`)
    .join("، ");
  const signalQuality = formatSignalQuality(typeof cryMeta.signalQuality === "string" ? cryMeta.signalQuality : null);
  const confidence = typeof cryMeta.confidence === "number" ? `${Math.round(cryMeta.confidence * 100)}%` : "غير محددة";
  const explainability = assessment?.explainability?.length ? assessment.explainability.join(" - ") : "لا توجد نقاط تفسير مسجلة";
  const recentTimeline = timeline
    .slice(0, 5)
    .map((event) => `${formatTimelineEventType(event.type)}: ${event.title} - ${event.summary} (${formatDateTime(event.createdAt)})`)
    .join("\n");

  const lines = [
    "Smart Child Care - تقرير طبي منظم",
    `تاريخ إصدار التقرير: ${formatDateTime(new Date())}`,
    `اسم الطفل: ${profileName(profile)}`,
    `العمر: ${formatAgeLabel(profile?.birthDate) || "غير محدد"}`,
    `تاريخ الميلاد: ${formatDateOnly(profile?.birthDate)}`,
    `الوزن: ${profile?.weightKg ? `${profile.weightKg} كجم` : "غير محدد"}`,
    `نمط الرضاعة: ${profile?.feedingStyle || "غير محدد"}`,
    `طبيب الأطفال: ${profile?.pediatricianName || "غير محدد"}`,
    `هاتف الطبيب: ${profile?.pediatricianPhone || "غير محدد"}`,
    `رقم الطوارئ: ${profile?.emergencyPhone || "غير محدد"}`,
    `ملاحظات طبية: ${profile?.medicalNotes || "لا توجد ملاحظات مسجلة"}`,
    "",
    "ملخص التقييم",
    `النتيجة: ${assessment?.headline || "لا يوجد تقييم حديث"}`,
    `درجة الخطورة: ${assessment ? `${assessment.riskScore}/100` : "غير محددة"}`,
    `مستوى الفرز: ${assessment ? TRIAGE_LABELS[assessment.triage] : "غير محدد"}`,
    `مستوى الشدة: ${assessment ? SEVERITY_LABELS[assessment.severity] : "غير محدد"}`,
    `الأسباب: ${(assessment?.reasons || ["لا توجد أسباب مسجلة"]).join(" - ")}`,
    `تفسير القرار: ${explainability}`,
    `الإجراءات المقترحة: ${(assessment?.actions || ["لا توجد إجراءات مسجلة"]).join(" - ")}`,
    "",
    "تحليل البكاء",
    `النتيجة: ${cryEvent ? formatClassLabel(String(cryMeta.predictedClass || "")) : "لا يوجد"}`,
    `ثقة النموذج: ${confidence}`,
    `جودة الإشارة: ${signalQuality}`,
    `توقعات النموذج: ${predictions || "غير متاحة"}`,
    "",
    "المتابعة والتذكيرات",
    `${reminders.slice(0, 5).map((reminder) => `${reminder.title}: ${reminder.message} (${formatDateTime(reminder.scheduledFor)})`).join("\n") || "لا توجد تذكيرات محفوظة"}`,
    "",
    "آخر الأحداث",
    recentTimeline || "لا توجد أحداث محفوظة",
    "",
    "ملاحظة أمان: التقرير يساعد في تنظيم المعلومات والفرز والمتابعة، ولا يمثل تشخيصًا طبيًا نهائيًا.",
  ];

  return lines.join("\n");
}
