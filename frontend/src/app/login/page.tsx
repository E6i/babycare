import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-page" dir="rtl">
      <AppNav active="login" ctaHref="/" ctaLabel="الرئيسية" variant="home" />
      <section className="auth-card auth-card-wide">
        <div className="auth-badge">SuperMamy</div>
        <h1>تسجيل الدخول</h1>
        <p>ادخلي إلى مساحة رعاية هادئة تساعدك على فهم الإشارات، متابعة الحالة، وتجهيز ملخص واضح للطبيب.</p>
        <div className="auth-highlights">
          <span>محادثات محفوظة</span>
          <span>متابعة منظمة</span>
          <span>وصول آمن</span>
        </div>
        <AuthForm mode="login" />
        <p className="auth-switch">
          ليس لديك حساب؟ <Link href="/register">أنشئي حسابًا</Link>
        </p>
      </section>
    </main>
  );
}
