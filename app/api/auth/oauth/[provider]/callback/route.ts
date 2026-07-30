// GET /api/auth/google/callback → 인가 코드를 이메일로 바꿔 로그인 처리
// 같은 이메일이면 어떤 경로로 들어와도 하나의 계정으로 합쳐진다(nm_users.email이 unique).

import { NextRequest, NextResponse } from "next/server";
import {
  adoptTracking,
  findOrCreateUser,
  readAnon,
  sessionCookie,
} from "@/lib/auth";
import {
  clearStateCookie,
  exchangeCodeForEmail,
  getProvider,
  readState,
  readStateCookie,
} from "@/lib/oauth";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, req.nextUrl.origin), 302);
  res.headers.append("Set-Cookie", clearStateCookie());
  return res;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/oauth/[provider]/callback">) {
  const { provider: id } = await ctx.params;
  const provider = getProvider(id);
  if (!provider || !provider.clientId() || !provider.clientSecret()) return fail(req, "provider");

  // 사용자가 동의 화면에서 취소한 경우
  if (req.nextUrl.searchParams.get("error")) return fail(req, "cancelled");

  // CSRF: 쿼리의 state와 우리가 심어둔 쿠키가 같아야 한다.
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = readStateCookie(req.headers.get("cookie"));
  if (!state || !cookieState || state !== cookieState) return fail(req, "state");
  const parsed = readState(state);
  if (!parsed) return fail(req, "state");

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail(req, "code");

  const result = await exchangeCodeForEmail(provider, req.nextUrl.origin, code);
  if ("error" in result) {
    console.error(`[auth/${id}]`, result.error);
    return fail(req, result.error === "email_unverified" ? "unverified" : "exchange");
  }

  const account = await findOrCreateUser(result.email);
  if (!account) return fail(req, "server");

  const adopted = await adoptTracking(account.user, readAnon(req.headers.get("cookie")));
  await logEvent(account.isNew ? "signup_done" : "login", { method: id, adopted });

  const res = NextResponse.redirect(new URL(parsed.next, req.nextUrl.origin), 302);
  res.headers.append("Set-Cookie", sessionCookie(account.user.id));
  res.headers.append("Set-Cookie", clearStateCookie());
  return res;
}
