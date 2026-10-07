export function monthsBetween(date: Date | null | undefined) {
  if (!date) return null;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 0;
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.4375));
}

export function formatAgeLabel(date: Date | null | undefined) {
  const months = monthsBetween(date);
  if (months === null) return "غير محدد";
  if (months < 1) {
    const days = Math.max(1, Math.round(months * 30.4375));
    return `${days} يوم`;
  }
  if (months < 24) {
    return `${Math.round(months)} شهر`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = Math.round(months % 12);
  return remainingMonths > 0 ? `${years} سنة و${remainingMonths} شهر` : `${years} سنة`;
}

export function toDateOnlyInput(date: Date | string | null | undefined) {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}
