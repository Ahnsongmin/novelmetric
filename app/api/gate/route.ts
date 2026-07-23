// 게이트 상태 — 클라이언트가 무료 잔여/패스 유효를 표시할 때 사용.

import { NextRequest, NextResponse } from "next/server";
import { passEnabled, diagUsed, passValidUntil, PASS, FREE_DIAG_PER_MONTH } from "@/lib/pass";
import { payappEnabled } from "@/lib/payapp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enabled = passEnabled();
  const code = req.nextUrl.searchParams.get("code");
  return NextResponse.json({
    enabled,
    freeLeft: enabled ? Math.max(0, FREE_DIAG_PER_MONTH - diagUsed(req.headers.get("cookie"))) : null,
    passValidUntil: enabled && code ? await passValidUntil(code) : null,
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null,
    payapp: payappEnabled(),
    pass: PASS,
  });
}
