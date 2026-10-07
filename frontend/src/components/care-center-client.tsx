"use client";

/* eslint-disable @next/next/no-img-element */
import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

type ProductData = {
  profile?: {
    babyName?: string | null;
    avatarUrl?: string | null;
    ageLabel?: string;
    weightKg?: number | null;
    heightCm?: number | null;
    emergencyPhone?: string | null;
    pediatricianName?: string | null;
    pediatricianPhone?: string | null;
  };
  careLogs: Array<{ id: string; type: string; value?: number | null; unit?: string | null; note?: string | null; occurredAt: string }>;
  growthRecords: Array<{ id: string; weightKg?: number | null; heightCm?: number | null; headCircumferenceCm?: number | null; recordedAt: string; note?: string | null }>;
  vaccinationRecords: Array<{ id: string; vaccineName: string; dueDate: string; completedAt?: string | null; status: string; notes?: string | null }>;
  medications: Array<{
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    instructions?: string | null;
    active: boolean;
    doses: Array<{ id: string; scheduledFor: string; status: string }>;
  }>;
  doctorReports: Array<{ id: string; title: string; summary: string; riskScore?: number | null; createdAt: string; shareLinks?: Array<{ token: string; expiresAt: string }> }>;
  notifications: Array<{ id: string; title: string; message: string; status: string; scheduledFor?: string | null }>;
  auditLogs: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
};

type ActiveTab = "today" | "growth" | "vaccines" | "meds" | "reports";
type StatCard = { label: string; value: number; icon: string };
type CommandMetric = { label: string; value: string; hint: string; icon: string };
type CareCommand = {
  score: number;
  scoreLabel: string;
  state: "stable" | "watch" | "urgent";
  title: string;
  summary: string;
  metrics: CommandMetric[];
  actions: string[];
};

const LOG_TYPES = [
  ["FEEDING", "رضاعة", "bottle"],
  ["SLEEP", "نوم", "moon"],
  ["TEMPERATURE", "حرارة", "thermometer"],
  ["DIAPER", "حفاضات", "diaper"],
  ["CRYING", "بكاء", "audio"],
  ["MEDICATION", "دواء", "stethoscope"],
  ["VOMITING", "قيء", "alert"],
  ["NOTE", "ملاحظة", "report"],
] as const;

const TABS: Array<{ id: ActiveTab; label: string; icon: string }> = [
  { id: "today", label: "سجل اليوم", icon: "clock" },
  { id: "growth", label: "النمو", icon: "baby" },
  { id: "vaccines", label: "التطعيمات", icon: "bell" },
  { id: "meds", label: "الأدوية", icon: "stethoscope" },
  { id: "reports", label: "التقارير", icon: "report" },
];

function nowLocalInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function datetimeInputToIso(value: string) {
  return new Date(value).toISOString();
}

function formatWhen(value?: string | null) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function logTypeLabel(type: string) {
  return LOG_TYPES.find(([value]) => value === type)?.[1] || type;
}

