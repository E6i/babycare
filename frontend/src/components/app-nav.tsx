/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

type NavKey = "home" | "chat" | "dashboard" | "care-center" | "care-plan" | "reports" | "login";

const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: "home", label: "الرئيسية", href: "/" },
  { key: "chat", label: "المحادثة", href: "/chat" },
  { key: "dashboard", label: "لوحة التحكم", href: "/dashboard" },
  { key: "care-center", label: "مركز الرعاية", href: "/care-center" },
  { key: "care-plan", label: "خطة الرعاية", href: "/care-plan" },
  { key: "reports", label: "التقرير", href: "/reports" },
  { key: "login", label: "الدخول", href: "/login" },
];

export function AppNav({
  active,
  className = "",
  ctaHref,
  ctaLabel,
  variant = "app",
}: {
  active?: NavKey;
  className?: string;
  ctaHref?: string;
  ctaLabel?: string;
  variant?: "app" | "home";
}) {
  const isHomeVariant = variant === "home";
  const navItems = isHomeVariant ? [] : NAV_ITEMS;
  const resolvedCtaHref = ctaHref ?? "/dashboard";
  const resolvedCtaLabel = ctaLabel ?? "فتح الداشبورد";

  return (
    <header className={`top-nav app-floating-nav ${isHomeVariant ? "home-floating-nav" : ""} ${className}`}>
      <Link className="nav-brand" href="/" aria-label="SuperMamy">
        <img src="/favicon.ico" alt="" />
        <span>SuperMamy</span>
      </Link>
      {navItems.length > 0 ? (
        <nav className="nav-links" aria-label="التنقل الرئيسي">
          {navItems.map((item) => (
            <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key} prefetch={false}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {isHomeVariant ? (
        <Link className="nav-primary-cta" href={resolvedCtaHref} prefetch={false}>
          {resolvedCtaLabel}
        </Link>
      ) : null}
    </header>
  );
}
