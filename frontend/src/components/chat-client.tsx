"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { getCryClassInfo } from "@/lib/cry-classification";

type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

type FamilyProfile = {
  user?: User;
  profile?: { babyName?: string | null; avatarUrl?: string | null; ageLabel?: string | null } | null;
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Array<{ content: string; role: "USER" | "ASSISTANT" }>;
};

type Message = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  predictedClass?: string | null;
  confidence?: number | null;
  createdAt?: string;
};

type ChatClientProps = {
  user: User;
};

type MicStatus = "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "insecure";
type AudioChecklist = {
  temperatureC: string;
  wetDiapers24h: string;
  cryingHours: string;
  poorFeeding: boolean;
  sleepIssue: boolean;
};

const DEFAULT_AUDIO_CHECKLIST: AudioChecklist = {
  temperatureC: "",
  wetDiapers24h: "",
  cryingHours: "",
  poorFeeding: false,
  sleepIssue: false,
};

const STARTER_PROMPTS = [
  "الطفل يبكي بعد الرضاعة",
  "حرارة الطفل 38.5",
  "الطفل لا ينام بشكل جيد",
  "هل الأعراض تشير إلى مغص أم جوع؟",
];

function formatPreview(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact;
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatApiError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const payload = data as { error?: unknown; details?: unknown; fix?: unknown };
  const parts = [
    typeof payload.error === "string" ? payload.error : fallback,
    typeof payload.details === "string" ? `التفاصيل: ${payload.details}` : null,
    typeof payload.fix === "string" ? `الإصلاح: ${payload.fix}` : null,
  ];

  return parts.filter(Boolean).join(" ");
}

