type SendCareEmailInput = {
  to: string;
  subject: string;
  body: string;
};

type SendCareEmailResult = {
  ok: boolean;
  provider: "resend" | "app";
  mode: "sent" | "stored" | "not_configured" | "failed";
  messageId?: string;
  error?: string;
};

export async function sendCareEmail(input: SendCareEmailInput): Promise<SendCareEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: true,
      provider: "app",
      mode: "stored",
      error: "Email provider is not configured; reminder was saved inside the app.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
    }),
  });

  const data = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: string } | null;
  if (!response.ok) {
    return {
      ok: false,
      provider: "resend",
      mode: "failed",
      error: data?.message || data?.error || "Email send failed.",
    };
  }

  return {
    ok: true,
    provider: "resend",
    mode: "sent",
    messageId: data?.id,
  };
}
