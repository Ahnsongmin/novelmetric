// 페이앱(PayApp) 결제 연동 — 개인(비사업자) 가입 가능한 카드·간편결제.
//   흐름: /api/payapp/checkout(결제요청 생성→payurl 리다이렉트)
//        → 손님 결제 → 페이앱이 feedbackurl 웹훅 호출(pay_state=4)
//        → NM-코드 자동 발급 → /pro/payapp 페이지가 폴링으로 코드 표시.
//   env: PAYAPP_USERID(판매자 아이디), PAYAPP_LINKKEY, PAYAPP_LINKVAL (관리자사이트→설정→연동정보)
//   키가 없으면 payappEnabled=false — 기존 동작(토스/무료) 그대로.
// 위조 방지: 결제요청 var2에 HMAC(orderId) 서명을 실어 보내고 웹훅에서 검증한다.

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { getDb, dbEnabled } from "./db";
import { PASS } from "./pass";

const API_URL = "https://api.payapp.kr/oapi/apiLoad.html";

export function payappEnabled(): boolean {
  return Boolean(
    process.env.PAYAPP_USERID && process.env.PAYAPP_LINKKEY && process.env.PAYAPP_LINKVAL && dbEnabled(),
  );
}

/** orderId 위조 방지 서명 — 웹훅(var1=orderId, var2=서명) 검증용 */
export function orderSig(orderId: string): string {
  const secret = process.env.PAYAPP_LINKVAL ?? "";
  return createHmac("sha256", secret).update(`nm-payapp.${orderId}`).digest("hex").slice(0, 40);
}

export function verifyOrderSig(orderId: string, sig: string | null | undefined): boolean {
  if (!orderId || !sig) return false;
  const want = Buffer.from(orderSig(orderId));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

export type CheckoutResult = { orderId: string; payurl: string };

/** 페이앱 결제요청 생성 → 손님을 보낼 payurl 반환 */
export async function createCheckout(opts: { phone: string; origin: string }): Promise<CheckoutResult> {
  const orderId = `nmpay-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const params = new URLSearchParams({
    cmd: "payrequest",
    userid: process.env.PAYAPP_USERID!,
    linkkey: process.env.PAYAPP_LINKKEY!,
    goodname: PASS.name,
    price: String(PASS.amount),
    recvphone: opts.phone,
    smsuse: "n", // 문자 발송 없이 payurl로 바로 결제 (실패해도 페이앱 기본값으로 동작)
    // 휴대전화(소액)결제 제외 — 계약 특칙(수납률 99% 미달 시 정산 차감) 리스크 차단.
    openpaytype: "card,kakaopay,naverpay,tosspay,payco",
    feedbackurl: `${opts.origin}/api/payapp/feedback`,
    returnurl: `${opts.origin}/pro/payapp?order=${orderId}`,
    var1: orderId,
    var2: orderSig(orderId),
  });
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`페이앱 응답 오류 HTTP ${res.status}`);
  const body = new URLSearchParams(await res.text());
  const state = body.get("state");
  const payurl = body.get("payurl");
  if (state !== "1" || !payurl) {
    throw new Error(body.get("errorMessage") || body.get("errno") || "결제요청 생성에 실패했어요.");
  }
  return { orderId, payurl };
}

/** order_id로 발급된 패스 조회 (웹훅 완료 후 /pro/payapp 폴링용) */
export async function passByOrderId(orderId: string): Promise<{ code: string; expiresAt: string } | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_pass").select("code,expires_at").eq("order_id", orderId).maybeSingle();
  const row = data as { code: string; expires_at: string } | null;
  return row ? { code: row.code, expiresAt: row.expires_at } : null;
}
