// 문의 접수 — 손님이 남긴 문의를 사장님 메일로 즉시 보내고, DB에도 기록한다.
//
// 왜 메일이 1순위인가: DB에만 쌓으면 사장님이 대시보드를 열어볼 때까지 아무도 모른다.
// 결제 문의는 몇 시간이 중요해서 푸시(메일)가 본질이고, DB 기록은 이력·중복 확인용 보조다.
// 그래서 **DB 저장이 실패해도 메일이 나갔으면 성공**으로 응답한다(표가 아직 없어도 동작).

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sendEmail } from "@/lib/notify";
import { getDb, logEvent } from "@/lib/db";
import { passValidUntil } from "@/lib/pass";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "songminan90@gmail.com";
const KINDS = ["payment", "bug", "idea", "etc"] as const;
const KIND_LABEL: Record<string, string> = {
  payment: "결제·Pro 패스",
  bug: "오류 신고",
  idea: "기능 제안",
  etc: "기타 문의",
};
const MAX_MESSAGE = 2000;
const RATE_LIMIT = 5; // 같은 접속자당 10분 내 5건까지

/** 신고자 식별용 해시 — 원본 IP는 저장하지 않는다(도배 차단에 필요한 건 동일성뿐). */
function senderHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`nm-contact.${ip}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  let body: { message?: string; email?: string; kind?: string; passCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? body.kind! : "etc";

  if (message.length < 5) {
    return NextResponse.json({ error: "문의 내용을 조금 더 자세히 적어주세요." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `문의 내용은 ${MAX_MESSAGE}자 이내로 적어주세요.` }, { status: 400 });
  }
  // 답장을 받을 주소는 사실상 필수다 — 없으면 우리가 답을 보낼 수단이 없다.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "답장받을 이메일 주소를 정확히 적어주세요." }, { status: 400 });
  }

  const hash = senderHash(req);
  const db = getDb();

  // 도배 차단. 표가 없거나 조회가 실패하면 통과시킨다(문의를 막는 쪽이 더 큰 손해다).
  if (db) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count, error } = await db
      .from("nm_inquiry")
      .select("id", { count: "exact", head: true })
      .eq("sender_hash", hash)
      .gt("created_at", since);
    if (!error && (count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "잠시 후 다시 시도해 주세요. (연속 문의 제한)" },
        { status: 429 },
      );
    }
  }

  // 신원 힌트를 함께 실어 보낸다 — 결제 문의일 때 누구인지 바로 알아야 처리가 빠르다.
  const user = await currentUser(req).catch(() => null);
  const passCode = (body.passCode ?? "").trim().toUpperCase();
  const passUntil = passCode ? await passValidUntil(passCode).catch(() => null) : null;

  const lines = [
    `유형: ${KIND_LABEL[kind]}`,
    `답장받을 주소: ${email}`,
    user?.email ? `로그인 계정: ${user.email}` : "로그인 계정: (비로그인)",
    passCode
      ? `Pro 코드: ${passCode}${passUntil ? ` (유효, ${new Date(passUntil).toLocaleDateString("ko-KR")}까지)` : " (무효 또는 만료)"}`
      : "Pro 코드: 없음",
    "",
    "─── 문의 내용 ───",
    message,
  ];
  const mail = await sendEmail(OWNER_EMAIL, `[노블메트릭 문의] ${KIND_LABEL[kind]}`, lines.join("\n"));

  if (db) {
    const { error } = await db.from("nm_inquiry").insert({
      kind,
      email,
      message,
      pass_code: passCode || null,
      user_id: user?.id ?? null,
      sender_hash: hash,
      mailed: mail.sent,
    });
    if (error) console.error("[api/contact] 기록 실패(메일은 발송 시도됨):", error.message);
  }

  await logEvent("contact_submit", { kind, mailed: mail.sent, hasPass: Boolean(passUntil) });

  // 메일도 못 나가고 DB도 없으면 손님이 헛수고한 것이므로 솔직히 알린다.
  if (!mail.sent && !db) {
    console.error("[api/contact] 발송·기록 모두 실패:", mail.reason);
    return NextResponse.json(
      { error: "접수에 실패했어요. songminan90@gmail.com 으로 직접 보내주시면 바로 답변드릴게요." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, mailed: mail.sent });
}