function logTypeIcon(type: string) {
  return LOG_TYPES.find(([value]) => value === type)?.[2] || "report";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function withinDays(dateValue: string, days: number) {
  return Date.now() - new Date(dateValue).getTime() <= days * DAY_MS;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

function buildCareCommand(data: ProductData): CareCommand {
  const todayLogs = data.careLogs.filter((log) => withinDays(log.occurredAt, 1));
  const hasAnyCareData =
    data.careLogs.length > 0 ||
    data.growthRecords.length > 0 ||
    data.vaccinationRecords.length > 0 ||
    data.medications.length > 0 ||
    data.doctorReports.length > 0;
  const feedingCount = todayLogs.filter((log) => log.type === "FEEDING").length;
  const wetDiapers = todayLogs.filter((log) => log.type === "DIAPER").reduce((sum, log) => sum + (log.value || 1), 0);
  const cryingMinutes = todayLogs.filter((log) => log.type === "CRYING").reduce((sum, log) => sum + (log.value || 0), 0);
  const latestTemperature = data.careLogs.find((log) => log.type === "TEMPERATURE");
  const latestTempValue = latestTemperature?.value ?? null;
  const hasVaccinationData = data.vaccinationRecords.length > 0;
  const overdueVaccines = data.vaccinationRecords.filter((item) => item.status !== "COMPLETED" && new Date(item.dueDate).getTime() < Date.now()).length;
  const activeMeds = data.medications.filter((medication) => medication.active);
  const allDoses = activeMeds.flatMap((medication) => medication.doses);
  const closedDoses = allDoses.filter((dose) => dose.status === "TAKEN" || dose.status === "SKIPPED" || dose.status === "MISSED").length;
  const takenDoses = allDoses.filter((dose) => dose.status === "TAKEN").length;
  const adherence = closedDoses ? Math.round((takenDoses / closedDoses) * 100) : null;
  const hasRecentGrowth = data.growthRecords.some((record) => withinDays(record.recordedAt, 35));

  if (!hasAnyCareData) {
    return {
      score: 0,
      scoreLabel: "--",
      state: "watch",
      title: "بانتظار بيانات الرعاية",
      summary: "لا توجد بيانات كافية لحساب مؤشر الرعاية بعد. أضيفي أول سجل بدل الاعتماد على افتراضات جاهزة.",
      actions: [
        "سجلي أول رضعة أو حفاض أو قياس حرارة.",
        "أضيفي قياسات النمو أو جدول التطعيمات عند توفرها.",
        "لن تعرض المنصة حالة مطمئنة أو التزام دواء بدون بيانات مدخلة.",
      ],
      metrics: [
        { label: "آخر حرارة", value: "غير مسجلة", hint: "أضيفي قياسًا عند الحاجة", icon: "thermometer" },
        { label: "رضعات اليوم", value: "0", hint: "لا توجد مدخلات اليوم", icon: "bottle" },
        { label: "حفاضات", value: "0", hint: "غير مسجلة", icon: "diaper" },
        { label: "التزام الدواء", value: "غير مسجل", hint: "لا توجد جرعات محفوظة", icon: "stethoscope" },
      ],
    };
  }

  let score = 48;
  if (todayLogs.length) score += 12;
  if (feedingCount) score += 10;
  if (wetDiapers >= 3) score += 10;
  if (latestTemperature) score += 8;
  if (hasRecentGrowth) score += 8;
  if (hasVaccinationData && overdueVaccines === 0) score += 7;
  if (adherence !== null && adherence >= 80) score += 7;
  if ((latestTempValue ?? 0) >= 38) score -= 18;
  if (cryingMinutes >= 120) score -= 10;
  if (overdueVaccines > 0) score -= overdueVaccines * 10;
  if (adherence !== null && adherence < 60) score -= 10;
  score = clamp(Math.round(score));

  const state = score >= 78 ? "stable" : score >= 52 ? "watch" : "urgent";
  const title = state === "stable" ? "اليوم مستقر" : state === "watch" ? "متابعة قريبة اليوم" : "يحتاج قرار سريع";
  const summary =
    state === "stable"
      ? "المدخلات الأساسية متاحة ولا توجد إشارات تشغيلية مقلقة في البيانات الحالية."
      : state === "watch"
        ? "توجد عناصر ناقصة أو مؤشرات تستحق متابعة أوضح قبل نهاية اليوم."
        : "يفضل تجهيز تقرير الطبيب ومراجعة علامات الخطر فورًا.";

  const actions = [
    feedingCount ? "الاستمرار في تسجيل الرضعات بنفس النمط." : "تسجيل أول رضعة اليوم يساعد في تحسين تقييم الحالة.",
    wetDiapers > 0
      ? wetDiapers >= 3
        ? "الحفاضات المسجلة اليوم تبدو كافية، مع متابعة أي تغير."
        : "مراجعة الحفاضات المبللة خلال آخر 24 ساعة."
      : "تسجيل الحفاضات بدل افتراض حالتها.",
    hasVaccinationData
      ? overdueVaccines
        ? "مراجعة التطعيمات المتأخرة وتحديد موعد مناسب."
        : "لا توجد تطعيمات متأخرة ضمن الجدول المسجل."
      : "لم يتم تسجيل جدول تطعيمات بعد.",
    latestTemperature
      ? (latestTempValue ?? 0) >= 38
        ? "إعادة قياس الحرارة وتجهيز تقرير الطبيب."
        : "آخر قياس حرارة محفوظ لا يظهر ارتفاعًا."
      : "إضافة قياس حرارة عند استمرار البكاء أو ظهور سخونية.",
  ];

  return {
    score,
    scoreLabel: String(score),
    state,
    title,
    summary,
    actions,
    metrics: [
      { label: "آخر حرارة", value: latestTempValue ? `${latestTempValue} C` : "غير مسجلة", hint: latestTemperature ? formatWhen(latestTemperature.occurredAt) : "إضافة قياس", icon: "thermometer" },
      { label: "رضعات اليوم", value: String(feedingCount), hint: `${todayLogs.length} مدخلات اليوم`, icon: "bottle" },
      { label: "حفاضات", value: wetDiapers ? String(wetDiapers) : "0", hint: "خلال 24 ساعة", icon: "diaper" },
      {
        label: "التزام الدواء",
        value: adherence !== null ? `${adherence}%` : "غير مسجل",
        hint: activeMeds.length ? (closedDoses ? `${activeMeds.length} دواء نشط` : "لا توجد جرعات مكتملة") : "لا يوجد دواء نشط",
        icon: "stethoscope",
      },
    ],
  };
}

function buildGrowthInsight(records: ProductData["growthRecords"]) {
  const ordered = [...records].filter((record) => record.weightKg || record.heightCm).sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const latest = ordered.at(-1);
  const previous = ordered.at(-2);
  const delta = latest?.weightKg && previous?.weightKg ? Number((latest.weightKg - previous.weightKg).toFixed(1)) : null;
  const weights = ordered.slice(-8).filter((record) => typeof record.weightKg === "number") as Array<ProductData["growthRecords"][number] & { weightKg: number }>;
  const min = weights.length ? Math.min(...weights.map((record) => record.weightKg)) : 0;
  const max = weights.length ? Math.max(...weights.map((record) => record.weightKg)) : 0;
  const range = Math.max(max - min, 0.4);
  const points = weights.map((record, index) => {
    const x = weights.length === 1 ? 160 : 20 + (index / (weights.length - 1)) * 280;
    const y = 94 - ((record.weightKg - min) / range) * 68;
    return { x, y, label: `${record.weightKg} كجم`, date: formatShortDate(record.recordedAt) };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return {
    latest,
    delta,
    points,
    path,
    headline: !latest ? "لا توجد قياسات كافية" : delta === null ? "أول قياس محفوظ" : delta >= 0 ? `زيادة ${delta} كجم عن القياس السابق` : `انخفاض ${Math.abs(delta)} كجم عن القياس السابق`,
  };
}

function vaccineState(item: ProductData["vaccinationRecords"][number]) {
  if (item.status === "COMPLETED") return { label: "مكتمل", className: "complete" };
  if (new Date(item.dueDate).getTime() < Date.now()) return { label: "متأخر", className: "late" };
  if (new Date(item.dueDate).getTime() - Date.now() < 14 * DAY_MS) return { label: "قريب", className: "soon" };
  return { label: "مجدول", className: "due" };
}

function doseStatusLabel(status: string) {
  if (status === "TAKEN") return "تمت الجرعة";
  if (status === "SKIPPED") return "تم التخطي";
  if (status === "MISSED") return "فاتت";
  return "مجدولة";
}

function buildMedicationInsight(medications: ProductData["medications"]) {
  const doses = medications.flatMap((medication) => medication.doses);
  const taken = doses.filter((dose) => dose.status === "TAKEN").length;
  const skipped = doses.filter((dose) => dose.status === "SKIPPED" || dose.status === "MISSED").length;
  const scheduled = doses.filter((dose) => dose.status === "SCHEDULED").length;
  const adherence = taken + skipped ? Math.round((taken / Math.max(taken + skipped, 1)) * 100) : null;
  return {
    taken,
    skipped,
    scheduled,
    adherence,
    adherenceLabel: adherence !== null ? `${adherence}% التزام` : "لا توجد جرعات مقيمة",
  };
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية.");
  return data;
}

export function CareCenterClient() {
  const [data, setData] = useState<ProductData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  const [careLogForm, setCareLogForm] = useState({ type: "FEEDING", value: "", unit: "ml", note: "", occurredAt: nowLocalInput() });
  const [growthForm, setGrowthForm] = useState({ weightKg: "", heightCm: "", headCircumferenceCm: "", recordedAt: nowLocalInput(), note: "" });
  const [vaccineForm, setVaccineForm] = useState({ vaccineName: "", dueDate: nowLocalInput(), notes: "" });
  const [medicationForm, setMedicationForm] = useState({ name: "", dosage: "", frequency: "", instructions: "", firstDoseAt: nowLocalInput() });

  async function loadProduct() {
    setLoading(true);
    setError("");
    try {
      const product = await requestJson("/api/product");
      setData(product);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل مركز الرعاية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProduct();
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || loading) return;

    let context: { revert: () => void } | undefined;
    let mounted = true;
    async function animateTab() {
      const { gsap } = await import("gsap");
      if (!mounted) return;
      context = gsap.context(() => {
        const elements = gsap.utils.toArray<HTMLElement>(
          ".care-center-panel .command-panel, .care-center-panel .empty-state-block",
        );
        if (!elements.length) return;
        gsap.fromTo(
          elements,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.38, ease: "power2.out", stagger: 0.035 },
        );
      });
    }

    void animateTab();
    return () => {
      mounted = false;
      context?.revert();
    };
  }, [activeTab, loading]);

  const stats = useMemo<StatCard[]>(() => {
    const todayCount = data?.careLogs.filter((log) => Date.now() - new Date(log.occurredAt).getTime() < 24 * 60 * 60 * 1000).length || 0;
    const dueVaccines = data?.vaccinationRecords.filter((item) => item.status === "DUE").length || 0;
    const activeMeds = data?.medications.filter((item) => item.active).length || 0;
    const reports = data?.doctorReports.length || 0;
    return [
      { label: "سجل اليوم", value: todayCount, icon: "clock" },
      { label: "تطعيمات قادمة", value: dueVaccines, icon: "bell" },
      { label: "أدوية نشطة", value: activeMeds, icon: "stethoscope" },
      { label: "تقارير محفوظة", value: reports, icon: "report" },
    ];
  }, [data]);

  const careCommand = useMemo(() => (data ? buildCareCommand(data) : null), [data]);

  const growthInsight = useMemo(() => (data ? buildGrowthInsight(data.growthRecords) : null), [data]);

  const medicationInsight = useMemo(() => (data ? buildMedicationInsight(data.medications) : null), [data]);

  const vaccineOverview = useMemo(() => {
    const records = data?.vaccinationRecords || [];
    return {
      completed: records.filter((item) => item.status === "COMPLETED").length,
      late: records.filter((item) => item.status !== "COMPLETED" && new Date(item.dueDate).getTime() < Date.now()).length,
      soon: records.filter((item) => item.status !== "COMPLETED" && new Date(item.dueDate).getTime() >= Date.now() && new Date(item.dueDate).getTime() - Date.now() < 14 * DAY_MS).length,
      due: records.filter((item) => item.status !== "COMPLETED" && new Date(item.dueDate).getTime() - Date.now() >= 14 * DAY_MS).length,
      next: records.filter((item) => item.status !== "COMPLETED").slice(0, 4),
    };
  }, [data]);

  async function submitCareLog(event: FormEvent) {
    event.preventDefault();
    setSaving("care-log");
    setError("");
    try {
      await requestJson("/api/care-logs", {
        method: "POST",
        body: JSON.stringify({
          type: careLogForm.type,
          value: careLogForm.value ? Number(careLogForm.value) : null,
          unit: careLogForm.unit || null,
          note: careLogForm.note || null,
          occurredAt: datetimeInputToIso(careLogForm.occurredAt),
        }),
      });
      setCareLogForm((prev) => ({ ...prev, value: "", note: "", occurredAt: nowLocalInput() }));
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ السجل.");
    } finally {
      setSaving("");
    }
  }

  async function submitGrowth(event: FormEvent) {
    event.preventDefault();
    setSaving("growth");
    setError("");
    try {
      await requestJson("/api/growth", {
        method: "POST",
        body: JSON.stringify({
          weightKg: growthForm.weightKg ? Number(growthForm.weightKg) : null,
          heightCm: growthForm.heightCm ? Number(growthForm.heightCm) : null,
          headCircumferenceCm: growthForm.headCircumferenceCm ? Number(growthForm.headCircumferenceCm) : null,
          recordedAt: datetimeInputToIso(growthForm.recordedAt),
          note: growthForm.note || null,
        }),
      });
      setGrowthForm((prev) => ({ ...prev, note: "" }));
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ النمو.");
    } finally {
      setSaving("");
    }
  }

  async function submitVaccine(event: FormEvent) {
    event.preventDefault();
    if (!vaccineForm.vaccineName.trim()) return;
    setSaving("vaccine");
    setError("");
    try {
      await requestJson("/api/vaccinations", {
        method: "POST",
        body: JSON.stringify({
          vaccineName: vaccineForm.vaccineName,
          dueDate: datetimeInputToIso(vaccineForm.dueDate),
          notes: vaccineForm.notes || null,
        }),
      });
      setVaccineForm({ vaccineName: "", dueDate: nowLocalInput(), notes: "" });
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ التطعيم.");
    } finally {
      setSaving("");
    }
  }

  async function completeVaccine(id: string) {
    setSaving(id);
    try {
      await requestJson("/api/vaccinations", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "COMPLETED", completedAt: new Date().toISOString() }),
      });
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر تحديث التطعيم.");
    } finally {
      setSaving("");
    }
  }

  async function submitMedication(event: FormEvent) {
    event.preventDefault();
    setSaving("medication");
    setError("");
    try {
      await requestJson("/api/medications", {
        method: "POST",
        body: JSON.stringify({
          name: medicationForm.name,
          dosage: medicationForm.dosage,
          frequency: medicationForm.frequency,
          instructions: medicationForm.instructions || null,
          doses: medicationForm.firstDoseAt ? [datetimeInputToIso(medicationForm.firstDoseAt)] : [],
        }),
      });
      setMedicationForm({ name: "", dosage: "", frequency: "", instructions: "", firstDoseAt: nowLocalInput() });
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ الدواء.");
    } finally {
      setSaving("");
    }
  }

  async function updateDose(id: string, status: "TAKEN" | "SKIPPED") {
    setSaving(id);
    try {
      await requestJson("/api/medications/doses", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر تحديث الجرعة.");
    } finally {
      setSaving("");
    }
  }

  async function createReport() {
    setSaving("report");
    setError("");
    try {
      await requestJson("/api/reports", { method: "POST", body: JSON.stringify({}) });
      await loadProduct();
      setActiveTab("reports");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر إنشاء التقرير.");
    } finally {
      setSaving("");
    }
  }

  async function shareReport(reportId: string) {
    setSaving(reportId);
    setError("");
    try {
      const result = await requestJson("/api/reports/share", {
        method: "POST",
        body: JSON.stringify({ reportId, expiresInHours: 72 }),
      });
      setShareUrl(result.url);
      await loadProduct();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر إنشاء رابط المشاركة.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="care-center-shell">
      <section className="care-center-hero">
        <div>
          <span className="chip">رعاية منظمة</span>
          <h1>مركز الرعاية الكامل</h1>
          <p>كل دورة الرعاية في شاشة واحدة: تسجيل اليوم، النمو، التطعيمات، الأدوية، والتقارير الطبية.</p>
        </div>
        <div className="care-center-baby-card">
          {data?.profile?.avatarUrl ? <img alt={data.profile.babyName || "الطفل"} className="family-avatar family-avatar-lg" src={data.profile.avatarUrl} /> : <span className="care-icon care-icon-baby care-icon-lg" aria-hidden="true" />}
          <div>
            <strong>{data?.profile?.babyName || "طفل جديد"}</strong>
            <span>{data?.profile?.ageLabel || "استكمال ملف الطفل"}</span>
          </div>
          <button className="btn btn-soft-green" disabled={saving === "report"} onClick={createReport} type="button">
            إنشاء تقرير
          </button>
        </div>
      </section>

      {error ? <p className="command-alert">{error}</p> : null}

      <section className="care-center-stats">
        {stats.map(({ label, value, icon }) => (
          <article key={label}>
            <span className={`care-icon care-icon-${icon} care-icon-sm`} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>

      {careCommand ? (
        <section className={`care-command-board care-state-${careCommand.state}`}>
          <div className="care-score-dial" style={{ "--score": `${careCommand.score}%` } as CSSProperties}>
            <span>مؤشر الرعاية</span>
            <strong>{careCommand.scoreLabel}</strong>
          </div>
          <div className="care-command-copy">
            <span className="section-label">
              {careCommand.state === "stable" ? "مستقر" : careCommand.state === "watch" ? "متابعة" : "عاجل"}
            </span>
            <h2>{careCommand.title}</h2>
            <p>{careCommand.summary}</p>
            <div className="care-command-actions">
              {careCommand.actions.map((action) => (
                <span key={action}>{action}</span>
              ))}
            </div>
          </div>
          <div className="care-command-metrics">
            {careCommand.metrics.map((metric) => (
              <article key={metric.label}>
                <span className={`care-icon care-icon-${metric.icon} care-icon-sm`} aria-hidden="true" />
                <div>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                  <small>{metric.hint}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="care-center-layout">
        <aside className="care-center-tabs">
          {TABS.map((tab) => (
            <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
              <span className={`care-icon care-icon-${tab.icon} care-icon-sm`} aria-hidden="true" />
              <strong>{tab.label}</strong>
            </button>
          ))}
        </aside>

        <main className="care-center-panel">
          {loading ? <div className="empty-state-block">تحميل مركز الرعاية...</div> : null}

          {activeTab === "today" && data ? (
            <section className="care-center-grid">
              <form className="command-panel care-center-form" onSubmit={submitCareLog}>
                <div className="panel-title-row">
                  <div>
                    <span className="section-label">السجل اليومي</span>
                    <h2>تسجيل سريع</h2>
                  </div>
                </div>
                <div className="form-grid compact">
                  <label className="field-block">
                    <span>النوع</span>
                    <select value={careLogForm.type} onChange={(event) => setCareLogForm((prev) => ({ ...prev, type: event.target.value }))}>
                      {LOG_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>القيمة</span>
                    <input inputMode="decimal" value={careLogForm.value} onChange={(event) => setCareLogForm((prev) => ({ ...prev, value: event.target.value }))} placeholder="مثال 37.4" />
                  </label>
                  <label className="field-block">
                    <span>الوحدة</span>
                    <input value={careLogForm.unit} onChange={(event) => setCareLogForm((prev) => ({ ...prev, unit: event.target.value }))} placeholder="ml / C / min" />
                  </label>
                  <label className="field-block">
                    <span>الوقت</span>
                    <input type="datetime-local" value={careLogForm.occurredAt} onChange={(event) => setCareLogForm((prev) => ({ ...prev, occurredAt: event.target.value }))} />
                  </label>
                </div>
                <label className="field-block">
                  <span>ملاحظة</span>
                  <textarea rows={3} value={careLogForm.note} onChange={(event) => setCareLogForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="إدخال ملاحظة قصيرة عن الحالة..." />
                </label>
                <button className="btn btn-soft-green panel-action" disabled={saving === "care-log"} type="submit">حفظ السجل</button>
              </form>

              <section className="command-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="section-label">آخر اليوم</span>
                    <h2>المدخلات الأخيرة</h2>
                  </div>
                </div>
                <div className="care-center-list">
                  {data.careLogs.length ? data.careLogs.map((log) => (
                    <article key={log.id}>
                      <span className={`care-icon care-icon-${logTypeIcon(log.type)} care-icon-sm`} aria-hidden="true" />
                      <div>
                        <strong>{logTypeLabel(log.type)} {log.value ? `- ${log.value} ${log.unit || ""}` : ""}</strong>
                        <p>{log.note || "لا توجد ملاحظة"}</p>
                      </div>
                      <time>{formatWhen(log.occurredAt)}</time>
                    </article>
                  )) : <div className="empty-state-block">لا توجد مدخلات بعد. يمكن تسجيل أول حدث من النموذج.</div>}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "growth" && data ? (
            <section className="care-center-grid">
              <form className="command-panel care-center-form" onSubmit={submitGrowth}>
                <div className="panel-title-row"><div><span className="section-label">النمو</span><h2>قياسات النمو</h2></div></div>
                <div className="form-grid compact">
                  <label className="field-block"><span>الوزن كجم</span><input inputMode="decimal" value={growthForm.weightKg} onChange={(event) => setGrowthForm((prev) => ({ ...prev, weightKg: event.target.value }))} /></label>
                  <label className="field-block"><span>الطول سم</span><input inputMode="decimal" value={growthForm.heightCm} onChange={(event) => setGrowthForm((prev) => ({ ...prev, heightCm: event.target.value }))} /></label>
                  <label className="field-block"><span>محيط الرأس</span><input inputMode="decimal" value={growthForm.headCircumferenceCm} onChange={(event) => setGrowthForm((prev) => ({ ...prev, headCircumferenceCm: event.target.value }))} /></label>
                  <label className="field-block"><span>التاريخ</span><input type="datetime-local" value={growthForm.recordedAt} onChange={(event) => setGrowthForm((prev) => ({ ...prev, recordedAt: event.target.value }))} /></label>
                </div>
                <label className="field-block"><span>ملاحظة</span><textarea rows={3} value={growthForm.note} onChange={(event) => setGrowthForm((prev) => ({ ...prev, note: event.target.value }))} /></label>
                <button className="btn btn-soft-green panel-action" disabled={saving === "growth"} type="submit">حفظ النمو</button>
              </form>
              <section className="command-panel">
                <div className="panel-title-row"><div><span className="section-label">الاتجاه</span><h2>آخر القياسات</h2></div></div>
                {growthInsight ? (
                  <div className="growth-insight-card">
                    <div className="growth-insight-head">
                      <span className="care-icon care-icon-baby care-icon-md" aria-hidden="true" />
                      <div>
                        <span className="section-label">تحليل النمو</span>
                        <h3>{growthInsight.headline}</h3>
                        <p>
                          آخر قياس: {growthInsight.latest?.weightKg || "-"} كجم، {growthInsight.latest?.heightCm || "-"} سم، محيط الرأس {growthInsight.latest?.headCircumferenceCm || "-"} سم.
                        </p>
                      </div>
                    </div>
                    <div className="growth-chart" aria-label="منحنى الوزن">
                      <svg role="img" viewBox="0 0 320 120">
                        <line x1="18" x2="304" y1="96" y2="96" />
                        <line x1="18" x2="18" y1="18" y2="96" />
                        {growthInsight.path ? <path d={growthInsight.path} /> : null}
                        {growthInsight.points.map((point) => (
                          <g key={`${point.date}-${point.label}`}>
                            <circle cx={point.x} cy={point.y} r="4.5" />
                            <text x={point.x} y={point.y - 10}>{point.label}</text>
                          </g>
                        ))}
                      </svg>
                      <div className="growth-points">
                        {growthInsight.points.slice(-4).map((point) => (
                          <span key={`${point.date}-${point.label}`}>{point.date}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="growth-ruler">
                  {data.growthRecords.length ? data.growthRecords.map((record) => (
                    <article key={record.id}>
                      <strong>{record.weightKg || "-"} كجم</strong>
                      <span>{record.heightCm || "-"} سم</span>
                      <small>{formatWhen(record.recordedAt)}</small>
                      <p>{record.note}</p>
                    </article>
                  )) : <div className="empty-state-block">يمكن إضافة أول قياس نمو للطفل.</div>}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "vaccines" && data ? (
            <section className="care-center-grid">
              <form className="command-panel care-center-form" onSubmit={submitVaccine}>
                <div className="panel-title-row"><div><span className="section-label">التطعيمات</span><h2>تطعيم جديد</h2></div></div>
                <label className="field-block"><span>اسم التطعيم</span><input value={vaccineForm.vaccineName} onChange={(event) => setVaccineForm((prev) => ({ ...prev, vaccineName: event.target.value }))} /></label>
                <label className="field-block"><span>الموعد</span><input type="datetime-local" value={vaccineForm.dueDate} onChange={(event) => setVaccineForm((prev) => ({ ...prev, dueDate: event.target.value }))} /></label>
                <label className="field-block"><span>ملاحظات</span><textarea rows={3} value={vaccineForm.notes} onChange={(event) => setVaccineForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
                <button className="btn btn-soft-green panel-action" disabled={saving === "vaccine"} type="submit">إضافة تطعيم</button>
              </form>
              <section className="command-panel">
                <div className="panel-title-row"><div><span className="section-label">الجدول</span><h2>جدول التطعيمات</h2></div></div>
                <div className="vaccine-overview">
                  {[
                    ["مكتمل", vaccineOverview.completed, "complete"],
                    ["متأخر", vaccineOverview.late, "late"],
                    ["قريب", vaccineOverview.soon, "soon"],
                    ["مجدول", vaccineOverview.due, "due"],
                  ].map(([label, value, state]) => (
                    <article className={`vaccine-state-${state}`} key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </article>
                  ))}
                </div>
                {vaccineOverview.next.length ? (
                  <div className="vaccine-mini-calendar">
                    {vaccineOverview.next.map((item) => {
                      const state = vaccineState(item);
                      return (
                        <article className={`vaccine-state-${state.className}`} key={item.id}>
                          <span>{formatShortDate(item.dueDate)}</span>
                          <strong>{item.vaccineName}</strong>
                          <small>{state.label}</small>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
                <div className="care-center-list">
                  {data.vaccinationRecords.length ? data.vaccinationRecords.map((item) => (
                    <article key={item.id}>
                      <span className="care-icon care-icon-bell care-icon-sm" aria-hidden="true" />
                      <div>
                        <strong>{item.vaccineName}</strong>
                        <p>{item.notes || (item.status === "COMPLETED" ? "تم التطعيم" : "في الانتظار")}</p>
                      </div>
                      <div className="mini-action-stack">
                        <time>{formatWhen(item.dueDate)}</time>
                        {item.status !== "COMPLETED" ? <button className="btn btn-secondary" disabled={saving === item.id} onClick={() => void completeVaccine(item.id)} type="button">تم</button> : <span className="soft-pill">مكتمل</span>}
                        <span className={`vaccine-list-state vaccine-state-${vaccineState(item).className}`}>{vaccineState(item).label}</span>
                      </div>
                    </article>
                  )) : <div className="empty-state-block">لا توجد تطعيمات مسجلة بعد.</div>}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "meds" && data ? (
            <section className="care-center-grid">
              <form className="command-panel care-center-form" onSubmit={submitMedication}>
                <div className="panel-title-row"><div><span className="section-label">الأدوية</span><h2>دواء جديد</h2></div></div>
                <div className="form-grid compact">
                  <label className="field-block"><span>اسم الدواء</span><input value={medicationForm.name} onChange={(event) => setMedicationForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
                  <label className="field-block"><span>الجرعة</span><input value={medicationForm.dosage} onChange={(event) => setMedicationForm((prev) => ({ ...prev, dosage: event.target.value }))} /></label>
                  <label className="field-block"><span>التكرار</span><input value={medicationForm.frequency} onChange={(event) => setMedicationForm((prev) => ({ ...prev, frequency: event.target.value }))} /></label>
                  <label className="field-block"><span>أول جرعة</span><input type="datetime-local" value={medicationForm.firstDoseAt} onChange={(event) => setMedicationForm((prev) => ({ ...prev, firstDoseAt: event.target.value }))} /></label>
                </div>
                <label className="field-block"><span>تعليمات</span><textarea rows={3} value={medicationForm.instructions} onChange={(event) => setMedicationForm((prev) => ({ ...prev, instructions: event.target.value }))} /></label>
                <button className="btn btn-soft-green panel-action" disabled={saving === "medication"} type="submit">حفظ الدواء</button>
              </form>
              <section className="command-panel">
                <div className="panel-title-row"><div><span className="section-label">الجرعات</span><h2>الأدوية والجرعات</h2></div></div>
                {medicationInsight ? (
                  <div className="med-adherence-panel">
                    <div>
                      <span className="section-label">سلامة الدواء</span>
                      <h3>{medicationInsight.adherenceLabel}</h3>
                      <p>يعرض الجرعات التي تم تسجيل حالتها فقط، ولا يفترض الالتزام بدون بيانات محفوظة.</p>
                    </div>
                    <div className="adherence-track" aria-label="نسبة الالتزام">
                      <span style={{ width: `${medicationInsight.adherence ?? 0}%` }} />
                    </div>
                    <div className="med-mini-stats">
                      <span>تمت: {medicationInsight.taken}</span>
                      <span>تخطي: {medicationInsight.skipped}</span>
                      <span>مجدولة: {medicationInsight.scheduled}</span>
                    </div>
                  </div>
                ) : null}
                <div className="care-center-list">
                  {data.medications.length ? data.medications.map((medication) => (
                    <article key={medication.id}>
                      <span className="care-icon care-icon-stethoscope care-icon-sm" aria-hidden="true" />
                      <div>
                        <strong>{medication.name} - {medication.dosage}</strong>
                        <p>{medication.frequency} {medication.instructions ? `- ${medication.instructions}` : ""}</p>
                        <div className="dose-actions">
                          {medication.doses.map((dose) => (
                            <div className="dose-action-row" key={dose.id}>
                              <span>{formatWhen(dose.scheduledFor)}</span>
                              {dose.status === "SCHEDULED" ? (
                                <div className="dose-action-buttons">
                                  <button className="btn btn-soft-green" disabled={saving === dose.id} onClick={() => void updateDose(dose.id, "TAKEN")} type="button">تمت</button>
                                  <button className="btn btn-secondary" disabled={saving === dose.id} onClick={() => void updateDose(dose.id, "SKIPPED")} type="button">تخطي</button>
                                </div>
                              ) : (
                                <strong className={`dose-status dose-status-${dose.status.toLowerCase()}`}>{doseStatusLabel(dose.status)}</strong>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  )) : <div className="empty-state-block">لا توجد أدوية نشطة الآن.</div>}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "reports" && data ? (
            <section className="care-center-grid one-column">
              <section className="command-panel">
                <div className="panel-title-row">
                  <div><span className="section-label">التقارير</span><h2>تقارير محفوظة ومشاركة آمنة</h2></div>
                  <button className="btn btn-soft-green" disabled={saving === "report"} onClick={createReport} type="button">تقرير جديد</button>
                </div>
                {shareUrl ? <p className="share-url-box">{shareUrl}</p> : null}
                <div className="doctor-mode-grid">
                  <article>
                    <span className="care-icon care-icon-stethoscope care-icon-sm" aria-hidden="true" />
                    <div>
                      <strong>وضع الطبيب</strong>
                      <p>{data.profile?.pediatricianName || "إضافة اسم الطبيب من الملف"} {data.profile?.pediatricianPhone ? `- ${data.profile.pediatricianPhone}` : ""}</p>
                    </div>
                  </article>
                  <article>
                    <span className="care-icon care-icon-alert care-icon-sm" aria-hidden="true" />
                    <div>
                      <strong>طوارئ</strong>
                      <p>{data.profile?.emergencyPhone || "رقم الطوارئ غير محفوظ بعد"}</p>
                    </div>
                  </article>
                  <article>
                    <span className="care-icon care-icon-clock care-icon-sm" aria-hidden="true" />
                    <div>
                      <strong>رابط 72 ساعة</strong>
                      <p>{data.doctorReports.length} تقارير جاهزة للمشاركة الآمنة.</p>
                    </div>
                  </article>
                </div>
                <div className="care-center-list">
                  {data.doctorReports.length ? data.doctorReports.map((report) => (
                    <article key={report.id}>
                      <span className="care-icon care-icon-report care-icon-sm" aria-hidden="true" />
                      <div>
                        <strong>{report.title}</strong>
                        <p>{report.summary}</p>
                      </div>
                      <div className="mini-action-stack">
                        <time>{formatWhen(report.createdAt)}</time>
                        <button className="btn btn-secondary" disabled={saving === report.id} onClick={() => void shareReport(report.id)} type="button">رابط طبيب</button>
                      </div>
                    </article>
                  )) : <div className="empty-state-block">أنشئي أول تقرير طبي من الزر بالأعلى.</div>}
                </div>
              </section>
            </section>
          ) : null}

        </main>
      </section>
    </div>
  );
}
