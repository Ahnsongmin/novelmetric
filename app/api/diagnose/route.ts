import { NextRequest, NextResponse } from "next/server";
import { diagnose, type DiagnoseInput } from "@/lib/diagnose";
import { logEvent } from "@/lib/db";
import {
  passEnabled,
  passValidUntil,
  diagUsed,
  diagCookie,
  FREE_DIAG_PER_MONTH,
  PRO_DIAG_PER_MONTH,
} from "@/lib/pass";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: DiagnoseInput & { passCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 진단은 호출마다 실시간 AI 비용이 드는 유일한 기능이라 Pro도 상한을 둔다.
  //   무료 월 3회 / Pro 월 30회. 결제 env 없으면 게이트 꺼짐(전부 무료).
  let countUsage = false;
  let isPro = false;
  if (passEnabled()) {
    isPro = Boolean(await passValidUntil(body.passCode));
    const limit = isPro ? PRO_DIAG_PER_MONTH : FREE_DIAG_PER_MONTH;
    if (diagUsed(req.headers.get("cookie")) >= limit) {
      await logEvent("diagnose_402", { pro: isPro, limit });
      return NextResponse.json(
        isPro
          ? {
              error: "LIMIT_REACHED",
              message: `이번 달 진단 ${limit}회를 모두 썼어요. 다음 달 1일에 초기화됩니다.`,
            }
          : {
              error: "PRO_REQUIRED",
              message: `무료 진단 월 ${limit}회를 모두 썼어요. Pro 패스로 월 ${PRO_DIAG_PER_MONTH}회까지 진단할 수 있어요.`,
            },
        { status: 402 },
      );
    }
    countUsage = true;
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
    await logEvent("diagnose_run", {
      engine: result.engine,
      genre: body.genre ?? null,
      pro: isPro,
      hasSynopsis: Boolean(body.synopsis?.trim()),
    });
    const res = NextResponse.json(result);
    if (countUsage) res.headers.set("Set-Cookie", diagCookie(diagUsed(req.headers.get("cookie"))));
    return res;
  } catch (e) {
    console.error("[api/diagnose]", e);
    return NextResponse.json(
      { error: "진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
