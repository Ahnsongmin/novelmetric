"use client";

// 로그인/회원가입 카드 — 서버가 401 LOGIN_REQUIRED를 돌려준 자리에 그대로 끼워 넣거나
// /login 페이지에서 단독으로 쓴다.
//
// 수단은 셋이다: 소셜 버튼(키가 등록된 것만) / 이메일+비밀번호 / 메일 링크(비밀번호 없이).
// 어떤 경로로 들어와도 이메일이 같으면 하나의 계정으로 합쳐진다.

import { useEffect, useState } from "react";
import { fetchMe, PROVIDER_LABEL, type ProviderId } from "@/lib/session-client";

type Mode = "login" | "signup";

export default function LoginGate({
  message,
  next = "/dashboard",
  defaultMode = "signup",
  onSuccess,
}: {
  message: string;
  next?: string;
  defaultMode?: Mode;
  onSuccess?: () => void;
}) {
  const [providers, setProviders] = useState<ProviderId[]>([]);
  // DB에 password_hash 컬럼이 준비되기 전에는 비밀번호 폼을 아예 그리지 않는다(눌러도 안 되는 UI 방지).
  const [passwordReady, setPasswordReady] = useState(false);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    fetchMe().then((m) => {
      setProviders(m.providers);
      setPasswordReady(m.password);
    });
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리에 실패했어요.");
      if (onSuccess) onSuccess();
      else location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("메일 링크를 받으려면 이메일을 먼저 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "메일 발송에 실패했어요.");
      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (linkSent) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
        <p className="font-bold text-accent">📬 로그인 링크를 보냈어요</p>
        <p className="mt-1 break-keep text-muted">
          <b className="text-foreground">{email.trim()}</b> 메일함에서 링크를 눌러 주세요. 15분 뒤
          만료되고 한 번만 쓸 수 있어요. 안 보이면 스팸함도 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="break-keep text-sm text-muted">{message}</p>

      {providers.length > 0 && (
        <>
          <div className="mt-3 space-y-2">
            {providers.map((p) => (
              <a
                key={p}
                href={`/api/auth/oauth/${p}?next=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/60 py-2.5 text-sm font-semibold transition hover:border-accent"
              >
                {PROVIDER_LABEL[p]}
              </a>
            ))}
          </div>
          <div className="my-3 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {passwordReady && (
        <>
          <div className="flex gap-1 text-sm">
            {(["signup", "login"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`rounded-full px-3 py-1 transition ${
                  mode === m
                    ? "bg-accent/15 font-semibold text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {m === "signup" ? "회원가입" : "로그인"}
              </button>
            ))}
          </div>

          <form onSubmit={submitPassword} className="mt-2 space-y-2">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              aria-label="이메일 주소"
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
            />
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "비밀번호 (8자 이상)" : "비밀번호"}
              aria-label="비밀번호"
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "처리 중…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
            </button>
          </form>
        </>
      )}

      {/* 비밀번호가 아직 준비 전이면 이게 유일한 수단이 되므로 입력칸까지 함께 보여준다. */}
      {!passwordReady && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            aria-label="이메일 주소"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={busy}
            className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "보내는 중…" : "로그인 링크 받기"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 break-keep text-sm text-accent-2">
          {error}
        </p>
      )}

      {/* 비밀번호를 잊었거나 만들기 싫은 사람을 위한 우회로 — 같은 메일 링크가 둘 다 해결한다. */}
      {passwordReady && (
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={busy}
          className="mt-2.5 text-xs text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-60"
        >
          비밀번호 없이 메일 링크로 로그인 / 비밀번호 찾기
        </button>
      )}
    </div>
  );
}
