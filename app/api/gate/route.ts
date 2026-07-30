// 게이트 상태 — 클라이언트가 로그인 여부·무료 잔여·패스 유효를 표시할 때 사용.

import { NextRequest, NextResponse } from "next/server";
import {
  activePassFor,
  linkPassToUser,
  passEnabled,
  passValidUntil,
  PASS,
  FREE_DIAG_PER_MONTH,
  PRO_DIAG_PER_MONTH,
} from "@/lib/pass";
import { authEnabled, currentUser, diagUsedByUser } from "@/lib/auth";
import { payappEnabled } from "@/lib/payapp";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enabled = passEnabled();
  const code = req.nextUrl.searchParams.get("code");
  const user = await currentUser(req);

  // 로그인 상태로 코드를 적용하면 계정에 귀속시킨다 → 기기를 바꿔도 Pro가 따라온다.
  const codeValid = enabled && code ? await passValidUntil(code) : null;
  if (codeValid && code && user) await linkPassToUser(code, user.id);
  const validUntil = codeValid ?? (user ? await activePassFor(user.id) : null);

  // 진단 잔여 횟수는 패스 유무에 따라 기준이 다르다(무료 매달 1회 / Pro 월 30회)
  const limit = validUntil ? PRO_DIAG_PER_MONTH : FREE_DIAG_PER_MONTH;
  const used = user ? await diagUsedByUser(user.id) : 0;

  // 판매 페이지 조회수 — 추적/진단 전환율과 비교할 퍼널 지점
  if (req.nextUrl.searchParams.get("from") === "pro") {
    await logEvent("pro_view", { hasPass: Boolean(validUntil), loggedIn: Boolean(user) });
  }

  return NextResponse.json({
    enabled,
    authRequired: authEnabled(),
    loggedIn: Boolean(user),
    email: user?.email ?? null,
    freeLeft: user ? Math.max(0, limit - used) : null,
    diagLimit: limit,
    passValidUntil: validUntil,
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null,
    payapp: payappEnabled(),
    pass: PASS,
  });
}
