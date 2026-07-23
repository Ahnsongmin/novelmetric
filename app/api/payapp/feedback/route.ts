// 페이앱 결제 웹훅(feedbackurl) — 결제완료(pay_state=4) 시 NM-코드 자동 발급.
//   페이앱은 이 URL이 HTTP 200 + 본문 "SUCCESS"를 돌려줘야 완료 처리한다(재시도 있음).
//   위조 방지: var1(orderId)·var2(HMAC 서명) 검증 + 금액 일치 확인.
//   승인취소(9/64) 등은 자동 회수하지 않고 로그만 남긴다 — 건수 적어 수동 처리.

import { NextRequest, NextResponse } from "next/server";
import { payappEnabled, verifyOrderSig, passByOrderId } from "@/lib/payapp";
import { createPass, PASS } from "@/lib/pass";

export const runtime = "nodejs";

const ok = () => new NextResponse("SUCCESS", { status: 200 });
const fail = (msg: string) => {
  console.error("[payapp/feedback] 거부:", msg);
  return new NextResponse("FAIL", { status: 400 });
};

export async function POST(req: NextRequest) {
  if (!payappEnabled()) return fail("payapp 비활성");

  const p = new URLSearchParams(await req.text());
  const payState = p.get("pay_state");
  const orderId = p.get("var1") ?? "";
  const sig = p.get("var2");
  const price = Number(p.get("price"));
  const mulNo = p.get("mul_no") ?? "";

  if (!verifyOrderSig(orderId, sig)) return fail(`서명 불일치 order=${orderId}`);

  // 완료(4) 외 상태(요청취소 8/32, 승인취소 9/64, 대기 10)는 수신 확인만
  if (payState !== "4") {
    console.log(`[payapp/feedback] pay_state=${payState} order=${orderId} mul_no=${mulNo} — 발급 없음`);
    return ok();
  }
  if (price !== PASS.amount) return fail(`금액 불일치 ${price} != ${PASS.amount} order=${orderId}`);

  // 중복 웹훅 방지: 이미 발급됐으면 그대로 성공 응답
  if (await passByOrderId(orderId)) return ok();

  try {
    const pass = await createPass({ orderId, paymentKey: `payapp-${mulNo}`, amount: price });
    console.log(`[payapp/feedback] 발급 완료 order=${orderId} code=${pass.code}`);
    return ok();
  } catch (e) {
    // 동시 웹훅으로 unique 충돌이 났다면 이미 발급된 것 — 성공 처리
    if (await passByOrderId(orderId)) return ok();
    console.error("[payapp/feedback] 발급 실패:", e);
    return new NextResponse("FAIL", { status: 500 }); // 페이앱이 재시도하도록 실패 응답
  }
}
