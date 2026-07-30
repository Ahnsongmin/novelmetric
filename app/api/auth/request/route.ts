// POST /api/auth/request { email, next? } → 로그인 링크 메일 발송
// 계정 존재 여부를 노출하지 않기 위해 성공/실패 응답을 구분하지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { authEnabled, isEmail, issueLoginToken, normalizeEmail } from "@/lib/auth";
import { sendEmail } from "@/lib/notify";
import { getDb, logEvent } from "@/lib/db";

export const runtime = "nodejs";

const RESEND_COOLDOWN_SEC = 60;

export async function POST(req: NextRequest) {
  let body: { email?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!isEmail(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  }
  if (!authEnabled()) {
    return NextResponse.json({ error: "지금은 로그인을 이용할 수 없어요." }, { status: 503 });
  }

  // 같은 주소로 메일이 연달아 나가는 것만 막는다(오타 재입력·더블클릭).
  const db = getDb();
  if (db) {
    const since = new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000).toISOString();
    const { count } = await db
      .from("nm_login_tokens")
      .select("token_hash", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((count ?? 0) > 0) return NextResponse.json({ ok: true, throttled: true });
  }

  const token = await issueLoginToken(email);
  if (!token) {
    return NextResponse.json({ error: "메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  const next = body.next && body.next.startsWith("/") ? body.next : "/dashboard";
  const link = `${req.nextUrl.origin}/api/auth/callback?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;

  // sendEmail은 throw하지 않고 { sent:false } 를 돌려주므로 반환값을 반드시 확인한다.
  const result = await sendEmail(
    email,
    "[노블메트릭] 로그인 링크",
    [
      "아래 링크를 누르면 바로 로그인됩니다. 비밀번호는 없습니다.",
      "",
      link,
      "",
      "링크는 15분 뒤 만료되고 한 번만 쓸 수 있어요.",
      "본인이 요청한 게 아니라면 이 메일을 무시하시면 됩니다.",
      "",
      "노블메트릭 드림",
    ].join("\n"),
  );
  if (!result.sent) {
    console.error("[auth/request] 메일 발송 실패:", result.reason);
    return NextResponse.json({ error: "메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  await logEvent("signup_request", { next });
  return NextResponse.json({ ok: true });
}
