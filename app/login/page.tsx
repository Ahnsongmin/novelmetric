"use client";

// 로그인 / 회원가입 진입점. 흔한 로그인 페이지 그대로 — 서비스 이름 아래 아이디·비밀번호 폼.

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoginGate from "@/components/LoginGate";

const ERRORS: Record<string, string> = {
  provider: "지금은 그 방식으로 로그인할 수 없어요. 다른 방법을 써주세요.",
  cancelled: "로그인이 취소됐어요.",
  state: "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
  code: "로그인 응답이 올바르지 않아요. 다시 시도해 주세요.",
  exchange: "로그인 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
  unverified: "이메일이 인증되지 않은 계정이에요. 다른 방법으로 가입해 주세요.",
  server: "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
  expired: "로그인 링크가 만료됐거나 이미 사용됐어요. 다시 받아주세요.",
};

function LoginContent() {
  const sp = useSearchParams();
  const nextParam = sp.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";
  const error = ERRORS[sp.get("error") ?? sp.get("login") ?? ""];
  // 가입 유도로 들어온 링크(?mode=signup)만 가입 탭으로 시작한다. 기본은 로그인.
  const defaultMode = sp.get("mode") === "signup" ? "signup" : "login";

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-5 py-14">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <span aria-hidden>📈</span>
          노블메트릭
        </Link>
        <p className="mt-1.5 break-keep text-sm text-muted">웹소설 노출·성장 추적 시스템</p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-accent-2/40 bg-accent-2/10 p-3 text-sm text-accent-2"
        >
          {error}
        </p>
      )}

      <div className="mt-6">
        <LoginGate
          message="가입하면 작품 추적 알림과 제목 진단(매달 1회)을 쓸 수 있어요."
          next={next}
          defaultMode={defaultMode}
        />
      </div>

      <p className="mt-5 break-keep text-center text-xs text-muted">
        추적 작품을 늘리거나 진단을 더 쓰려면{" "}
        <Link href="/pro" className="font-semibold text-accent underline underline-offset-2">
          Pro 패스
        </Link>
        를 확인해 보세요. 자동결제 없이 30일권입니다.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex-1 px-5 py-16" />}>
      <LoginContent />
    </Suspense>
  );
}
