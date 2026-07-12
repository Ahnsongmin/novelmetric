import { NextRequest, NextResponse } from "next/server";
import { diagnose, type DiagnoseInput } from "@/lib/diagnose";
import { passEnabled, passValidUntil, diagUsed, diagCookie, FREE_DIAG_PER_MONTH } from "@/lib/pass";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: DiagnoseInput & { passCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 무료 월 3회 → Pro 패스면 무제한. 결제 env 없으면 게이트 꺼짐(전부 무료).
  let countFree = false;
  if (passEnabled() && !(await passValidUntil(body.passCode))) {
    const used = diagUsed(req.headers.get("cookie"));
    if (used >= FREE_DIAG_PER_MONTH) {
      return NextResponse.json(
        { error: "PRO_REQUIRED", message: `무료 진단 월 ${FREE_DIAG_PER_MONTH}회를 모두 썼어요. Pro 패스로 무제한 진단할 수 있어요.` },
        { status: 402 },
      );
    }
    countFree = true;
  }

  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if ([...title].length > 80) {
    return NextResponse.json({ error: "제목이 너무 깁니다(80자 이내)." }, { status: 400 });
  }

  try {
    const result = await diagnose({
      title,
      synopsis: (body.synopsis || "").slice(0, 1000),
      genre: body.genre,
      platform: body.platform,
    });
    const res = NextResponse.json(result);
    if (countFree) res.headers.set("Set-Cookie", diagCookie(diagUsed(req.headers.get("cookie"))));
    return res;
  } catch (e) {
    console.error("[api/diagnose]", e);
    return NextResponse.json(
      { error: "진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
