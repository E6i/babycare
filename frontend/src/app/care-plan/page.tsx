/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TRIAGE_LABELS,
  carePlanItems,
  dailyCareBlocks,
  formatDateTime,
  latestAssessment,
  profileCompleteness,
  profileName,
} from "@/lib/care-report";
import { formatAgeLabel } from "@/lib/baby-utils";
import { getActiveBabyProfile, scopedBabyWhere } from "@/lib/active-baby";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function CarePlanPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const profile = await getActiveBabyProfile(user.id);
  const [timeline, reminders] = await Promise.all([
    prisma.timelineEvent.findMany({
      where: scopedBabyWhere(user.id, profile?.id),
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.reminder.findMany({
      where: scopedBabyWhere(user.id, profile?.id),
      orderBy: { scheduledFor: "asc" },
      take: 10,
    }),
  ]);

  const assessment = latestAssessment(timeline);
  const blocks = dailyCareBlocks(profile, assessment, reminders);
  const planItems = carePlanItems(assessment, profile);
  const completeness = profileCompleteness(profile);
  const babyName = profileName(profile);

  return (
    <main className="care-command care-plan-page" dir="rtl">
      <AppNav active="care-plan" className="dashboard-top-nav" />

      <section className="care-plan-hero">
        <div>
          <span className="chip">خطة الرعاية اليومية</span>
          <h1>خطة رعاية يومية واضحة</h1>
          <p>تجميع عملي لكل ما يجب متابعته مع {babyName}: أعراض، تذكيرات، مؤشرات أمان، وخطوة القرار التالية.</p>
        </div>
        <div className="care-plan-profile">
          {profile?.avatarUrl ? <img alt={babyName} className="family-avatar family-avatar-lg" src={profile.avatarUrl} /> : <span className="care-icon care-icon-baby care-icon-lg" aria-hidden="true" />}
          <div>
            <strong>{babyName}</strong>
            <span>{formatAgeLabel(profile?.birthDate) || "العمر غير محدد"}</span>
          </div>
          <small>اكتمال الملف {completeness}%</small>
        </div>
      </section>

      <section className="care-plan-board">
        <article className="care-plan-status command-panel">
          <div className="panel-title-row">
            <div className="panel-title-with-icon">
              <span className="care-icon care-icon-stethoscope care-icon-md" aria-hidden="true" />
              <div>
                <span className="section-label">قرار اليوم</span>
                <h2>{assessment ? TRIAGE_LABELS[assessment.triage] : "بدء تقييم سريع"}</h2>
              </div>
            </div>
            <span className={`triage-pill triage-${(assessment?.triage || "HOME_CARE").toLowerCase()}`}>
              {assessment ? `${assessment.riskScore}/100` : "جاهز"}
            </span>
          </div>
          <p className="risk-summary">
            {assessment?.headline || "ابدئي بتقييم الأعراض أو تحليل الصوت لتكوين خطة دقيقة مبنية على حالة الطفل."}
          </p>
          <div className="care-plan-actions">
            <Link className="btn btn-soft-green" href="/dashboard">تشغيل تقييم</Link>
            <Link className="btn btn-secondary" href="/care-center">مركز الرعاية</Link>
            <Link className="btn btn-soft-blue" href="/chat">فتح المحادثة</Link>
            <Link className="btn btn-secondary" href="/reports">تقرير الطبيب</Link>
          </div>
        </article>

        <aside className="care-watch-card command-panel">
          <div className="panel-title-row">
            <div>
              <span className="section-label">مؤشرات تستحق الانتباه</span>
              <h3>علامات الخطورة</h3>
            </div>
            <span className="care-icon care-icon-alert care-icon-md" aria-hidden="true" />
          </div>
          <ul className="watch-list">
            <li>صعوبة تنفس أو زرقة في الشفاه.</li>
            <li>حرارة مرتفعة مستمرة، خصوصًا مع عمر صغير.</li>
            <li>قلة حفاضات مبللة أو خمول واضح.</li>
            <li>قيء مستمر أو رفض رضاعة متكرر.</li>
          </ul>
        </aside>
      </section>

      <section className="daily-blocks">
        {blocks.map((block, index) => (
          <article className="daily-block" key={block.title}>
            <span className={`care-icon care-icon-${index === 0 ? "thermometer" : index === 1 ? "bell" : "moon"} care-icon-md`} aria-hidden="true" />
            <div>
              <span>{block.title}</span>
              <h3>{block.summary}</h3>
              <ul>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <section className="care-plan-details">
        <article className="command-panel">
          <div className="panel-title-row">
            <div>
              <span className="section-label">قائمة المتابعة</span>
              <h3>متابعة اليوم</h3>
            </div>
          </div>
          <div className="care-checklist">
            {planItems.map((item) => (
              <label key={item}>
                <input type="checkbox" />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </article>

        <article className="command-panel">
          <div className="panel-title-row">
            <div>
              <span className="section-label">التذكيرات</span>
              <h3>الخطوات المجدولة</h3>
            </div>
            <span className="soft-pill">{reminders.length}</span>
          </div>
          <div className="care-reminder-stack">
            {reminders.slice(0, 5).map((reminder) => (
              <article key={reminder.id}>
                <span className="care-icon care-icon-bell care-icon-sm" aria-hidden="true" />
                <div>
                  <strong>{reminder.title}</strong>
                  <p>{reminder.message}</p>
                </div>
                <time>{formatDateTime(reminder.scheduledFor)}</time>
              </article>
            ))}
            {reminders.length === 0 ? <p className="empty-copy">لا توجد تذكيرات بعد. يمكن إنشاؤها من لوحة التحكم.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
