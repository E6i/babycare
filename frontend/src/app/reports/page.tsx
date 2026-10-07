import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SEVERITY_LABELS,
  TRIAGE_LABELS,
  doctorReportText,
  eventMetadata,
  formatClassLabel,
  formatDateOnly,
  formatDateTime,
  formatSignalQuality,
  formatTimelineEventType,
  latestAssessment,
  latestCryEvent,
  profileCompleteness,
  profileName,
  topPredictions,
} from "@/lib/care-report";
import { formatAgeLabel } from "@/lib/baby-utils";
import { ReportActions } from "@/components/report-actions";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ReportsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const profile = await getActiveBabyProfile(user.id);
  const [timeline, reminders] = await Promise.all([
    prisma.timelineEvent.findMany({
      where: scopedBabyWhere(user.id, profile?.id),
      orderBy: { createdAt: "desc" },
      take: 16,
    }),
    prisma.reminder.findMany({
      where: scopedBabyWhere(user.id, profile?.id),
      orderBy: { scheduledFor: "asc" },
      take: 8,
    }),
  ]);

  const cryEvent = latestCryEvent(timeline);
  const cryMeta = eventMetadata(cryEvent);
  const assessment = latestAssessment(timeline);
  const predictions = topPredictions(cryEvent);
  const reportText = doctorReportText({ profile, timeline, reminders, assessment });
  const completeness = profileCompleteness(profile);
  const isUrgent = assessment?.triage === "URGENT_NOW" || assessment?.severity === "CRITICAL";
  const generatedAt = new Date();
  const signalQuality = formatSignalQuality(typeof cryMeta.signalQuality === "string" ? cryMeta.signalQuality : null);
  const confidence = typeof cryMeta.confidence === "number" ? `${Math.round(cryMeta.confidence * 100)}%` : "غير محددة";
  const reportFileName = `smart-child-care-${profileName(profile)}-${generatedAt.toISOString().slice(0, 10)}`;
  const explanationItems = assessment?.explainability?.length
    ? assessment.explainability
    : ["يعرض التقرير أسباب القرار المتاحة من آخر تقييم ذكي وتحليل بكاء محفوظ."];

  return (
    <main className="care-command report-page" dir="rtl">
      <AppNav active="reports" className="dashboard-top-nav" />

      <section className="report-hero">
        <div>
          <span className="chip">تسليم طبي منظم</span>
          <h1>تقرير جاهز للطبيب</h1>
          <p>
            ملخص مرتب يجمع بيانات الطفل، آخر تقييم خطورة، تحليل البكاء، والأحداث المهمة لتقديم صورة واضحة بسرعة.
          </p>
        </div>
        <ReportActions fileName={reportFileName} reportText={reportText} />
      </section>

      {isUrgent ? (
        <section className="emergency-banner">
          <span className="care-icon care-icon-alert care-icon-md" aria-hidden="true" />
          <div>
            <strong>وضع طوارئ</strong>
            <p>التقييم الحالي يشير إلى خطورة عالية. يمكن استخدام التقرير مع التواصل الطبي العاجل.</p>
          </div>
        </section>
      ) : null}

      <section className="report-layout">
        <article className="doctor-report-card">
          <div className="report-card-head">
            <div>
              <span className="section-label">SuperMamy</span>
              <h2>ملخص حالة {profileName(profile)}</h2>
            </div>
            <span className={`severity-pill severity-${(assessment?.severity || "LOW").toLowerCase()}`}>
              {assessment ? SEVERITY_LABELS[assessment.severity] : "لا يوجد تقييم"}
            </span>
          </div>

          <div className="report-vitals">
            <div>
              <span>العمر</span>
              <strong>{formatAgeLabel(profile?.birthDate) || "غير محدد"}</strong>
            </div>
            <div>
              <span>اكتمال الملف</span>
              <strong>{completeness}%</strong>
            </div>
            <div>
              <span>درجة الخطورة</span>
              <strong>{assessment ? `${assessment.riskScore}/100` : "غير محدد"}</strong>
            </div>
            <div>
              <span>الفرز</span>
              <strong>{assessment ? TRIAGE_LABELS[assessment.triage] : "غير محدد"}</strong>
            </div>
          </div>

          <div className="report-section">
            <h3>بيانات الطفل</h3>
            <dl className="report-dl">
              <div><dt>تاريخ الميلاد</dt><dd>{formatDateOnly(profile?.birthDate)}</dd></div>
              <div><dt>النوع</dt><dd>{profile?.gender || "غير محدد"}</dd></div>
              <div><dt>الوزن</dt><dd>{profile?.weightKg ? `${profile.weightKg} كجم` : "غير محدد"}</dd></div>
              <div><dt>نمط الرضاعة</dt><dd>{profile?.feedingStyle || "غير محدد"}</dd></div>
              <div><dt>رقم طوارئ</dt><dd>{profile?.emergencyPhone || "غير محدد"}</dd></div>
            </dl>
            <p className="report-note">{profile?.medicalNotes || "لا توجد ملاحظات طبية مسجلة."}</p>
          </div>

          <div className="report-section">
            <h3>آخر تقييم ذكي</h3>
            <p className="report-note">{assessment?.headline || "لا يوجد تقييم خطورة حديث."}</p>
            <div className="report-chip-list">
              {(assessment?.reasons || ["يمكن تشغيل تقييم الأعراض من لوحة التحكم لإظهار أسباب القرار."]).slice(0, 5).map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
          </div>

          <div className="report-section">
            <h3>تفسير القرار</h3>
            <ol className="report-steps">
              {explanationItems.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>

          <div className="report-section">
            <h3>إجراءات مقترحة</h3>
            <ol className="report-steps">
              {(assessment?.actions || ["استكمال بيانات الطفل ثم بدء تقييم سريع أو تحليل صوت من المحادثة."]).slice(0, 5).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
        </article>

        <aside className="report-side">
          <section className="command-panel">
            <div className="panel-title-row">
              <div className="panel-title-with-icon">
                <span className="care-icon care-icon-audio care-icon-md" aria-hidden="true" />
                <div>
                  <span className="section-label">تحليل البكاء</span>
                  <h3>{cryEvent ? formatClassLabel(String(cryMeta.predictedClass || "")) : "لا يوجد تحليل"}</h3>
                </div>
              </div>
            </div>
            <div className="prediction-list">
              {(predictions.length ? predictions : [{ label: "uncertain", score: 0 }]).slice(0, 3).map((prediction) => (
                <div className="prediction-row" key={prediction.label}>
                  <span>{formatClassLabel(prediction.label)}</span>
                  <div className="prediction-track"><i style={{ width: `${Math.round(prediction.score * 100)}%` }} /></div>
                  <strong>{Math.round(prediction.score * 100)}%</strong>
                </div>
              ))}
            </div>
            <div className="report-signal-grid">
              <div>
                <span>ثقة النموذج</span>
                <strong>{confidence}</strong>
              </div>
              <div>
                <span>جودة الإشارة</span>
                <strong>{signalQuality}</strong>
              </div>
            </div>
          </section>

          <section className="command-panel">
            <div className="panel-title-row">
              <div>
                <span className="section-label">آخر الأحداث</span>
                <h3>سجل مختصر</h3>
              </div>
            </div>
            <div className="report-mini-timeline">
              {timeline.slice(0, 5).map((event) => (
                <article key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{formatDateTime(event.createdAt)}</span>
                  <p>{event.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="pdf-report-sheet" aria-label="نسخة PDF منظمة">
        <header className="pdf-report-head">
          <div>
            <span>SuperMamy</span>
            <h1>تقرير طبي منظم</h1>
            <p>تقرير موجز ومنظم لاستخدامه أثناء التواصل مع طبيب الأطفال.</p>
          </div>
          <div>
            <strong>{profileName(profile)}</strong>
            <span>{formatDateTime(generatedAt)}</span>
          </div>
        </header>

        <section className="pdf-summary-band">
          <article>
            <span>درجة الخطورة</span>
            <strong>{assessment ? `${assessment.riskScore}/100` : "غير محدد"}</strong>
          </article>
          <article>
            <span>مستوى الفرز</span>
            <strong>{assessment ? TRIAGE_LABELS[assessment.triage] : "غير محدد"}</strong>
          </article>
          <article>
            <span>تحليل البكاء</span>
            <strong>{cryEvent ? formatClassLabel(String(cryMeta.predictedClass || "")) : "لا يوجد"}</strong>
          </article>
          <article>
            <span>جودة الإشارة</span>
            <strong>{signalQuality}</strong>
          </article>
        </section>

        <section className="pdf-report-section">
          <h2>بيانات الطفل</h2>
          <dl>
            <div><dt>العمر</dt><dd>{formatAgeLabel(profile?.birthDate) || "غير محدد"}</dd></div>
            <div><dt>تاريخ الميلاد</dt><dd>{formatDateOnly(profile?.birthDate)}</dd></div>
            <div><dt>النوع</dt><dd>{profile?.gender || "غير محدد"}</dd></div>
            <div><dt>الوزن</dt><dd>{profile?.weightKg ? `${profile.weightKg} كجم` : "غير محدد"}</dd></div>
            <div><dt>نمط الرضاعة</dt><dd>{profile?.feedingStyle || "غير محدد"}</dd></div>
            <div><dt>رقم الطوارئ</dt><dd>{profile?.emergencyPhone || "غير محدد"}</dd></div>
            <div><dt>طبيب الأطفال</dt><dd>{profile?.pediatricianName || "غير محدد"}</dd></div>
            <div><dt>هاتف الطبيب</dt><dd>{profile?.pediatricianPhone || "غير محدد"}</dd></div>
          </dl>
          <p>{profile?.medicalNotes || "لا توجد ملاحظات طبية مسجلة."}</p>
        </section>

        <section className="pdf-report-section">
          <h2>ملخص التقييم والتفسير</h2>
          <p>{assessment?.headline || "لا يوجد تقييم خطورة حديث."}</p>
          <div className="pdf-two-column">
            <div>
              <h3>أسباب القرار</h3>
              <ul>
                {(assessment?.reasons || ["لا توجد أسباب مسجلة."]).slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
            <div>
              <h3>تفسير القرار</h3>
              <ul>
                {explanationItems.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="pdf-report-section">
          <h2>الإجراءات المقترحة والمتابعة</h2>
          <div className="pdf-two-column">
            <div>
              <h3>إجراءات مقترحة</h3>
              <ol>
                {(assessment?.actions || ["استكمال بيانات الطفل ثم تشغيل تقييم سريع."]).slice(0, 5).map((action) => <li key={action}>{action}</li>)}
              </ol>
            </div>
            <div>
              <h3>التذكيرات القادمة</h3>
              <ul>
                {(reminders.length ? reminders.slice(0, 5) : [{ id: "none", title: "لا توجد تذكيرات محفوظة", message: "", scheduledFor: generatedAt }]).map((reminder) => (
                  <li key={reminder.id}>
                    <strong>{reminder.title}</strong>
                    {reminder.message ? ` - ${reminder.message}` : ""} {reminder.scheduledFor ? `(${formatDateTime(reminder.scheduledFor)})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="pdf-report-section">
          <h2>آخر الأحداث المسجلة</h2>
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>النوع</th>
                <th>الحدث</th>
                <th>الملخص</th>
              </tr>
            </thead>
            <tbody>
              {timeline.slice(0, 6).map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.createdAt)}</td>
                  <td>{formatTimelineEventType(event.type)}</td>
                  <td>{event.title}</td>
                  <td>{event.summary}</td>
                </tr>
              ))}
              {timeline.length === 0 ? (
                <tr>
                  <td colSpan={4}>لا توجد أحداث محفوظة.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <footer className="pdf-report-foot">
          التقرير يساعد في تنظيم المعلومات والفرز والمتابعة، ولا يمثل تشخيصًا طبيًا نهائيًا.
        </footer>
      </section>
    </main>
  );
}
