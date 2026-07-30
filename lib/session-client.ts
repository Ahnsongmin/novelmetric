"use client";

// 브라우저 쪽 신원 헬퍼. Pro 코드(localStorage)와 로그인 상태(서버 쿠키)를 한 곳에서 다룬다.
// 예전엔 localStorage.nm_pass 파싱이 네 군데에 복붙돼 있어 게이트를 바꿀 때마다 다 손봐야 했다.

export const PASS_KEY = "nm_pass";

export function storedPassCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return (JSON.parse(localStorage.getItem(PASS_KEY) ?? "null") as { code?: string } | null)?.code;
  } catch {
    return undefined;
  }
}

export function savePassCode(code: string): void {
  localStorage.setItem(PASS_KEY, JSON.stringify({ code }));
}

/** 로그인 수단은 이메일 + 비밀번호 하나뿐이다(소셜 로그인은 쓰지 않는다 — 2026-07-30 사용자 결정). */
export type Me = {
  enabled: boolean;
  email: string | null;
};

export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/auth/me");
    return (await res.json()) as Me;
  } catch {
    return { enabled: false, email: null };
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
