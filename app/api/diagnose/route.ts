import { NextRequest, NextResponse } from "next/server";
import { diagnose, type DiagnoseInput } from "@/lib/diagnose";
import { logEvent } from "@/lib/db";
import {
  activePassFor,
  bumpDiagUsedByCode,
  diagUsedByCode,
  passValidUntil,
  FREE_DIAG_PER_MONTH,
  GUEST_PASS_NOTICE,
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

  // 진단은 호출마다 실시간 AI 비용이 드는 유일한 기능이라 신원이 있어야 쓸 수 있다.
  // (쿠키로 세던 시절엔 시크릿창으로 무한 반복이 가능했다.)
  //   무료 회원 매달 1회 / Pro 월 30회. DB가 없는 환경에서는 게이트가 꺼진다.
  //
  // 신원으로 인정하는 것은 두 가지다: 계정, 그리고 유효한 Pro 코드.
  // 코드도 신원이라 로그인 검사보다 먼저 본다 — 계정 없이 결제한 손님(코드만 가진 사람)이
  // 로그인 벽에 막히는 사고가 실제로 있었다(7/27 결제 손님이 7/29 배포 후 401).
  // 대신 사용량은 코드 기준으로 세고, 응답에 가입 권유 안내를 함께 실어 보낸다.
  let user: User | null = null;
  let isPro = false;
  let used = 0;
  let guestCode: string | null = null;

  if (authEnabled()) {
    user = await currentUser(req);
    const passUntil = await passValidUntil(body.passCode);
    if (!user && !passUntil) {
      await logEvent("diagnose_401");
      return NextResponse.json(
        {
          error: "LOGIN_REQUIRED",
          message: "제목 진단은 무료 회원가입 후 이용할 수 있어요. 이메일과 비밀번호만 정하면 30초면 됩니다.",
        },
        { status: 401 },
      );
    }
    if (!user && passUntil) guestCode = body.passCode!;
    isPro = Boolean(passUntil || (user && (await activePassFor(user.id))));
    const limit = isPro ? PRO_DIAG_PER_MONTH : FREE_DIAG_PER_MONTH;
    used = user ? await diagUsedByUser(user.id) : await diagUsedByCode(guestCode!);
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
      guestPass: Boolean(guestCode),
      hasSynopsis: Boolean(body.synopsis?.trim()),
    });
    if (user) await bumpDiagUsed(user.id, used);
    else if (guestCode) await bumpDiagUsedByCode(guestCode, used);
    return NextResponse.json(guestCode ? { ...result, notice: GUEST_PASS_NOTICE } : result);
  } catch (e) {
    console.error("[api/diagnose]", e);
    return NextResponse.json(
      { error: "진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
