"use client";

import { FormEvent, useState } from "react";
type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordScore =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  const strengthLabel = ["ضعيفة جدًا", "ضعيفة", "متوسطة", "قوية", "قوية جدًا"][passwordScore];

  function normalizeAuthError(message: string) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("invalid email or password")) {
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    }
    if (lowerMessage.includes("account with this email")) {
      return "يوجد حساب بهذا البريد بالفعل.";
    }
    if (lowerMessage.includes("login failed")) {
      return "تعذر تسجيل الدخول الآن. حاولي مرة أخرى.";
    }
    if (lowerMessage.includes("registration failed")) {
      return "تعذر إنشاء الحساب الآن. حاولي مرة أخرى.";
    }
    return message || "تعذر تنفيذ الطلب.";
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const normalizedEmail = email.trim().toLowerCase();
    const payload =
      mode === "login"
        ? { email: normalizedEmail, password }
        : {
            name: name.trim(),
            email: normalizedEmail,
            password,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(normalizeAuthError(data.error || "تعذر تنفيذ الطلب."));
      }

      const sessionResponse = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!sessionResponse.ok) {
        throw new Error(
          "تمت العملية لكن المتصفح لم يحفظ جلسة الدخول. جرّبي تحديث الصفحة أو فتح الموقع عبر رابط HTTPS.",
        );
      }

      window.location.replace("/chat");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {mode === "register" ? (
        <label>
          <span>الاسم الكامل</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="دعاء عبدالفتاح"
            required
            minLength={2}
          />
        </label>
      ) : null}

      <label>
        <span>البريد الإلكتروني</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="mother@example.com"
          required
        />
      </label>

      <label>
        <span>كلمة المرور</span>
        <div className="password-wrap">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "login" ? "كلمة المرور" : "8 أحرف على الأقل"}
            required
            minLength={mode === "login" ? 1 : 8}
          />
          <button
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            type="button"
          >
            {showPassword ? "إخفاء" : "إظهار"}
          </button>
        </div>
      </label>

      <div className="password-meter">
        <div className={`meter-fill level-${passwordScore}`} />
      </div>
      <p className="password-label">قوة كلمة المرور: {password ? strengthLabel : "لم تكتب بعد"}</p>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="btn btn-primary auth-submit" disabled={loading} type="submit">
        {loading ? "انتظري..." : mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
      </button>
    </form>
  );
}
