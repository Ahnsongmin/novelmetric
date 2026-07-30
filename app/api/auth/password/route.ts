// POST /api/auth/password { mode: "signup" | "login", email, password }
// 이메일 + 비밀번호 로그인/회원가입. 성공하면 세션 쿠키를 심는다.
//
// 계정은 이메일 하나로 통일된다 — 구글로 먼저 가입한 사람이 같은 주소로 비밀번호를 만들면
// 새 계정이 생기는 게 아니라 기존 계정에 비밀번호가 붙는다.
//
// 신규 가입은 계정 생성과 비밀번호 저장을 한 번의 insert로 처리한다. 두 단계로 나누면
// 비밀번호 저장이 실패했을 때 비밀번호 없는 고아 계정이 남는다.

import { NextRequest, NextResponse } from "next/server";
import {
  adoptTracking,
  authEnabled,
  getPasswordHash,
  hashPassword,
  isEmail,
  normalizeEmail,
  passwordProblem,
  readAnon,
  sessionCookie,
  verifyPassword,
  type User,
} from "@/lib/auth";
import { getDb, logEvent } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { mode?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const db = getDb();
  if (!authEnabled() || !db) {
    return NextResponse.json({ error: "지금은 로그인을 이용할 수 없어요." }, { status: 503 });
  }

  const email = normalizeEmail(body.email);
  const password = body.password ?? "";
  if (!isEmail(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  }

  const found = await db.from("nm_users").select("id,email").eq("email", email).maybeSingle();
  const existing = (found.data as User | null) ?? null;

  if (body.mode === "signup") {
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const hash = await hashPassword(password);
    const now = new Date().toISOString();
    let user: User;

    if (existing) {
      // 소셜·메일링크로 이미 쓰던 계정 → 비밀번호만 붙인다. 이미 비밀번호가 있으면 로그인해야 한다.
      if (await getPasswordHash(existing.id)) {
        return NextResponse.json(
          { error: "이미 가입된 이메일이에요. 로그인해 주세요." },
          { status: 409 },
        );
      }
      const { error } = await db
        .from("nm_users")
        .update({ password_hash: hash, last_login_at: now })
        .eq("id", existing.id);
      if (error) {
        console.error("[auth/password] 비밀번호 저장 실패:", error.message);
        return NextResponse.json({ error: "가입 처리에 실패했어요." }, { status: 500 });
      }
      user = existing;
    } else {
      const created = await db
        .from("nm_users")
        .insert({ email, password_hash: hash, last_login_at: now })
        .select("id,email")
        .maybeSingle();
      if (!created.data) {
        console.error("[auth/password] 계정 생성 실패:", created.error?.message);
        return NextResponse.json({ error: "가입 처리에 실패했어요." }, { status: 500 });
      }
      user = created.data as User;
    }

    const adopted = await adoptTracking(user, readAnon(req.headers.get("cookie")));
    await logEvent(existing ? "login" : "signup_done", { method: "password", adopted });
    return withSession(user.id, email);
  }

  // 로그인 — 계정이 없는 경우와 비밀번호가 틀린 경우를 구분해 주지 않는다(이메일 존재 여부 노출 방지).
  const ok = existing ? await verifyPassword(password, await getPasswordHash(existing.id)) : false;
  if (!ok || !existing) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 맞지 않아요." }, { status: 401 });
  }

  await db.from("nm_users").update({ last_login_at: new Date().toISOString() }).eq("id", existing.id);
  const adopted = await adoptTracking(existing, readAnon(req.headers.get("cookie")));
  await logEvent("login", { method: "password", adopted });
  return withSession(existing.id, email);
}

function withSession(userId: string, email: string): NextResponse {
  const res = NextResponse.json({ ok: true, email });
  res.headers.append("Set-Cookie", sessionCookie(userId));
  return res;
}
