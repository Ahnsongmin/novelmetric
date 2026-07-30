import { NextRequest, NextResponse } from "next/server";
import { fetchBest, computeRetention, type Episode, type RankItem } from "@/lib/munpia";
import { parseQuery, platformOf, fetchNovelAny, fetchEpisodesAny } from "@/lib/platform";
import { computeBenchmark, computeCadence } from "@/lib/analyze";
import { retentionBenchmark } from "@/lib/benchmark";
import { getSnapshots, saveSnapshot, trackNovel, dbEnabled, getRecentPaidBench, logEvent } from "@/lib/db";
import { activePassFor, passValidUntil, trackedCountByOwner, FREE_TRACK_LIMIT } from "@/lib/pass";
import { anonCookie, authEnabled, currentUser, newAnonId, readAnon } from "@/lib/auth";

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
    const [stats, eps, history, best, benchPool] = await Promise.all([
      fetchNovelAny(novelId),
      fetchEpisodesAny(novelId).catch(() => [] as Episode[]),
      getSnapshots(novelId),
      // 투베 벤치마크는 문피아 기준 — 노벨피아 작품엔 미적용
      isMunpia ? fetchBest("today").catch(() => [] as RankItem[]) : Promise.resolve([] as RankItem[]),
      getRecentPaidBench().catch(() => []),
    ]);
    const retention = eps.length ? computeRetention(eps) : null;
    const cadence = eps.length ? computeCadence(eps) : null;
    const benchmark = isMunpia ? computeBenchmark(stats, best) : null;
    // 장르 벤치마크 — 상위권 스캔 풀 대비 내 연독률 위치 (풀이 아직 얇으면 null)
    const genreBench =
      retention?.adjustedRate != null
        ? retentionBenchmark(benchPool, platformOf(novelId), stats.genre, retention.adjustedRate)
        : null;
    return NextResponse.json({ stats, retention, cadence, benchmark, genreBench, history, dbEnabled: dbEnabled() });
  } catch (e) {
    console.error("[api/novel]", e);
    return NextResponse.json(
      { error: "작품 정보를 가져오지 못했어요. 작품 ID를 확인해 주세요. (성인작품은 지원되지 않아요)" },
      { status: 502 }
    );
  }
}

// POST /api/novel { q, channel?, contact?, passCode?, source? } → 추적 등록 + 첫 스냅샷 적재
//   source: 유입 경로 라벨(계측 전용). "diagnose" = 제목 진단 결과에서 넘어온 등록.
//
// 게이트: 추적 자체는 가입 없이 1작품까지 된다. 알림 채널(이메일·카톡)을 켜는 순간부터
// 계정이 필요하다 — 알림을 보낼 주소가 곧 신원이고, 예전엔 알림을 끄면 한도 검사가
// 통째로 스킵돼 무제한 등록이 가능했다.
export async function POST(req: NextRequest) {
  let body: { q?: string; channel?: string; contact?: string; passCode?: string; source?: string };
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

  const gated = authEnabled();
  const user = gated ? await currentUser(req) : null;
  let anonId: string | null = null;
  let freshAnonCookie: string | null = null;

  if (gated && !user) {
    if (channel !== "none" || body.contact) {
      await logEvent("track_401", { platform: platformOf(novelId), channel });
      return NextResponse.json(
        {
          error: "LOGIN_REQUIRED",
          message: "알림을 받으려면 무료 회원가입이 필요해요. 이메일만 넣으면 됩니다.",
        },
        { status: 401 },
      );
    }
    anonId = readAnon(req.headers.get("cookie"));
    if (!anonId) {
      anonId = newAnonId();
      freshAnonCookie = anonCookie(anonId);
    }
  }

  // 무료는 소유자당 1작품 — Pro 패스면 무제한. DB 없는 환경에서는 게이트가 꺼진다.
  // Pro 자격은 두 경로다: 손으로 넣은 코드, 또는 계정에 귀속된 패스(기기를 바꿔도 따라온다).
  const codeValid = gated ? Boolean(await passValidUntil(body.passCode)) : false;
  const isPro = codeValid || (gated ? Boolean(await activePassFor(user?.id)) : false);
  const validPass = codeValid ? body.passCode : undefined;

  if (gated && !isPro) {
    const count = await trackedCountByOwner({ userId: user?.id, anonId }, novelId);
    if (count >= FREE_TRACK_LIMIT) {
      await logEvent("track_402", { platform: platformOf(novelId), loggedIn: Boolean(user) });
      return withCookie(
        NextResponse.json(
          {
            error: "PRO_REQUIRED",
            message: `무료는 ${FREE_TRACK_LIMIT}작품까지 추적할 수 있어요. Pro 패스로 무제한 추적하세요.`,
          },
          { status: 402 },
        ),
        freshAnonCookie,
      );
    }
  }

  try {
    const stats = await fetchNovelAny(novelId);
    await saveSnapshot(stats); // DB 없으면 no-op
    await trackNovel(novelId, {
      userId: user?.id,
      anonId,
      channel,
      contact: body.contact,
      passCode: validPass, // 유효한 패스면 연결 → 주간 성장 리포트(Pro) 대상이 된다
    });
    // 같은 소유자·작품은 한 행으로 갱신되므로 재등록이 남지 않는다 → 시도 자체를 여기 기록
    await logEvent("track_add", {
      platform: platformOf(novelId),
      channel,
      pro: isPro,
      loggedIn: Boolean(user),
      fromDiagnose: body.source === "diagnose",
    });
    return withCookie(NextResponse.json({ ok: true, tracked: dbEnabled(), stats }), freshAnonCookie);
  } catch (e) {
    console.error("[api/novel POST]", e);
    return NextResponse.json({ error: "추적 등록에 실패했어요." }, { status: 502 });
  }
}

function withCookie(res: NextResponse, cookie: string | null): NextResponse {
  if (cookie) res.headers.append("Set-Cookie", cookie);
  return res;
}
