"use client";

import { useState } from "react";

export function ReportActions({ fileName = "smart-child-care-report", reportText }: { fileName?: string; reportText: string }) {
  const [copied, setCopied] = useState(false);

  function exportPdf() {
    const previousTitle = document.title;
    document.title = fileName;
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 600);
    }, 50);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="report-actions">
      <button className="btn btn-soft-green" onClick={exportPdf} type="button">
        تصدير PDF
      </button>
      <button className="btn btn-soft-blue" onClick={copyReport} type="button">
        {copied ? "تم النسخ" : "نسخ للطبيب"}
      </button>
    </div>
  );
}
