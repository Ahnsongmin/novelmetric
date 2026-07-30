// GET /api/auth/me → 로그인 상태. 비로그인이면 { email: null }

import { NextRequest, NextResponse } from "next/server";
import { authEnabled, currentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  return NextResponse.json({
    enabled: authEnabled(),
    email: user?.email ?? null,
  });
}
