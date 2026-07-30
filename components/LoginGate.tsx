"use client";

// 로그인/회원가입 카드 — 흔한 웹사이트 방식 그대로다. 아이디(이메일)와 비밀번호를 한 화면에서
// 받고, 아이디 저장 체크박스와 비밀번호 찾기를 그 아래 한 줄에 둔다.
//
// 서버가 401 LOGIN_REQUIRED를 돌려준 자리에 그대로 끼워 넣거나 /login 페이지에서 단독으로 쓴다.
// "비밀번호 찾기"는 메일 링크(1회용 토큰)로 처리한다 — 비밀번호를 잊어도 계정에 다시 들어올 수 있다.
//
// 수단은 이메일 + 비밀번호 하나뿐이다. 소셜 로그인은 쓰지 않는다(2026-07-30 사용자 결정).

import { useEffect, useState } from "react";

type Mode = "login" | "signup";

/** 아이디 저장용 — 비밀번호는 절대 저장하지 않는다. */
const SAVED_EMAIL_KEY = "nm_login_email";

const FIELD =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent";
const LABEL = "mb-1 block text-xs font-semibold text-muted";

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
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saveEmail, setSaveEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setSaveEmail(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
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
      if (saveEmail) localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
      else localStorage.removeItem(SAVED_EMAIL_KEY);
      if (onSuccess) onSuccess();
      else location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
      setBusy(false);
    }
  }

  /** 비밀번호 찾기 — 메일 링크로 바로 로그인시킨 뒤 비밀번호를 다시 정하게 한다. */
  async function sendResetLink() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("가입한 이메일을 먼저 입력해 주세요.");
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
          <b className="text-foreground">{email.trim()}</b> 메일함에서 링크를 눌러 주세요. 링크로
          로그인한 뒤 비밀번호를 새로 정할 수 있어요. 15분 뒤 만료되고 한 번만 쓸 수 있습니다. 안
          보이면 스팸함도 확인해 주세요.
        </p>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="break-keep text-sm text-muted">{message}</p>

      <form onSubmit={submit} className="mt-3">
        <div>
          <label htmlFor="nm-email" className={LABEL}>
            이메일
          </label>
          <input
            id="nm-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일을 입력하세요"
            className={FIELD}
          />
        </div>

        <div className="mt-2.5">
          <label htmlFor="nm-password" className={LABEL}>
            비밀번호
          </label>
          <input
            id="nm-password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? "8자 이상으로 정해 주세요" : "비밀번호를 입력하세요"}
            className={FIELD}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={saveEmail}
              onChange={(e) => setSaveEmail(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            이메일 저장
          </label>
          {!isSignup && (
            <button
              type="button"
              onClick={sendResetLink}
              disabled={busy}
              className="text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-60"
            >
              비밀번호 찾기
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "처리 중…" : isSignup ? "가입하고 시작하기" : "로그인"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 break-keep text-sm text-accent-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(isSignup ? "login" : "signup");
          setError("");
        }}
        className="mt-2 w-full rounded-lg border border-border py-2 text-sm font-semibold transition hover:border-accent"
      >
        {isSignup ? (
          "이미 계정이 있어요 · 로그인"
        ) : (
          <>
            회원가입
            <span className="mt-0.5 block text-xs font-normal text-muted">
              이메일과 비밀번호만 있으면 30초
            </span>
          </>
        )}
      </button>
    </div>
  );
}
