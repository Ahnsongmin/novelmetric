// GET /api/auth/me → 로그인 상태 + 쓸 수 있는 로그인 수단. 비로그인이면 { email: null }

import { NextRequest, NextResponse } from "next/server";
import { authEnabled, currentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  return NextResponse.json({
    enabled: authEnabled(),
    email: user?.email ?? null,
    providers: enabledProviders(), // 키가 등록된 소셜 로그인만 내려간다
  });
}
