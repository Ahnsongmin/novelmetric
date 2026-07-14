import { NextRequest, NextResponse } from "next/server";
import { fetchBest, computeRetention, type Episode, type RankItem } from "@/lib/munpia";
import { parseQuery, platformOf, fetchNovelAny, fetchEpisodesAny } from "@/lib/platform";
import { computeBenchmark, computeCadence } from "@/lib/analyze";
import { getSnapshots, saveSnapshot, trackNovel, dbEnabled } from "@/lib/db";
import { passEnabled, passValidUntil, trackedCountByEmail, FREE_TRACK_LIMIT } from "@/lib/pass";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/novel?q=<문피아·노벨피아 URL 또는 작품ID>
// 라이브 지표 + (DB 연결 시) 추이 스냅샷 반환
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const novelId = parseQuery(q);
  if (!novelId) {
    return NextResponse.json(
      { error: "문피아·노벨피아 작품 URL 또는 작품 ID를 입력해 주세요. 예) novelpia.com/novel/300000" },
      { status: 400 }
    );
  }
  const isMunpia = platformOf(novelId) === "munpia";
  try {
    const [stats, eps, history, best] = await Promise.all([
      fetchNovelAny(novelId),
      fetchEpisodesAny(novelId).catch(() => [] as Episode[]),
      getSnapshots(novelId),
      // 투베 벤치마크는 문피아 기준 — 노벨피아 작품엔 미적용
      isMunpia ? fetchBest("today").catch(() => [] as RankItem[]) : Promise.resolve([] as RankItem[]),
    ]);
    const retention = eps.length ? computeRetention(eps) : null;
    const cadence = eps.length ? computeCadence(eps) : null;
    const benchmark = isMunpia ? computeBenchmark(stats, best) : null;
    return NextResponse.json({ stats, retention, cadence, benchmark, history, dbEnabled: dbEnabled() });
  } catch (e) {
    console.error("[api/novel]", e);
    return NextResponse.json(
      { error: "작품 정보를 가져오지 못했어요. 작품 ID를 확인해 주세요. (성인작품은 지원되지 않아요)" },
      { status: 502 }
    );
  }
}

// POST /api/novel { q, channel?, contact?, passCode? } → 추적 등록 + 첫 스냅샷 적재
export async function POST(req: NextRequest) {
  let body: { q?: string; channel?: string; contact?: string; passCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const novelId = parseQuery(body.q || "");
  if (!novelId) {
    return NextResponse.json({ error: "작품 URL/ID가 올바르지 않습니다." }, { status: 400 });
  }
  const channel = ["email", "kakao"].includes(body.channel || "") ? body.channel : "none";

  // 무료는 이메일당 1작품 추적 — Pro 패스면 무제한. 결제 env 없으면 제한 없음.
  if (passEnabled() && body.contact && !(await passValidUntil(body.passCode))) {
    const count = await trackedCountByEmail(body.contact, novelId);
    if (count >= FREE_TRACK_LIMIT) {
      return NextResponse.json(
        { error: "PRO_REQUIRED", message: `무료는 ${FREE_TRACK_LIMIT}작품까지 추적할 수 있어요. Pro 패스로 무제한 추적하세요.` },
        { status: 402 },
      );
    }
  }
  try {
    const stats = await fetchNovelAny(novelId);
    await saveSnapshot(stats); // DB 없으면 no-op
    await trackNovel(novelId, { channel, contact: body.contact });
    return NextResponse.json({ ok: true, tracked: dbEnabled(), stats });
  } catch (e) {
    console.error("[api/novel POST]", e);
    return NextResponse.json({ error: "추적 등록에 실패했어요." }, { status: 502 });
  }
}
