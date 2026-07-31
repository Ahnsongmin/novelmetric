"use client";

// 문의 페이지. 유료 고객이 생겼는데 연락할 창구가 없던 걸 메우는 화면이다.
// 원칙 두 개: ① 로그인 없이도 보낼 수 있다(막히면 문의 자체가 안 온다)
//            ② 답장 주소는 받는다(그게 없으면 우리가 답할 수단이 없다)

import { useEffect, useState } from "react";
import { storedPassCode } from "@/lib/session-client";

const KINDS = [
  { key: "payment", label: "결제·Pro 패스" },
  { key: "bug", label: "오류 신고" },
  { key: "idea", label: "기능 제안" },
  { key: "etc", label: "기타" },
] as const;

export default function ContactPage() {
  const [kind, setKind] = useState<string>("etc");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [passCode, setPassCode] = useState<string | undefined>(undefined);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    // 결제 문의라면 어떤 패스인지 함께 보내야 사장님이 바로 확인할 수 있다.
    setPassCode(storedPassCode());
    // 로그인해 둔 사람은 계정 이메일을 기본값으로 (다시 치게 하지 않는다)
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: { email: string | null }) => {
        if (m.email) setEmail(m.email);
      })
      .catch(() => {});
    try {
      const k = new URLSearchParams(window.location.search).get("kind");
      if (k && KINDS.some((x) => x.key === k)) setKind(k);
    } catch {
      /* ignore */
    }
  }, []);

  async function send() {
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email, message, passCode }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "접수에 실패했어요.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("네트워크 오류로 접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16">
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-8 text-center">
          <p className="mb-2 text-3xl">✅</p>
          <h1 className="mb-1 text-lg font-bold">문의가 접수됐어요</h1>
          <p className="break-keep text-sm text-muted">
            적어주신 <b className="text-foreground">{email}</b> 주소로 답변드립니다. 보통 하루 안에
            회신드리고, 결제 관련 문의는 우선 처리합니다.
          </p>
          <a href="/" className="mt-6 inline-block text-sm text-accent hover:underline">
            ← 홈으로
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      {/* 뒤로 가기 링크는 layout.tsx의 SiteNav(전 페이지 공통 네비)로 대체됐다. */}
      <h1 className="text-2xl font-bold">문의하기</h1>
      <p className="mt-1.5 break-keep text-sm text-muted">
        결제·오류·기능 제안 무엇이든 남겨주세요. 가입하지 않아도 보낼 수 있습니다.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
        <label className="block text-sm font-semibold">문의 유형</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                kind === k.key
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-semibold" htmlFor="contact-email">
          답장받을 이메일 *
        </label>
        <input
          id="contact-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          inputMode="email"
          placeholder="answer@example.com"
          className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />

        <label className="mt-4 block text-sm font-semibold" htmlFor="contact-message">
          문의 내용 *
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          maxLength={2000}
          placeholder={
            kind === "payment"
              ? "예) 결제는 됐는데 코드를 못 받았어요 / 코드를 잃어버렸어요"
              : kind === "bug"
                ? "예) 어떤 작품을 조회할 때 어떤 화면에서 무엇이 안 됐는지 적어주시면 빠르게 고칠 수 있어요."
                : "자유롭게 적어주세요."
          }
          className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
        <p className="mt-1 text-right text-xs text-muted">{message.length}/2000</p>

        {passCode && (
          <p className="mt-2 rounded-lg border border-border bg-background/40 p-2.5 text-xs text-muted">
            🎫 이 브라우저의 Pro 코드 <b className="font-mono text-foreground">{passCode}</b> 가 함께
            전달됩니다 — 결제 확인이 빨라집니다.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 break-keep text-sm text-accent-2">
            {error}
          </p>
        )}

        <button
          onClick={send}
          disabled={state === "sending" || message.trim().length < 5 || !email.trim()}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {state === "sending" ? "접수 중…" : "문의 보내기"}
        </button>
        <p className="mt-2 break-keep text-center text-xs text-muted">
          메일이 편하시면{" "}
          <a href="mailto:songminan90@gmail.com" className="text-accent hover:underline">
            songminan90@gmail.com
          </a>{" "}
          으로 바로 보내셔도 됩니다.
        </p>
      </div>
    </main>
  );
}
