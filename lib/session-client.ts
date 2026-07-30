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

export type ProviderId = "google" | "kakao" | "naver";
export type Me = {
  enabled: boolean;
  email: string | null;
  providers: ProviderId[];
  /** 비밀번호 로그인을 쓸 수 있는지(DB에 컬럼이 준비됐는지) */
  password: boolean;
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Google로 계속하기",
  kakao: "카카오로 계속하기",
  naver: "네이버로 계속하기",
};

export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/auth/me");
    const data = (await res.json()) as Me;
    return { ...data, providers: data.providers ?? [], password: Boolean(data.password) };
  } catch {
    return { enabled: false, email: null, providers: [], password: false };
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
