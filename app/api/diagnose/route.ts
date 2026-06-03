import { NextRequest, NextResponse } from "next/server";
import { diagnose, type DiagnoseInput } from "@/lib/diagnose";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: DiagnoseInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
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
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/diagnose]", e);
    return NextResponse.json(
      { error: "진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
