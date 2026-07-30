import { NextRequest, NextResponse } from "next/server";
import { diagnose, type DiagnoseInput } from "@/lib/diagnose";
import { logEvent } from "@/lib/db";
import {
  activePassFor,
  passValidUntil,
  FREE_DIAG_PER_MONTH,
  PRO_DIAG_PER_MONTH,
} from "@/lib/pass";
import { authEnabled, bumpDiagUsed, currentUser, diagUsedByUser, type User } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: DiagnoseInput & { passCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 진단은 호출마다 실시간 AI 비용이 드는 유일한 기능이라 계정이 있어야 쓸 수 있다.
  // (쿠키로 세던 시절엔 시크릿창으로 무한 반복이 가능했다.)
  //   무료 회원 매달 1회 / Pro 월 30회. DB가 없는 환경에서는 게이트가 꺼진다.
  let user: User | null = null;
  let isPro = false;
  let used = 0;

  if (authEnabled()) {
    user = await currentUser(req);
    if (!user) {
      await logEvent("diagnose_401");
      return NextResponse.json(
        {
          error: "LOGIN_REQUIRED",
          message: "제목 진단은 무료 회원가입 후 이용할 수 있어요. 이메일만 넣으면 됩니다.",
        },
        { status: 401 },
      );
    }
    isPro = Boolean((await passValidUntil(body.passCode)) || (await activePassFor(user.id)));
    const limit = isPro ? PRO_DIAG_PER_MONTH : FREE_DIAG_PER_MONTH;
    used = await diagUsedByUser(user.id);
    if (used >= limit) {
      await logEvent("diagnose_402", { pro: isPro, limit });
      return NextResponse.json(
        isPro
          ? {
              error: "LIMIT_REACHED",
              message: `이번 달 진단 ${limit}회를 모두 썼어요. 다음 달 1일에 초기화됩니다.`,
            }
          : {
              error: "PRO_REQUIRED",
              message: `이번 달 무료 진단 ${limit}회를 다 썼어요. Pro 패스로 월 ${PRO_DIAG_PER_MONTH}회까지 진단할 수 있어요.`,
            },
        { status: 402 },
      );
    }
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
    if (user) await bumpDiagUsed(user.id, used);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/diagnose]", e);
    return NextResponse.json(
      { error: "진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
