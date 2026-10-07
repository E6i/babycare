import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/care-report";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      doctorReport: {
        include: { babyProfile: true },
      },
    },
  });

  if (!shareLink || shareLink.revokedAt || shareLink.expiresAt < new Date()) {
    notFound();
  }

  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { viewCount: { increment: 1 } },
  });

  return (
    <main className="shared-report-page" dir="rtl">
      <section className="shared-report-shell">
        <header className="shared-report-head">
          <div>
            <span className="section-label">SuperMamy</span>
            <h1>{shareLink.doctorReport.title}</h1>
            <p>{shareLink.doctorReport.summary}</p>
          </div>
          <div>
            <span>ينتهي الرابط</span>
            <strong>{formatDateTime(shareLink.expiresAt)}</strong>
          </div>
        </header>
        <pre className="shared-report-content">{shareLink.doctorReport.content}</pre>
      </section>
    </main>
  );
}
