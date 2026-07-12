// 토스 결제 승인 + Pro 패스(30일) 발급. order_id 유니크라 중복 발급 없음.

import { NextRequest, NextResponse } from "next/server";
import { PASS, passEnabled, createPass } from "@/lib/pass";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!passEnabled()) {
    return NextResponse.json({ error: "결제가 아직 준비되지 않았어요." }, { status: 503 });
  }
  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || !/^nmpass-/.test(orderId) || amount !== PASS.amount) {
    return NextResponse.json({ error: "결제 정보가 올바르지 않아요." }, { status: 400 });
  }

  const auth = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64");
  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  if (!tossRes.ok) {
    const err = (await tossRes.json().catch(() => ({}))) as { message?: string };
    return NextResponse.json({ error: err.message ?? "결제 승인에 실패했어요." }, { status: 402 });
  }

  try {
    const pass = await createPass({ orderId, paymentKey, amount });
    return NextResponse.json(pass);
  } catch (e) {
    console.error("[payment/confirm]", e);
    return NextResponse.json(
      { error: "결제는 완료됐지만 패스 발급에 문제가 생겼어요. 문의 주시면 바로 처리해 드릴게요." },
      { status: 500 },
    );
  }
}
