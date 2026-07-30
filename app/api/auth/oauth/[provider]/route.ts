// GET /api/auth/google → 구글 로그인 화면으로 리다이렉트
// 지원하지 않는 provider나 키가 없는 provider는 조용히 /login으로 돌려보낸다.

import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, getProvider, makeState, stateCookie } from "@/lib/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/oauth/[provider]">) {
  const { provider: id } = await ctx.params;
  const provider = getProvider(id);
  if (!provider || !provider.clientId() || !provider.clientSecret()) {
    return NextResponse.redirect(new URL("/login?error=provider", req.nextUrl.origin), 302);
  }

  const nextParam = req.nextUrl.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";
  const state = makeState(next);

  const res = NextResponse.redirect(authorizeUrl(provider, req.nextUrl.origin, state), 302);
  res.headers.append("Set-Cookie", stateCookie(state));
  return res;
}
