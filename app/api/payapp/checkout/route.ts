// 페이앱 결제요청 생성 — 손님 휴대폰 번호를 받아 payurl을 돌려준다.

import { NextRequest, NextResponse } from "next/server";
import { payappEnabled, createCheckout } from "@/lib/payapp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!payappEnabled()) {
    return NextResponse.json({ error: "결제가 아직 준비되지 않았어요." }, { status: 503 });
  }
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const phone = (body.phone ?? "").replace(/[^0-9]/g, "");
  if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
    return NextResponse.json({ error: "휴대폰 번호를 확인해 주세요. (예: 01012345678)" }, { status: 400 });
  }
  try {
    const { orderId, payurl } = await createCheckout({ phone, origin: req.nextUrl.origin });
    return NextResponse.json({ orderId, payurl });
  } catch (e) {
    console.error("[payapp/checkout]", e);
    return NextResponse.json({ error: (e as Error).message || "결제요청 생성에 실패했어요." }, { status: 502 });
  }
}
