import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="auth-page" dir="rtl">
      <AppNav active="login" ctaHref="/" ctaLabel="الرئيسية" variant="home" />
      <section className="auth-card auth-card-wide">
        <div className="auth-badge">SuperMamy</div>
        <h1>إنشاء حساب</h1>
        <p>ابدئي مساحة رعاية واحدة تجمع فهم البكاء، المتابعة اليومية، والتقارير المنظمة عند الحاجة.</p>
        <div className="auth-highlights">
          <span>ملف طفل منظم</span>
          <span>متابعة هادئة</span>
          <span>تجربة سريعة وآمنة</span>
        </div>
        <AuthForm mode="register" />
        <p className="auth-switch">
          لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link>
        </p>
      </section>
    </main>
  );
}
