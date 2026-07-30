// GET /api/auth/callback?token=&next= → 토큰 1회 소비 → 세션 쿠키 심고 리다이렉트

import { NextRequest, NextResponse } from "next/server";
import { adoptTracking, consumeLoginToken, readAnon, sessionCookie } from "@/lib/auth";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const nextParam = req.nextUrl.searchParams.get("next");
  // 외부 도메인으로 튕기지 않도록 내부 경로만 허용한다.
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";

  const result = await consumeLoginToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=expired", req.nextUrl.origin), 302);
  }

  // 가입 전에 등록해둔 추적이 있으면 계정으로 넘겨받는다.
  const adopted = await adoptTracking(result.user, readAnon(req.headers.get("cookie")));

  await logEvent(result.isNew ? "signup_done" : "login", { method: "magiclink", adopted });

  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), 302);
  res.headers.append("Set-Cookie", sessionCookie(result.user.id));
  return res;
}
