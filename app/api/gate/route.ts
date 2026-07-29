// 게이트 상태 — 클라이언트가 무료 잔여/패스 유효를 표시할 때 사용.

import { NextRequest, NextResponse } from "next/server";
import {
  passEnabled,
  diagUsed,
  passValidUntil,
  PASS,
  FREE_DIAG_PER_MONTH,
  PRO_DIAG_PER_MONTH,
} from "@/lib/pass";
import { payappEnabled } from "@/lib/payapp";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enabled = passEnabled();
  const code = req.nextUrl.searchParams.get("code");
  const validUntil = enabled && code ? await passValidUntil(code) : null;
  // 진단 잔여 횟수는 패스 유무에 따라 기준이 다르다(무료 3회 / Pro 30회)
  const limit = validUntil ? PRO_DIAG_PER_MONTH : FREE_DIAG_PER_MONTH;

  // 판매 페이지 조회수 — 추적/진단 전환율과 비교할 퍼널 지점
  if (req.nextUrl.searchParams.get("from") === "pro") {
    await logEvent("pro_view", { hasPass: Boolean(validUntil) });
  }

  return NextResponse.json({
    enabled,
    freeLeft: enabled ? Math.max(0, limit - diagUsed(req.headers.get("cookie"))) : null,
    diagLimit: enabled ? limit : null,
    passValidUntil: validUntil,
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null,
    payapp: payappEnabled(),
    pass: PASS,
  });
}