function renderInlineFormatting(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }
    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function renderMessageContent(content: string): ReactNode {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isBulletList = lines.every((line) => /^[-*]\s+/.test(line));
    const isNumberList = lines.every((line) => /^\d+\.\s+/.test(line));

    if (isBulletList) {
      return (
        <ul className="message-list" key={`block-${blockIndex}`}>
          {lines.map((line, lineIndex) => (
            <li key={`line-${blockIndex}-${lineIndex}`}>{renderInlineFormatting(line.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }

    if (isNumberList) {
      return (
        <ol className="message-list message-list-numbered" key={`block-${blockIndex}`}>
          {lines.map((line, lineIndex) => (
            <li key={`line-${blockIndex}-${lineIndex}`}>
              {renderInlineFormatting(line.replace(/^\d+\.\s+/, ""))}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <p className="message-paragraph" key={`block-${blockIndex}`}>
        {lines.map((line, lineIndex) => (
          <span className="message-line" key={`line-${blockIndex}-${lineIndex}`}>
            {renderInlineFormatting(line)}
          </span>
        ))}
      </p>
    );
  });
}

function CryClassResult({ confidence, label }: { confidence?: number | null; label: string }) {
  const classInfo = getCryClassInfo(label);
  const confidenceLabel = typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "غير محددة";

  return (
    <div className="chat-analysis-summary">
      <div className="analysis-summary-head">
        <span>الفئة الأقرب</span>
        <strong>{classInfo.label}</strong>
        <small>{confidenceLabel}</small>
      </div>
      <p>
        <b>يعني:</b> {classInfo.meaning}
      </p>
      <p>
        <b>اعملي إيه الآن:</b> {classInfo.guidance}
      </p>
    </div>
  );
}

export function ChatClient({ user }: ChatClientProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "ASSISTANT",
      content: "أهلاً. قولي لي ما الذي يقلقك بخصوص الطفل وسأساعدك خطوة بخطوة.",
    },
  ]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [deletePromptConversationId, setDeletePromptConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>("unknown");
  const [audioChecklist, setAudioChecklist] = useState<AudioChecklist>(DEFAULT_AUDIO_CHECKLIST);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>("audio/webm");

  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  const deletePromptConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === deletePromptConversationId) ?? null,
    [conversations, deletePromptConversationId],
  );

  function resolveRecorderMimeType() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
      return "";
    }

    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];

    return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    const response = await fetch("/api/chat/conversations", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const nextConversations = (data.conversations || []) as ConversationSummary[];
    setConversations(nextConversations);

    const resolvedId =
      preferredId && nextConversations.some((conversation) => conversation.id === preferredId)
        ? preferredId
        : nextConversations[0]?.id ?? null;

    setConversationId((current) => {
      if (preferredId && nextConversations.some((conversation) => conversation.id === preferredId)) return preferredId;
      if (current && nextConversations.some((conversation) => conversation.id === current)) return current;
      return resolvedId;
    });
  }, []);

  async function loadConversationMessages(targetConversationId: string) {
    const response = await fetch(`/api/chat/messages?conversationId=${targetConversationId}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.conversation?.messages?.length > 0) {
      setMessages(data.conversation.messages);
    } else {
      setMessages([
        {
          id: "welcome",
          role: "ASSISTANT",
          content: "يمكن إدخال الرسالة الأولى لمتابعة حالة الطفل بشكل منظم.",
        },
      ]);
    }
  }

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    async function loadFamilyProfile() {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) return;
      setFamilyProfile(await response.json());
    }
    void loadFamilyProfile();
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void loadConversationMessages(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!deletePromptConversationId) return;
    deleteCancelButtonRef.current?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !deletingConversationId) {
        setDeletePromptConversationId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deletePromptConversationId, deletingConversationId]);

  useEffect(() => {
    const stream = messageStreamRef.current;
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!file) {
      setAudioPreviewUrl("");
      setAudioPlaying(false);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setAudioPreviewUrl(nextUrl);
    setAudioPlaying(false);

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    async function resolveMicStatus() {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setMicStatus("unsupported");
        return;
      }

      if (!window.isSecureContext) {
        setMicStatus("insecure");
        return;
      }

      if (!navigator.permissions?.query) {
        setMicStatus("unknown");
        return;
      }

      try {
        const result = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        const current = result.state as "prompt" | "granted" | "denied";
        setMicStatus(current);
        result.onchange = () => setMicStatus(result.state as "prompt" | "granted" | "denied");
      } catch {
        setMicStatus("unknown");
      }
    }

    void resolveMicStatus();
  }, []);

  async function requestMicrophonePermission() {
    setError("");

    if (!navigator?.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      setError("المتصفح الحالي لا يدعم التسجيل.");
      return false;
    }

    if (!window.isSecureContext) {
      setMicStatus("insecure");
      setError("التسجيل يحتاج HTTPS.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus("granted");
      return true;
    } catch {
      setError("تعذر الوصول إلى الميكروفون.");
      return false;
    }
  }

  async function toggleRecording() {
    setError("");
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setMicStatus("unsupported");
      setError("هذا المتصفح لا يدعم التسجيل الداخلي.");
      return;
    }

    const hasPermission = micStatus === "granted" ? true : await requestMicrophonePermission();
    if (!hasPermission) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecorderMimeType();
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderMimeTypeRef.current = mimeType || "audio/webm";
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const ext = recorderMimeTypeRef.current.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: recorderMimeTypeRef.current });
        const recordedFile = new File([blob], `voice-note-${Date.now()}.${ext}`, {
          type: recorderMimeTypeRef.current,
        });
        setFile(recordedFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setError("تعذر بدء التسجيل.");
    }
  }

  async function playAudioPreview(reset = false) {
    const audio = audioRef.current;
    if (!audio || !audioPreviewUrl) return;

    try {
      if (reset) audio.currentTime = 0;
      await audio.play();
      setAudioPlaying(true);
    } catch {
      setError("تعذر تشغيل الملف الصوتي في هذا المتصفح.");
    }
  }

  function toggleAudioPreview() {
    const audio = audioRef.current;
    if (!audio || !audioPreviewUrl) return;

    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
      return;
    }

    void playAudioPreview();
  }

  function startNewConversation() {
    setError("");
    setConversationId(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "ASSISTANT",
        content: "يمكن بدء محادثة جديدة عبر إدخال الأعراض أو رفع تسجيل صوتي.",
      },
    ]);
    setText("");
    setFile(null);
    setAudioChecklist(DEFAULT_AUDIO_CHECKLIST);
    setSidebarOpen(false);
  }

  async function selectConversation(id: string) {
    setError("");
    setConversationId(id);
    setSidebarOpen(false);
  }

  function requestDeleteConversation(targetConversationId: string) {
    setError("");
    setDeletePromptConversationId(targetConversationId);
  }

  async function deleteConversation(targetConversationId: string) {
    setError("");
    setDeletePromptConversationId(null);
    setDeletingConversationId(targetConversationId);

    try {
      const response = await fetch(`/api/chat/conversations?conversationId=${encodeURIComponent(targetConversationId)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر حذف المحادثة.");

      const remainingConversations = conversations.filter((item) => item.id !== targetConversationId);
      setConversations(remainingConversations);

      if (conversationId === targetConversationId) {
        const nextConversationId = remainingConversations[0]?.id ?? null;
        setConversationId(nextConversationId);
        if (nextConversationId) {
          await loadConversationMessages(nextConversationId);
        } else {
          setMessages([
            {
              id: `welcome-${Date.now()}`,
              role: "ASSISTANT",
              content: "ابدئي محادثة جديدة عبر وصف الحالة أو رفع تسجيل صوتي.",
            },
          ]);
        }
      }

      await loadConversations(conversationId === targetConversationId ? remainingConversations[0]?.id ?? null : conversationId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "تعذر حذف المحادثة.");
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function sendTextMessage(forceText?: string) {
    const userMessage = (forceText ?? text).trim();
    if (!userMessage) {
      setError("يرجى إدخال رسالة أولًا.");
      return;
    }

    setError("");
    setLoading(true);

    const localUserMessageId = `user-${Date.now()}`;
    const localUserMessage: Message = {
      id: localUserMessageId,
      role: "USER",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, localUserMessage]);
    setText("");

    try {
      const response = await fetch("/api/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "تعذر الحصول على الرد.");
      }

      setConversationId(data.conversationId);
      await Promise.all([loadConversations(data.conversationId), loadConversationMessages(data.conversationId)]);
    } catch (submitError) {
      setMessages((prev) => prev.filter((message) => message.id !== localUserMessageId));
      setError(submitError instanceof Error ? submitError.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAudio() {
    setError("");
    if (!file) {
      setError("يرجى اختيار ملف صوتي أو بدء التسجيل أولًا.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("audio", file);
    const userMessage = text.trim() || "تحليل بكاء الطفل.";
    formData.append("message", userMessage);
    if (audioChecklist.temperatureC.trim()) formData.append("temperatureC", audioChecklist.temperatureC.trim());
    if (audioChecklist.wetDiapers24h.trim()) formData.append("wetDiapers24h", audioChecklist.wetDiapers24h.trim());
    if (audioChecklist.cryingHours.trim()) formData.append("cryingHours", audioChecklist.cryingHours.trim());
    formData.append("poorFeeding", String(audioChecklist.poorFeeding));
    formData.append("sleepIssue", String(audioChecklist.sleepIssue));
    if (conversationId) {
      formData.append("conversationId", conversationId);
    }

    const localUserMessageId = `user-audio-${Date.now()}`;
    const localUserMessage: Message = {
      id: localUserMessageId,
      role: "USER",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, localUserMessage]);
    setText("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatApiError(data, "تعذر تحليل الصوت."));

      setConversationId(data.conversationId);
      setFile(null);
      setAudioChecklist(DEFAULT_AUDIO_CHECKLIST);
      await Promise.all([loadConversations(data.conversationId), loadConversationMessages(data.conversationId)]);
    } catch (submitError) {
      setMessages((prev) => prev.filter((message) => message.id !== localUserMessageId));
      setError(submitError instanceof Error ? submitError.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading) {
        void sendTextMessage();
      }
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const audioModeLabel = loading && file ? "جار تحليل الصوت" : isRecording ? "جار التسجيل" : file ? "ملف صوتي جاهز" : "اضغطي تسجيل أو ارفعي صوت";
  const audioDetailLabel = file
    ? `${file.name} - سيتم تجهيزه تلقائيًا للتحليل`
    : isRecording
      ? "سيتم تجهيز التسجيل عند الإيقاف"
      : "التسجيل سيطلب صلاحية الميكروفون عند الضغط";
  const showMicPermissionAction =
    !file && !isRecording && (micStatus === "prompt" || micStatus === "unknown" || micStatus === "denied");
  const activeChild = familyProfile?.profile;
  const parentAvatar = familyProfile?.user?.avatarUrl || user.avatarUrl;

  return (
    <div className="chat-workspace" dir="rtl">
      <AppNav active="chat" className="chat-top-nav" />

      <aside className={`chat-conversations ${sidebarOpen ? "open" : ""}`}>
        <div className="chat-conversations-top">
          <div className="chat-family-head">
            {parentAvatar ? <img alt={user.name} className="family-avatar family-avatar-md" src={parentAvatar} /> : <span className="family-avatar family-avatar-md family-avatar-fallback">{user.name.slice(0, 1)}</span>}
            <span className="panel-eyebrow">
              {activeChild?.avatarUrl ? <img alt={activeChild.babyName || "الطفل"} className="mini-child-avatar" src={activeChild.avatarUrl} /> : <span className="care-icon care-icon-baby care-icon-sm" aria-hidden="true" />}
              SuperMamy
            </span>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <small>{activeChild?.babyName ? `الملف الحالي: ${activeChild.babyName}` : "يرجى اختيار ملف الطفل من لوحة التحكم"}</small>
          </div>
          <button className="btn btn-primary compact-btn" onClick={startNewConversation} type="button">
            محادثة جديدة
          </button>
        </div>

        <nav className="workspace-nav">
          <Link className="workspace-link active" href="/chat">
            المحادثة
          </Link>
          <Link className="workspace-link" href="/dashboard">
            لوحة التحكم
          </Link>
          <Link className="workspace-link" href="/care-center">
            المركز
          </Link>
          <Link className="workspace-link" href="/care-plan">
            الخطة
          </Link>
          <Link className="workspace-link" href="/reports">
            التقرير
          </Link>
        </nav>

        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="conversation-empty">لا توجد محادثات بعد.</div>
          ) : (
            conversations.map((conversation) => (
              <article
                className={`conversation-item ${conversation.id === conversationId ? "selected" : ""}`}
                key={conversation.id}
              >
                <button className="conversation-select" onClick={() => void selectConversation(conversation.id)} type="button">
                  <strong>{conversation.title}</strong>
                  <span>{formatPreview(conversation.messages[0]?.content || "بدء أول رسالة")}</span>
                </button>
                <button
                  aria-label={`حذف ${conversation.title}`}
                  className="conversation-delete"
                  disabled={deletingConversationId === conversation.id}
                  onClick={() => requestDeleteConversation(conversation.id)}
                  title="حذف المحادثة"
                  type="button"
                >
                  <span aria-hidden="true">{deletingConversationId === conversation.id ? "…" : "🗑️"}</span>
                </button>
              </article>
            ))
          )}
        </div>

        <button className="btn btn-secondary compact-btn" onClick={logout} type="button">
          تسجيل الخروج
        </button>
      </aside>

      {deletePromptConversationId ? (
        <div
          aria-hidden={false}
          className="delete-chat-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingConversationId) {
              setDeletePromptConversationId(null);
            }
          }}
        >
          <section
            aria-labelledby="delete-chat-title"
            aria-modal="true"
            className="delete-chat-dialog"
            role="dialog"
          >
            <div className="delete-chat-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9 4h6m-8 4h10m-8 0v10m6-10v10M6 8l1 12h10l1-12" />
              </svg>
            </div>
            <div className="delete-chat-copy">
              <span>تأكيد الحذف</span>
              <h2 id="delete-chat-title">حذف الشات؟</h2>
              <p>
                سيتم حذف محادثة <strong>{deletePromptConversation?.title || "الرعاية"}</strong> وكل رسائلها نهائيًا.
              </p>
            </div>
            <div className="delete-chat-actions">
              <button
                className="btn btn-secondary"
                disabled={Boolean(deletingConversationId)}
                onClick={() => setDeletePromptConversationId(null)}
                ref={deleteCancelButtonRef}
                type="button"
              >
                إلغاء
              </button>
              <button
                className="btn btn-danger"
                disabled={Boolean(deletingConversationId)}
                onClick={() => void deleteConversation(deletePromptConversationId)}
                type="button"
              >
                حذف نهائي
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="chat-panel">
        <header className="chat-panel-header">
          <div className="chat-panel-title">
            <button className="mobile-sidebar-toggle" onClick={() => setSidebarOpen((prev) => !prev)} type="button">
              القائمة
            </button>
            <div>
              <h1>محادثة الرعاية</h1>
              <p>{currentConversation?.title || "اكتبي ما يحدث الآن، أو ارفعي تسجيلًا عند الحاجة."}</p>
            </div>
          </div>
          <Link className="header-link" href="/dashboard">
            فتح لوحة التحكم
          </Link>
        </header>

        <div className="chat-suggestions">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              className="suggestion-chip"
              key={prompt}
              onClick={() => void sendTextMessage(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>

        <section className={`audio-insight-dock ${isRecording ? "recording" : ""}`}>
          <span className="care-icon care-icon-audio care-icon-md audio-dock-icon" aria-hidden="true" />
          <div>
            <span>حالة الصوت</span>
            <strong>{audioModeLabel}</strong>
            <p>{audioDetailLabel}</p>
          </div>
          <div className="mini-waveform" aria-hidden="true">
            {Array.from({ length: 22 }).map((_, index) => (
              <i key={index} style={{ "--bar": `${18 + ((index * 17) % 52)}%` } as CSSProperties} />
            ))}
          </div>
          <div className="audio-dock-actions">
            {showMicPermissionAction ? (
              <button className="btn btn-secondary audio-permission-button" onClick={() => void requestMicrophonePermission()} type="button">
                تفعيل المايك
              </button>
            ) : null}
            <button className="btn btn-secondary audio-preview-button" disabled={!audioPreviewUrl} onClick={toggleAudioPreview} type="button">
              {audioPlaying ? "إيقاف" : "تشغيل"}
            </button>
            <button className="btn btn-secondary audio-preview-button" disabled={!audioPreviewUrl} onClick={() => void playAudioPreview(true)} type="button">
              إعادة
            </button>
            <button className="btn btn-primary audio-analyze-button" disabled={loading || !file} onClick={() => void submitAudio()} type="button">
              تحليل الصوت
            </button>
          </div>
          <audio
            className="audio-preview-player"
            onEnded={() => setAudioPlaying(false)}
            onPause={() => setAudioPlaying(false)}
            onPlay={() => setAudioPlaying(true)}
            preload="metadata"
            ref={audioRef}
            src={audioPreviewUrl || undefined}
          />
        </section>

        <section className="audio-quick-checklist" aria-label="فحص سريع قبل تحليل الصوت">
          <div>
            <span className="section-label">فحص سريع</span>
            <strong>علامات قبل التحليل</strong>
          </div>
          <label>
            <span>الحرارة</span>
            <input
              inputMode="decimal"
              onChange={(event) => setAudioChecklist((prev) => ({ ...prev, temperatureC: event.target.value }))}
              placeholder="37.4"
              value={audioChecklist.temperatureC}
            />
          </label>
          <label>
            <span>حفاضات/24س</span>
            <input
              inputMode="numeric"
              onChange={(event) => setAudioChecklist((prev) => ({ ...prev, wetDiapers24h: event.target.value }))}
              placeholder="6"
              value={audioChecklist.wetDiapers24h}
            />
          </label>
          <label>
            <span>ساعات بكاء</span>
            <input
              inputMode="decimal"
              onChange={(event) => setAudioChecklist((prev) => ({ ...prev, cryingHours: event.target.value }))}
              placeholder="2"
              value={audioChecklist.cryingHours}
            />
          </label>
          <label className="quick-toggle">
            <input
              checked={audioChecklist.poorFeeding}
              onChange={(event) => setAudioChecklist((prev) => ({ ...prev, poorFeeding: event.target.checked }))}
              type="checkbox"
            />
            <span>ضعف رضاعة</span>
          </label>
          <label className="quick-toggle">
            <input
              checked={audioChecklist.sleepIssue}
              onChange={(event) => setAudioChecklist((prev) => ({ ...prev, sleepIssue: event.target.checked }))}
              type="checkbox"
            />
            <span>اضطراب النوم</span>
          </label>
        </section>

        <div className="chat-message-stream" ref={messageStreamRef}>
          {messages.map((message) => (
            <article className={`chat-row ${message.role === "USER" ? "is-user" : "is-assistant"}`} key={message.id}>
              <div className="chat-avatar">
                {message.role === "USER" && parentAvatar ? <img alt={user.name} src={parentAvatar} /> : null}
                {message.role === "ASSISTANT" && activeChild?.avatarUrl ? <img alt={activeChild.babyName || "الطفل"} src={activeChild.avatarUrl} /> : null}
                {message.role === "USER" && !parentAvatar ? "أنت" : null}
                {message.role === "ASSISTANT" && !activeChild?.avatarUrl ? "مساعد" : null}
              </div>
              <div className="chat-bubble">
                <div className="message-rich-text">{renderMessageContent(message.content)}</div>
                {message.predictedClass ? <CryClassResult confidence={message.confidence} label={message.predictedClass} /> : null}
                {message.role === "ASSISTANT" && message.predictedClass ? (
                  <div className="chat-bubble-actions">
                    <Link className="mini-action-link primary" href="/reports">
                      تقرير للطبيب
                    </Link>
                    <Link className="mini-action-link" href="/dashboard">
                      خطة متابعة
                    </Link>
                  </div>
                ) : null}
                <time>{formatTime(message.createdAt)}</time>
              </div>
            </article>
          ))}

          {loading ? (
            <article className="chat-row is-assistant">
              <div className="chat-avatar">مساعد</div>
              <div className="chat-bubble typing-bubble">
                <span />
                <span />
                <span />
              </div>
            </article>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-composer-shell">
          <div className="chat-composer-input">
            <textarea
              rows={1}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={onComposerKeyDown}
              placeholder="أدخل الرسالة هنا..."
            />
          </div>

          <div className="chat-composer-toolbar">
            <div className="chat-composer-actions">
              <button
                aria-label="إرسال الرسالة"
                className="btn btn-primary icon-action-button send-action"
                disabled={loading || !text.trim()}
                onClick={() => void sendTextMessage()}
                title="إرسال"
                type="button"
              >
                <span className="action-emoji action-emoji-send" aria-hidden="true">💌</span>
              </button>
              <button
                aria-label={isRecording ? "إيقاف التسجيل" : "بدء التسجيل"}
                className={`btn btn-secondary record-control icon-action-button ${isRecording ? "is-recording" : ""}`}
                disabled={loading}
                onClick={toggleRecording}
                title={isRecording ? "إيقاف التسجيل" : "تسجيل صوت"}
                type="button"
              >
                {isRecording ? (
                  <>
                    <span className="recording-mark" aria-hidden="true">
                      <span className="recording-ring recording-ring-one" />
                      <span className="recording-ring recording-ring-two" />
                      <span className="recording-dot" />
                    </span>
                  </>
                ) : (
                  <span className="action-emoji action-emoji-record" aria-hidden="true">🎙️</span>
                )}
              </button>
              <label aria-label="رفع ملف صوتي" className="file-input compact-file-input icon-action-button" title="رفع صوت">
                <input
                  accept="audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/*"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    if (error) setError("");
                  }}
                  type="file"
                />
                <span className="action-emoji action-emoji-upload" aria-hidden="true">🎧</span>
              </label>
            </div>

            <div className="chat-composer-status">
              {text.trim() ? <span>اضغطي Enter للإرسال</span> : null}
              <span>يساعدك على تنظيم المعلومات ولا يغني عن الطبيب عند الأعراض العاجلة.</span>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
