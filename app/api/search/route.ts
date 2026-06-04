import { NextRequest, NextResponse } from "next/server";
import { searchNovels } from "@/lib/munpia";

export const runtime = "nodejs";
export const maxDuration = 20;

// GET /api/search?q=제목키워드 → 작품 후보 목록
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "두 글자 이상 입력해 주세요." }, { status: 400 });
  }
  try {
    const hits = await searchNovels(q);
    return NextResponse.json({ hits });
  } catch (e) {
    console.error("[api/search]", e);
    return NextResponse.json({ error: "검색 중 오류가 발생했어요." }, { status: 502 });
  }
}
