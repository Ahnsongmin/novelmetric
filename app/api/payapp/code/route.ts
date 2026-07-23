// 결제 후 코드 조회 — /pro/payapp 페이지가 웹훅 처리 완료를 폴링한다.
//   orderId 형식이 우리 발급 규칙(nmpay-)일 때만 조회 (코드 무차별 대입 방지: order_id는 UUID 기반).

import { NextRequest, NextResponse } from "next/server";
import { passByOrderId } from "@/lib/payapp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get("order") ?? "";
  if (!/^nmpay-[0-9a-f]{20}$/.test(order)) {
    return NextResponse.json({ error: "잘못된 주문번호" }, { status: 400 });
  }
  const pass = await passByOrderId(order);
  if (!pass) return NextResponse.json({ pending: true });
  return NextResponse.json({ code: pass.code, expiresAt: pass.expiresAt });
}
