import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 대기자(이메일) 수집
// - SUPABASE 환경변수가 있으면 waitlist 테이블에 저장
// - 없으면 데모 모드로 통과(로그만) → Phase 0 즉시 동작
export async function POST(req: NextRequest) {
  let body: { email?: string; genre?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("[waitlist] (demo) 저장 생략:", email, body.genre);
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase
      .from("waitlist")
      .upsert(
        { email, genre: body.genre || null, source: body.source || "landing" },
        { onConflict: "email" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/waitlist]", e);
    return NextResponse.json({ error: "등록 중 오류가 발생했어요." }, { status: 500 });
  }
}
