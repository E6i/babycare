"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { toDateOnlyInput } from "@/lib/baby-utils";
import { formatCryClassLabel } from "@/lib/cry-classification";

type User = { id: string; name: string; email: string; avatarUrl?: string | null };
type ReminderChannel = "APP" | "EMAIL" | "WHATSAPP";
type ReminderStatus = "DRAFT" | "SCHEDULED" | "SENT" | "FAILED";
type TriageLevel = "HOME_CARE" | "WATCH_CLOSELY" | "PEDIATRICIAN_SOON" | "URGENT_NOW";
type SeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type DashboardView = "overview" | "analysis" | "care" | "records";
type CareIconName =
  | "baby"
  | "bottle"
  | "thermometer"
  | "stethoscope"
  | "audio"
  | "bell"
  | "clock"
  | "report"
  | "alert"
  | "diaper"
  | "moon";

type BabyProfile = {
  id?: string;
  babyName: string;
  avatarUrl: string;
  birthDate: string;
  gender: string;
  weightKg: string;
  feedingStyle: string;
  medicalNotes: string;
  emergencyPhone: string;
  preferredLanguage: string;
  ageLabel?: string;
};

type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  summary: string;
  severity: SeverityLevel;
  triage?: TriageLevel | null;
  riskScore?: number | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type Reminder = {
  id: string;
  title: string;
  message: string;
  channel: ReminderChannel;
  phoneNumber?: string | null;
  scheduledFor: string;
  status: ReminderStatus;
  errorMessage?: string | null;
};

type TopPrediction = { label: string; score: number };
type RiskAssessment = {
  riskScore: number;
  severity: SeverityLevel;
  triage: TriageLevel;
  headline: string;
  reasons: string[];
  actions: string[];
  explainability: string[];
};

const DEFAULT_PROFILE: BabyProfile = {
  babyName: "",
  avatarUrl: "",
  birthDate: "",
  gender: "",
  weightKg: "",
  feedingStyle: "",
  medicalNotes: "",
  emergencyPhone: "",
  preferredLanguage: "ar",
};

const DEFAULT_TRIAGE = {
  message: "",
  temperatureC: "",
  wetDiapers24h: "",
  cryingHours: "",
  poorFeeding: false,
  sleepIssue: false,
};

const DEFAULT_REMINDER = {
  title: "",
  message: "",
  channel: "APP" as ReminderChannel,
  email: "",
  scheduledFor: "",
};

const DASHBOARD_VIEWS: Array<{ id: DashboardView; label: string; icon: CareIconName; hint: string }> = [
  { id: "overview", label: "نظرة عامة", icon: "stethoscope", hint: "ملخص الحالة والقرار القادم" },
  { id: "analysis", label: "تحليل البكاء", icon: "audio", hint: "الصوت والتقييم والتفسير" },
  { id: "care", label: "خطة الرعاية", icon: "bell", hint: "ملف الطفل والتذكيرات" },
  { id: "records", label: "السجل", icon: "clock", hint: "كل القرارات محفوظة زمنيًا" },
];

const TRIAGE_COPY: Record<TriageLevel, { label: string; tone: string; summary: string }> = {
  HOME_CARE: { label: "رعاية منزلية", tone: "منخفض", summary: "الحالة مناسبة للمتابعة المنزلية مع مراقبة العلامات المهمة." },
  WATCH_CLOSELY: { label: "مراقبة قريبة", tone: "متوسط", summary: "يفضل تسجيل الأعراض خلال الساعات القادمة ومتابعة أي تغير." },
  PEDIATRICIAN_SOON: { label: "استشارة طبيب قريبًا", tone: "مرتفع", summary: "يفضل تجهيز ملخص الحالة والتواصل مع طبيب أطفال قريبًا." },
  URGENT_NOW: { label: "طوارئ الآن", tone: "حرج", summary: "اطلبي مساعدة طبية عاجلة عند وجود علامات خطورة واضحة." },
};

const SEVERITY_COPY: Record<SeverityLevel, string> = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "عال",
  CRITICAL: "حرج",
};

function triageBadge(triage?: TriageLevel | null) {
  return TRIAGE_COPY[triage || "HOME_CARE"].label;
}

function severityBadge(severity?: SeverityLevel | null) {
  return SEVERITY_COPY[severity || "LOW"];
}

