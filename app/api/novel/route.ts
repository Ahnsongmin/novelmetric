import { NextRequest, NextResponse } from "next/server";
import {
  fetchNovel,
  fetchEpisodes,
  fetchBest,
  computeRetention,
  parseNovelId,
  type Episode,
  type RankItem,
} from "@/lib/munpia";
import { computeBenchmark } from "@/lib/analyze";
import { getSnapshots, saveSnapshot, trackNovel, dbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/novel?q=<문피아 URL 또는 작품ID>
// 라이브 지표 + (DB 연결 시) 추이 스냅샷 반환
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const novelId = parseNovelId(q);
  if (!novelId) {
    return NextResponse.json(
      { error: "문피아 작품 URL 또는 작품 ID를 입력해 주세요. 예) novel.munpia.com/555698" },
      { status: 400 }
    );
  }
  try {
    const [stats, eps, history, best] = await Promise.all([
      fetchNovel(novelId),
      fetchEpisodes(novelId).catch(() => [] as Episode[]),
      getSnapshots(novelId),
      fetchBest("today").catch(() => [] as RankItem[]),
    ]);
    const retention = eps.length ? computeRetention(eps) : null;
    const benchmark = computeBenchmark(stats, best);
    return NextResponse.json({ stats, retention, benchmark, history, dbEnabled: dbEnabled() });
  } catch (e) {
    console.error("[api/novel]", e);
    return NextResponse.json(
      { error: "작품 정보를 가져오지 못했어요. 작품 ID를 확인해 주세요." },
      { status: 502 }
    );
  }
}

// POST /api/novel { q, email? } → 추적 등록 + 첫 스냅샷 적재
export async function POST(req: NextRequest) {
  let body: { q?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const novelId = parseNovelId(body.q || "");
  if (!novelId) {
    return NextResponse.json({ error: "작품 URL/ID가 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const stats = await fetchNovel(novelId);
    await saveSnapshot(stats); // DB 없으면 no-op
    await trackNovel(novelId, body.email);
    return NextResponse.json({ ok: true, tracked: dbEnabled(), stats });
  } catch (e) {
    console.error("[api/novel POST]", e);
    return NextResponse.json({ error: "추적 등록에 실패했어요." }, { status: 502 });
  }
}