function statusClass(value?: string | null) {
  return (value || "LOW").toLowerCase();
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatReminderWhen(value: string) {
  return new Date(value).toLocaleString("ar-EG", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function formatPredictionLabel(label: string) {
  return formatCryClassLabel(label);
}

function getAssessmentFromAnyEvent(event?: TimelineEvent | null) {
  return (
    (event?.metadata?.riskAssessment as RiskAssessment | undefined) ||
    (event?.metadata?.assessment as RiskAssessment | undefined)
  );
}

function getTopPredictions(event?: TimelineEvent | null) {
  return (event?.metadata?.topPredictions as TopPrediction[] | undefined) || [];
}

function getConfidence(event?: TimelineEvent | null) {
  const value = event?.metadata?.confidence;
  return typeof value === "number" ? value : null;
}

function getSignalQuality(event?: TimelineEvent | null) {
  const value = typeof event?.metadata?.signalQuality === "string" ? event.metadata.signalQuality : "ready";
  if (value === "low_confidence") return "ثقة منخفضة";
  if (value === "good") return "إشارة جيدة";
  if (value === "medium") return "إشارة متوسطة";
  if (value === "ready") return "جاهز للتحليل";
  return value;
}

function profileCompleteness(profile: BabyProfile) {
  const fields = [profile.babyName, profile.avatarUrl, profile.birthDate, profile.gender, profile.weightKg, profile.feedingStyle, profile.emergencyPhone, profile.medicalNotes];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function carePlanItems(assessment: RiskAssessment | null, profile: BabyProfile) {
  const defaults = [
    "تسجيل الرضاعة والحرارة والحفاضات في نفس المكان.",
    "بدء تحليل صوت أو تقييم سريع عند ظهور بكاء غير معتاد.",
    "استخدام التذكيرات لمتابعة الحالة بدل الاعتماد على الذاكرة.",
  ];
  if (!assessment) return profile.babyName ? defaults : ["استكمال ملف الطفل لبدء خطة رعاية أدق.", ...defaults.slice(1)];
  return assessment.actions.length > 0 ? assessment.actions.slice(0, 4) : defaults;
}

function reminderIcon(title: string, channel: ReminderChannel): CareIconName {
  if (channel === "EMAIL") return "report";
  if (/حرارة|temperature/i.test(title)) return "thermometer";
  if (/رضاعة|رضعه|feeding/i.test(title)) return "bottle";
  if (/حفاض|diaper/i.test(title)) return "diaper";
  return "bell";
}

function CareIcon({ name, size = "md" }: { name: CareIconName; size?: "sm" | "md" | "lg" | "xl" }) {
  return <span aria-hidden="true" className={`care-icon care-icon-${name} care-icon-${size}`} />;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-block">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function DashboardClient({ user }: { user: User }) {
  const [profile, setProfile] = useState<BabyProfile>(DEFAULT_PROFILE);
  const [children, setChildren] = useState<BabyProfile[]>([]);
  const [parentAvatarUrl, setParentAvatarUrl] = useState(user.avatarUrl || "");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timeline24h, setTimeline24h] = useState<TimelineEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [stats, setStats] = useState({
    conversationCount: 0,
    messageCount: 0,
    timelineCount: 0,
    latestRiskScore: null as number | null,
    latestTriage: null as TriageLevel | null,
  });
  const [latestAssessment, setLatestAssessment] = useState<RiskAssessment | null>(null);
  const [triageForm, setTriageForm] = useState(DEFAULT_TRIAGE);
  const [reminderForm, setReminderForm] = useState(DEFAULT_REMINDER);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [triageLoading, setTriageLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [dispatchingReminders, setDispatchingReminders] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.user?.avatarUrl !== undefined) {
      setParentAvatarUrl(data.user.avatarUrl || "");
    }
    const mappedChildren = (data.children || []).map((child: BabyProfile & { birthDate?: string | null }) => ({
      id: child.id,
      babyName: child.babyName || "",
      avatarUrl: child.avatarUrl || "",
      birthDate: toDateOnlyInput(child.birthDate || ""),
      gender: child.gender || "",
      weightKg: child.weightKg?.toString?.() || "",
      feedingStyle: child.feedingStyle || "",
      medicalNotes: child.medicalNotes || "",
      emergencyPhone: child.emergencyPhone || "",
      preferredLanguage: child.preferredLanguage || "ar",
      ageLabel: child.ageLabel || "",
    }));
    setChildren(mappedChildren);
    if (data.profile) {
      setProfile({
        id: data.profile.id,
        babyName: data.profile.babyName || "",
        avatarUrl: data.profile.avatarUrl || "",
        birthDate: toDateOnlyInput(data.profile.birthDate),
        gender: data.profile.gender || "",
        weightKg: data.profile.weightKg?.toString?.() || "",
        feedingStyle: data.profile.feedingStyle || "",
        medicalNotes: data.profile.medicalNotes || "",
        emergencyPhone: data.profile.emergencyPhone || "",
        preferredLanguage: data.profile.preferredLanguage || "ar",
        ageLabel: data.profile.ageLabel || "",
      });
    } else {
      setProfile(DEFAULT_PROFILE);
    }
    setTimeline(data.timeline || []);
    setTimeline24h(data.timeline24h || []);
    setReminders(data.reminders || []);
    setStats(data.stats);

    const insightEvent = (data.timeline || []).find((event: TimelineEvent) => getAssessmentFromAnyEvent(event));
    const assessmentFromTimeline = getAssessmentFromAnyEvent(insightEvent);
    if (assessmentFromTimeline) setLatestAssessment(assessmentFromTimeline);
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          parentAvatarUrl,
          weightKg: profile.weightKg ? Number(profile.weightKg) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الملف.");
      setProfile((prev) => ({ ...prev, id: data.profile.id, ageLabel: data.profile.ageLabel }));
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ الملف.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function selectChild(profileId: string) {
    setError("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeBabyProfileId: profileId, parentAvatarUrl }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "تعذر اختيار الطفل.");
      return;
    }
    await loadDashboard();
  }

  function createNewChild() {
    setProfile({ ...DEFAULT_PROFILE, preferredLanguage: "ar" });
    setActiveView("care");
  }

  async function saveAsNewChild() {
    setProfileSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          id: undefined,
          parentAvatarUrl,
          createNew: true,
          weightKg: profile.weightKg ? Number(profile.weightKg) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إضافة الطفل.");
      await loadDashboard();
      setActiveView("overview");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر إضافة الطفل.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function runTriage() {
    if (!triageForm.message.trim()) {
      setError("يرجى إدخال وصف الحالة أولًا.");
      return;
    }
    setTriageLoading(true);
    setError("");
    try {
      const response = await fetch("/api/risk/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: triageForm.message,
          temperatureC: triageForm.temperatureC ? Number(triageForm.temperatureC) : null,
          wetDiapers24h: triageForm.wetDiapers24h ? Number(triageForm.wetDiapers24h) : null,
          cryingHours: triageForm.cryingHours ? Number(triageForm.cryingHours) : null,
          poorFeeding: triageForm.poorFeeding,
          sleepIssue: triageForm.sleepIssue,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تنفيذ التقييم.");
      setLatestAssessment(data.assessment);
      await loadDashboard();
    } catch (triageError) {
      setError(triageError instanceof Error ? triageError.message : "تعذر تنفيذ التقييم.");
    } finally {
      setTriageLoading(false);
    }
  }

  async function createReminder(sendNow = false) {
    if (!reminderForm.title.trim() || !reminderForm.message.trim()) {
      setError("يرجى إدخال عنوان ورسالة للتذكير.");
      return;
    }
    setReminderSaving(true);
    setError("");
    try {
      const scheduledFor = reminderForm.scheduledFor
        ? new Date(reminderForm.scheduledFor).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reminderForm, scheduledFor, sendNow }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إنشاء التذكير.");
      setReminderForm(DEFAULT_REMINDER);
      await loadDashboard();
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : "تعذر إنشاء التذكير.");
    } finally {
      setReminderSaving(false);
    }
  }

  async function dispatchDueReminders() {
    setDispatchingReminders(true);
    setError("");
    try {
      const response = await fetch("/api/reminders/dispatch", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إرسال التذكيرات.");
      await loadDashboard();
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "تعذر إرسال التذكيرات.");
    } finally {
      setDispatchingReminders(false);
    }
  }

  const latestCryEvent = useMemo(() => timeline.find((event) => event.type === "CRY_ANALYSIS") || null, [timeline]);
  const latestRiskEvent = useMemo(() => timeline.find((event) => event.riskScore !== null && event.riskScore !== undefined) || null, [timeline]);
  const assessmentEvent = useMemo(() => timeline.find((event) => getAssessmentFromAnyEvent(event)) || null, [timeline]);
  const activeAssessment = latestAssessment || getAssessmentFromAnyEvent(assessmentEvent) || getAssessmentFromAnyEvent(latestRiskEvent) || null;
  const activeTriage = stats.latestTriage || activeAssessment?.triage || "HOME_CARE";
  const activeSeverity = activeAssessment?.severity || latestRiskEvent?.severity || "LOW";
  const activeRiskScore = Math.max(0, Math.min(100, stats.latestRiskScore ?? activeAssessment?.riskScore ?? 0));
  const activeViewInfo = DASHBOARD_VIEWS.find((view) => view.id === activeView) || DASHBOARD_VIEWS[0];
  const topPredictions = getTopPredictions(latestCryEvent);
  const confidence = getConfidence(latestCryEvent);
  const latestExplainability = (latestCryEvent?.metadata?.explainability as string[] | undefined) || activeAssessment?.explainability || [];
  const profileProgress = profileCompleteness(profile);
  const nextReminder = reminders.find((reminder) => reminder.status === "SCHEDULED") || reminders[0] || null;
  const planItems = carePlanItems(activeAssessment, profile);
  const triageInfo = TRIAGE_COPY[activeTriage];
  const latestReportEvent = useMemo(() => timeline.find((event) => event.type === "NOTE" && Boolean(event.metadata?.doctorReportId)) || null, [timeline]);
  const caseJourney = [
    {
      icon: "audio" as CareIconName,
      title: "مدخلات الحالة",
      copy: latestCryEvent ? "تم حفظ تحليل بكاء ضمن السجل." : stats.conversationCount > 0 ? "توجد محادثات محفوظة يمكن البناء عليها." : "يمكن البدء من المحادثة أو تحليل الصوت.",
      state: latestCryEvent || stats.conversationCount > 0 ? "done" : "pending",
    },
    {
      icon: "stethoscope" as CareIconName,
      title: "تقييم قابل للتفسير",
      copy: activeAssessment ? `${triageBadge(activeAssessment.triage)} بدرجة ${activeRiskScore}/100.` : "تشغيل تقييم الأعراض يوضح الأسباب والتوصية.",
      state: activeAssessment ? "done" : "pending",
    },
    {
      icon: "bell" as CareIconName,
      title: "خطة متابعة",
      copy: nextReminder ? `${nextReminder.title} - ${formatReminderWhen(nextReminder.scheduledFor)}` : "التذكيرات تحول القرار إلى متابعة عملية.",
      state: nextReminder ? "done" : "pending",
    },
    {
      icon: "report" as CareIconName,
      title: "تقرير الطبيب",
      copy: latestReportEvent ? "تم حفظ تقرير طبي قابل للمشاركة." : activeAssessment ? "التقرير جاهز للتصدير كـ PDF." : "يكتمل بعد وجود تقييم أو تحليل.",
      state: latestReportEvent || activeAssessment ? "done" : "pending",
    },
  ];

  function AvatarBubble({ src, label, size = "md" }: { src?: string | null; label: string; size?: "sm" | "md" | "lg" }) {
    return src ? (
      <img alt={label} className={`family-avatar family-avatar-${size}`} src={src} />
    ) : (
      <span className={`family-avatar family-avatar-${size} family-avatar-fallback`}>
        {label.trim().slice(0, 1) || "ط"}
      </span>
    );
  }

  function FamilySwitcher() {
    return (
      <section className="family-switcher" aria-label="اختيار الطفل">
        <article className="parent-profile-card">
          <AvatarBubble label={user.name} size="lg" src={parentAvatarUrl} />
          <div>
            <span className="section-label">حساب الأم</span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </article>
        <div className="kids-profile-row">
          {children.map((child) => (
            <button className={child.id === profile.id ? "active" : ""} key={child.id} onClick={() => child.id && void selectChild(child.id)} type="button">
              <AvatarBubble label={child.babyName || "طفل"} size="lg" src={child.avatarUrl} />
              <strong>{child.babyName || "طفل جديد"}</strong>
              <span>{child.ageLabel || "العمر غير محدد"}</span>
            </button>
          ))}
          <button className="add-child-profile" onClick={createNewChild} type="button">
            <span>+</span>
            <strong>إضافة طفل</strong>
            <small>ملف جديد</small>
          </button>
        </div>
      </section>
    );
  }

  function ViewHead() {
    return (
      <header className="dashboard-view-head">
        <div className="panel-title-with-icon">
          <CareIcon name={activeViewInfo.icon} size="md" />
          <div>
            <span className="section-label">لوحة التحكم</span>
            <h2>{activeViewInfo.label}</h2>
            <p>{activeViewInfo.hint}</p>
          </div>
        </div>
        <div className="dashboard-view-actions">
          <Link className="btn btn-soft-blue" href="/chat">
            فتح المحادثة
          </Link>
          <Link className="btn btn-secondary" href="/care-plan">
            خطة الرعاية
          </Link>
          <Link className="btn btn-secondary" href="/reports">
            تقرير الطبيب
          </Link>
        </div>
      </header>
    );
  }

  function RiskPanel() {
    return (
      <section className="command-panel overview-risk-card">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name={activeTriage === "URGENT_NOW" ? "alert" : "stethoscope"} size="md" />
            <div>
              <span className="section-label">تقييم الحالة</span>
              <h3>{triageBadge(activeTriage)}</h3>
            </div>
          </div>
          <span className={`triage-pill triage-${statusClass(activeTriage)}`}>{triageInfo.tone}</span>
        </div>
        <div className={`risk-meter severity-${statusClass(activeSeverity)}`} style={{ "--score": `${activeRiskScore}%` } as CSSProperties}>
          <div className="risk-meter-inner">
            <strong>{activeRiskScore}</strong>
            <span>من 100</span>
          </div>
        </div>
        <p className="risk-summary">{activeAssessment?.headline || triageInfo.summary}</p>
      </section>
    );
  }

  function Metrics() {
    const metricItems = [
      { icon: "baby" as CareIconName, label: "ملف الطفل", value: `${profileProgress}%`, note: profile.ageLabel || "العمر غير محدد" },
      { icon: "audio" as CareIconName, label: "المحادثات", value: stats.conversationCount, note: `${stats.messageCount} رسالة` },
      { icon: "clock" as CareIconName, label: "الخط الزمني", value: stats.timelineCount, note: "آخر نشاط محفوظ" },
      {
        icon: (nextReminder ? reminderIcon(nextReminder.title, nextReminder.channel) : "bell") as CareIconName,
        label: "التذكير القادم",
        value: nextReminder ? formatReminderWhen(nextReminder.scheduledFor) : "لا يوجد",
        note: nextReminder?.title || "أنشئ تذكير متابعة",
      },
    ];
    return (
      <div className="status-rail">
        {metricItems.map((item) => (
          <article className="metric-tile" key={item.label}>
            <CareIcon name={item.icon} size="md" />
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function CaseJourneyPanel() {
    return (
      <section className="command-panel case-journey-panel">
        <div className="panel-title-row">
          <div>
            <span className="section-label">رحلة الحالة</span>
            <h3>من البكاء إلى تقرير الطبيب</h3>
          </div>
          <span className="soft-pill">منتج متكامل</span>
        </div>
        <div className="case-journey-grid">
          {caseJourney.map((step, index) => (
            <article className={`case-journey-step state-${step.state}`} key={step.title}>
              <span className="journey-index">{index + 1}</span>
              <CareIcon name={step.icon} size="sm" />
              <div>
                <strong>{step.title}</strong>
                <p>{step.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function CryPanel() {
    const predictions = topPredictions.length > 0
      ? topPredictions
      : [{ label: "belly_pain", score: 0 }, { label: "discomfort", score: 0 }, { label: "hungry", score: 0 }];
    return (
      <section className="command-panel cry-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="audio" size="md" />
            <div>
              <span className="section-label">تحليل البكاء</span>
              <h3>{latestCryEvent ? formatPredictionLabel(String(latestCryEvent.metadata?.predictedClass || "")) : "جاهز للتحليل"}</h3>
            </div>
          </div>
          <span className="soft-pill">{getSignalQuality(latestCryEvent)}</span>
        </div>
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 34 }).map((_, index) => (
            <span key={index} style={{ "--bar": `${18 + ((index * 13) % 54)}%` } as CSSProperties} />
          ))}
        </div>
        <div className="confidence-row">
          <span>ثقة النموذج</span>
          <strong>{confidence !== null ? `${Math.round(confidence * 100)}%` : "لم يتم التحليل"}</strong>
        </div>
        <div className="prediction-list">
          {predictions.slice(0, 3).map((prediction) => (
            <div className="prediction-row" key={prediction.label}>
              <span>{formatPredictionLabel(prediction.label)}</span>
              <div className="prediction-track"><i style={{ width: `${Math.round(prediction.score * 100)}%` }} /></div>
              <strong>{Math.round(prediction.score * 100)}%</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function ExplainPanel() {
    return (
      <section className="command-panel explain-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="stethoscope" size="md" />
            <div>
              <span className="section-label">التفسير الذكي</span>
              <h3>لماذا هذه النتيجة؟</h3>
            </div>
          </div>
          <span className={`severity-pill severity-${statusClass(activeSeverity)}`}>{severityBadge(activeSeverity)}</span>
        </div>
        <div className="reason-list">
          {(activeAssessment?.reasons || ["شغّلي التقييم بعد إدخال وصف الحالة لرؤية أسباب القرار."]).slice(0, 4).map((reason) => (
            <div className="reason-chip" key={reason}>{reason}</div>
          ))}
        </div>
        <ol className="explain-list">
          {(latestExplainability.length > 0 ? latestExplainability : ["المنصة تجمع بين مدخلات النص، تحليل الصوت، وملف الطفل لإخراج تقييم قابل للتفسير."]).slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    );
  }

  function TriagePanel() {
    return (
      <section className="command-panel triage-form-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="thermometer" size="md" />
            <div>
              <span className="section-label">فرز سريع</span>
              <h3>اختبار الأعراض</h3>
            </div>
          </div>
          <span className="soft-pill">تقييم ذكي</span>
        </div>
        <FieldLabel label="وصف الحالة">
          <textarea rows={4} value={triageForm.message} onChange={(event) => setTriageForm((prev) => ({ ...prev, message: event.target.value }))} placeholder="مثال: بكاء مستمر بعد الرضاعة مع غازات..." />
        </FieldLabel>
        <div className="form-grid compact">
          <FieldLabel label="الحرارة">
            <input inputMode="decimal" value={triageForm.temperatureC} onChange={(event) => setTriageForm((prev) => ({ ...prev, temperatureC: event.target.value }))} placeholder="37.4" />
          </FieldLabel>
          <FieldLabel label="حفاضات/24 ساعة">
            <input inputMode="numeric" value={triageForm.wetDiapers24h} onChange={(event) => setTriageForm((prev) => ({ ...prev, wetDiapers24h: event.target.value }))} placeholder="6" />
          </FieldLabel>
          <FieldLabel label="ساعات البكاء">
            <input inputMode="decimal" value={triageForm.cryingHours} onChange={(event) => setTriageForm((prev) => ({ ...prev, cryingHours: event.target.value }))} placeholder="2" />
          </FieldLabel>
          <div className="toggle-stack">
            <label className="switch-line">
              <input checked={triageForm.poorFeeding} onChange={(event) => setTriageForm((prev) => ({ ...prev, poorFeeding: event.target.checked }))} type="checkbox" />
              <span>ضعف رضاعة</span>
            </label>
            <label className="switch-line">
              <input checked={triageForm.sleepIssue} onChange={(event) => setTriageForm((prev) => ({ ...prev, sleepIssue: event.target.checked }))} type="checkbox" />
              <span>اضطراب النوم</span>
            </label>
          </div>
        </div>
        <button className="btn btn-soft-green panel-action" disabled={triageLoading} onClick={runTriage} type="button">
          {triageLoading ? "جار التقييم..." : "تشغيل التقييم"}
        </button>
      </section>
    );
  }

  function PlanPanel() {
    return (
      <section className="command-panel care-plan-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="clock" size="md" />
            <div>
              <span className="section-label">خطة 24 ساعة</span>
              <h3>ما الذي نتابعه؟</h3>
            </div>
          </div>
          <span className="soft-pill">قابل للتنفيذ</span>
        </div>
        <div className="care-steps">
          {planItems.map((item, index) => (
            <article className="care-step" key={item}>
              <CareIcon name={(index === 0 ? "thermometer" : index === 1 ? "bottle" : "moon") as CareIconName} size="sm" />
              <p>{item}</p>
            </article>
          ))}
        </div>
        <p className="safety-note">المشروع يساعد في الفرز والمتابعة، ولا يستبدل الطبيب عند ظهور علامات خطورة.</p>
      </section>
    );
  }

  function TodayTimelinePanel() {
    const items = timeline24h.length > 0 ? timeline24h : timeline.slice(0, 3);
    return (
      <section className="command-panel today-timeline-panel">
        <div className="panel-title-row">
          <div>
            <span className="section-label">آخر 24 ساعة</span>
            <h3>{profile.babyName ? `نشاط ${profile.babyName}` : "نشاط الطفل"}</h3>
          </div>
          <span className="soft-pill">{timeline24h.length}</span>
        </div>
        <div className="today-timeline-list">
          {items.map((event) => (
            <article key={event.id}>
              <span className={`timeline-dot severity-${statusClass(event.severity)}`} />
              <div>
                <strong>{event.title}</strong>
                <small>{formatWhen(event.createdAt)}</small>
                <p>{event.summary}</p>
              </div>
            </article>
          ))}
          {items.length === 0 ? <p className="empty-copy">لا يوجد نشاط خلال آخر 24 ساعة.</p> : null}
        </div>
      </section>
    );
  }

  function ProfilePanel() {
    return (
      <section className="command-panel profile-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="baby" size="md" />
            <div>
              <span className="section-label">ملف الطفل</span>
              <h3>{profile.babyName || "بيانات الطفل"}</h3>
            </div>
          </div>
          <span className="soft-pill">{profile.ageLabel || "غير محدد"}</span>
        </div>
        <div className="form-grid">
          <FieldLabel label="اسم الطفل"><input value={profile.babyName} onChange={(event) => setProfile((prev) => ({ ...prev, babyName: event.target.value }))} /></FieldLabel>
          <FieldLabel label="صورة الطفل"><input value={profile.avatarUrl} onChange={(event) => setProfile((prev) => ({ ...prev, avatarUrl: event.target.value }))} placeholder="رابط صورة للطفل" /></FieldLabel>
          <FieldLabel label="تاريخ الميلاد"><input type="date" value={profile.birthDate} onChange={(event) => setProfile((prev) => ({ ...prev, birthDate: event.target.value }))} /></FieldLabel>
          <FieldLabel label="النوع"><input value={profile.gender} onChange={(event) => setProfile((prev) => ({ ...prev, gender: event.target.value }))} /></FieldLabel>
          <FieldLabel label="الوزن كجم"><input inputMode="decimal" value={profile.weightKg} onChange={(event) => setProfile((prev) => ({ ...prev, weightKg: event.target.value }))} /></FieldLabel>
          <FieldLabel label="صورة الأم"><input value={parentAvatarUrl} onChange={(event) => setParentAvatarUrl(event.target.value)} placeholder="رابط صورة الأم" /></FieldLabel>
        </div>
        <FieldLabel label="نمط الرضاعة"><input value={profile.feedingStyle} onChange={(event) => setProfile((prev) => ({ ...prev, feedingStyle: event.target.value }))} /></FieldLabel>
        <FieldLabel label="رقم طوارئ"><input value={profile.emergencyPhone} onChange={(event) => setProfile((prev) => ({ ...prev, emergencyPhone: event.target.value }))} /></FieldLabel>
        <FieldLabel label="ملاحظات طبية"><textarea rows={4} value={profile.medicalNotes} onChange={(event) => setProfile((prev) => ({ ...prev, medicalNotes: event.target.value }))} /></FieldLabel>
        <div className="profile-action-row">
          <button className="btn btn-soft-green" disabled={profileSaving} onClick={saveProfile} type="button">
            {profileSaving ? "جار الحفظ..." : "حفظ الملف"}
          </button>
          <button className="btn btn-secondary" disabled={profileSaving} onClick={saveAsNewChild} type="button">
            حفظ كطفل جديد
          </button>
        </div>
      </section>
    );
  }

  function RemindersPanel() {
    return (
      <section className="command-panel reminders-panel">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="bell" size="md" />
            <div>
              <span className="section-label">التذكيرات</span>
              <h3>متابعة بدون نسيان</h3>
            </div>
          </div>
          <span className="soft-pill">{reminders.length}</span>
        </div>
        <div className="reminder-list">
          {reminders.slice(0, 3).map((reminder) => (
            <article className="reminder-item" key={reminder.id}>
              <CareIcon name={reminderIcon(reminder.title, reminder.channel)} size="sm" />
              <div>
                <strong>{reminder.title}</strong>
                <span>{formatReminderWhen(reminder.scheduledFor)}</span>
              </div>
              <i>{reminder.channel === "EMAIL" ? "بريد" : "تطبيق"}</i>
            </article>
          ))}
          {reminders.length === 0 ? <p className="empty-copy">لا توجد تذكيرات بعد.</p> : null}
        </div>
        <div className="reminder-compose">
          <FieldLabel label="العنوان"><input value={reminderForm.title} onChange={(event) => setReminderForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="قياس الحرارة" /></FieldLabel>
          <FieldLabel label="الرسالة"><textarea rows={3} value={reminderForm.message} onChange={(event) => setReminderForm((prev) => ({ ...prev, message: event.target.value }))} placeholder="إدخال المطلوب متابعته..." /></FieldLabel>
          <div className="form-grid compact">
            <FieldLabel label="القناة">
              <select value={reminderForm.channel} onChange={(event) => setReminderForm((prev) => ({ ...prev, channel: event.target.value as ReminderChannel }))}>
                <option value="APP">داخل التطبيق</option>
                <option value="EMAIL">البريد الإلكتروني</option>
              </select>
            </FieldLabel>
            <FieldLabel label="الموعد"><input type="datetime-local" value={reminderForm.scheduledFor} onChange={(event) => setReminderForm((prev) => ({ ...prev, scheduledFor: event.target.value }))} /></FieldLabel>
          </div>
          {reminderForm.channel === "EMAIL" ? (
            <FieldLabel label="البريد المرسل إليه"><input value={reminderForm.email} onChange={(event) => setReminderForm((prev) => ({ ...prev, email: event.target.value }))} placeholder={user.email} /></FieldLabel>
          ) : null}
          <div className="split-actions">
            <button className="btn btn-secondary" disabled={reminderSaving} onClick={() => void createReminder(false)} type="button">حفظ</button>
            <button className="btn btn-soft-green" disabled={reminderSaving} onClick={() => void createReminder(true)} type="button">إرسال الآن</button>
            <button className="btn btn-secondary" disabled={dispatchingReminders} onClick={dispatchDueReminders} type="button">{dispatchingReminders ? "جار التنفيذ..." : "إرسال المستحق"}</button>
          </div>
        </div>
      </section>
    );
  }

  function TimelinePanel() {
    return (
      <section className="command-panel timeline-panel-v2">
        <div className="panel-title-row">
          <div className="panel-title-with-icon">
            <CareIcon name="clock" size="md" />
            <div>
              <span className="section-label">الخط الزمني</span>
              <h3>قرارات وتحليلات محفوظة</h3>
            </div>
          </div>
          <span className="soft-pill">{timeline.length}</span>
        </div>
        <div className="timeline-v2-list">
          {timeline.map((event) => (
            <article className="timeline-v2-item" key={event.id}>
              <div className={`timeline-dot severity-${statusClass(event.severity)}`} />
              <div>
                <div className="timeline-v2-top">
                  <strong>{event.title}</strong>
                  <time>{formatWhen(event.createdAt)}</time>
                </div>
                <p>{event.summary}</p>
                <div className="timeline-tags">
                  <span className={`severity-pill severity-${statusClass(event.severity)}`}>{severityBadge(event.severity)}</span>
                  {event.triage ? <span className={`triage-pill triage-${statusClass(event.triage)}`}>{triageBadge(event.triage)}</span> : null}
                  {event.riskScore !== null && event.riskScore !== undefined ? <span className="soft-pill">درجة {event.riskScore}</span> : null}
                </div>
              </div>
            </article>
          ))}
          {timeline.length === 0 ? (
            <div className="empty-state-block">
              <strong>لا يوجد نشاط بعد</strong>
              <p>ابدئي بتحليل صوت من المحادثة أو تقييم سريع لتكوين أول خطة متابعة.</p>
              <Link className="btn btn-soft-blue" href="/chat">فتح المحادثة</Link>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="care-command dashboard-app" dir="rtl">
      <AppNav active="dashboard" className="dashboard-top-nav" />

      {error ? <p className="command-alert">{error}</p> : null}

      <section className="dashboard-intro">
        <div className="dashboard-intro-copy">
          <span className="chip">SuperMamy</span>
          <h1>لوحة الرعاية الذكية</h1>
          <p>{profile.babyName ? `متابعة ${profile.babyName} بشكل منظم وواضح.` : `مرحبًا ${user.name}، يمكن بدء تنظيم حالة الطفل.`}</p>
        </div>
        <div className="dashboard-baby-card">
          <AvatarBubble label={profile.babyName || "طفل"} size="lg" src={profile.avatarUrl} />
          <div>
            <strong>{profile.babyName || "طفل جديد"}</strong>
            <span>{profile.ageLabel || "بدء ملف الطفل"}</span>
          </div>
          <Link className="btn btn-soft-green" href="/chat">بدء متابعة</Link>
        </div>
      </section>

      <FamilySwitcher />

      <section className="dashboard-layout">
        <aside className="dashboard-rail">
          {DASHBOARD_VIEWS.map((view) => (
            <button className={activeView === view.id ? "active" : ""} key={view.id} onClick={() => setActiveView(view.id)} type="button">
              <CareIcon name={view.icon} size="sm" />
              <div>
                <strong>{view.label}</strong>
                <span>{view.hint}</span>
              </div>
            </button>
          ))}
        </aside>

        <main className="dashboard-view">
          <ViewHead />

          {activeView === "overview" ? (
            <div className="dashboard-view-grid overview-view">
              <RiskPanel />
              <section className="overview-stack">
                <Metrics />
                <CaseJourneyPanel />
                <section className="command-panel">
                  <div className="panel-title-row">
                    <div>
                      <span className="section-label">الإجراء القادم</span>
                      <h3>{nextReminder?.title || planItems[0]}</h3>
                    </div>
                    <CareIcon name={nextReminder ? reminderIcon(nextReminder.title, nextReminder.channel) : "bell"} size="md" />
                  </div>
                  <p className="risk-summary">{nextReminder?.message || "ابدئي من المحادثة أو التقييم السريع لتكوين متابعة منظمة حسب حالة الطفل."}</p>
                </section>
                <TodayTimelinePanel />
                <section className={`command-panel emergency-mode-card severity-${statusClass(activeSeverity)}`}>
                  <div className="panel-title-row">
                    <div className="panel-title-with-icon">
                      <CareIcon name={activeRiskScore >= 50 ? "alert" : "report"} size="md" />
                      <div>
                        <span className="section-label">وضع الطوارئ</span>
                        <h3>{activeRiskScore >= 50 ? "الحاجة إلى مساعدة طبية" : "تقرير جاهز عند الحاجة"}</h3>
                      </div>
                    </div>
                  </div>
                  <p className="risk-summary">
                    {activeRiskScore >= 50
                      ? "درجة الخطورة مرتفعة. يفضل فتح التقرير ومشاركته مع الطبيب أو قسم الطوارئ."
                      : "عند استمرار الأعراض، يجمع التقرير آخر تحليل وتقييم وتذكيرات بشكل منظم."}
                  </p>
                  <div className="emergency-actions">
                    <Link className="btn btn-soft-green" href="/reports">فتح التقرير</Link>
                    <Link className="btn btn-secondary" href="/care-center">فتح مركز الرعاية</Link>
                  </div>
                </section>
              </section>
            </div>
          ) : null}

          {activeView === "analysis" ? (
            <div className="dashboard-view-grid analysis-view">
              <CryPanel />
              <ExplainPanel />
              {TriagePanel()}
            </div>
          ) : null}

          {activeView === "care" ? (
            <div className="dashboard-view-grid care-view">
              <PlanPanel />
              {ProfilePanel()}
              {RemindersPanel()}
            </div>
          ) : null}

          {activeView === "records" ? (
            <div className="dashboard-view-grid records-view">
              <TimelinePanel />
            </div>
          ) : null}
        </main>
      </section>
    </div>
  );
}
