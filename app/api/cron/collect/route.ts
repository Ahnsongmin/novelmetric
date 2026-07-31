import { NextRequest, NextResponse } from "next/server";
import { fetchBest100WithViews, computeRetention, type RankItem } from "@/lib/munpia";
import { fetchTop100 } from "@/lib/novelpia";
import { fetchTop100 as fetchSeriesTop100 } from "@/lib/naverseries";
import { fetchRanking as fetchKakaoRanking } from "@/lib/kakaopage";
import { fetchNovelAny, fetchEpisodesAny, platformOf } from "@/lib/platform";
import {
  listTrackedNovelIds,
  listRecentlyViewedIds,
  listNotifyPrefs,
  listWeeklyTargets,
  getSnapshots,
  saveSnapshot,
  saveBestDaily,
  getBestDaily,
  getRecentPaidBench,
  kstToday,
  dbEnabled,
  type BestDaily,
} from "@/lib/db";
import { retentionBenchmark, growthBenchmark } from "@/lib/benchmark";
import { detectAlerts, detectFreshDropoffs, digestText } from "@/lib/alerts";
import { buildWeeklyReport, buildCompareReport, type CompareWork } from "@/lib/weekly";
import { notify } from "@/lib/notify";
import { scoreCuriosity } from "@/lib/curiosity";
import { scanPaidTransitions } from "@/lib/paidbench";

export const runtime = "nodejs";
export const maxDuration = 300;

// 조회 기반 자동 수집분의 상한. 실측 기준 작품당 약 2.7초(추적 47작품에 127초)라,
// 300초 예산 안에서 추적분 + 이 정도까지는 여유롭게 끝난다. 넘치면 최근 조회순으로 잘린다.
const WATCH_COLLECT_LIMIT = 60;

// 매일 1회: 추적 작품 지표 수집 → 스냅샷 적재 → 변화 감지 → 채널별 알림 발송
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (!isVercelCron && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!dbEnabled()) {
    return NextResponse.json({ ok: false, reason: "DB 미연결(Supabase 키 없음)" });
  }

  // 오늘 베스트 아카이브 (문피아·노벨피아·네이버시리즈·카카오페이지) — /insights 자동 콘텐츠의 원천
  let bestSaved = false;
  let benchScanned = 0;
  let bestToday: BestDaily | null = null; // 주간 성장 벤치마크(7일 전 아카이브 대비)에 재사용
  try {
    const [munpia, novelpia, naverseries, kakaopage] = await Promise.all([
      fetchBest100WithViews().catch(() => [] as RankItem[]),
      fetchTop100().catch(() => [] as RankItem[]),
      fetchSeriesTop100().catch(() => [] as RankItem[]),
      fetchKakaoRanking().catch(() => [] as RankItem[]),
    ]);
    // 제목 궁금증 지수 채점(플랫폼별 1회 호출). 실패해도 수집은 계속 — 점수만 비워진다.
    await Promise.all([
      attachCuriosity(munpia),
      attachCuriosity(novelpia),
      attachCuriosity(naverseries),
      attachCuriosity(kakaopage),
    ]);
    // 유료 전환 벤치마크: 회차별 데이터가 있는 문피아·노벨피아 상위작을 매일 일부씩 순환 스캔
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const paidBench = await scanPaidTransitions(
      [
        { platform: "munpia", items: munpia },
        { platform: "novelpia", items: novelpia },
      ],
      dayIndex
    ).catch(() => []);
    benchScanned = paidBench.length;
    bestToday = { munpia, novelpia, naverseries, kakaopage, paidBench };
    await saveBestDaily(kstToday(), bestToday);
    bestSaved = [munpia, novelpia, naverseries, kakaopage].some((a) => a.length > 0);
  } catch {
    // 베스트 수집 실패해도 추적 수집은 계속
  }

  // 수집 대상 = 사용자가 등록한 추적 작품 + 최근 30일 안에 조회된 작품.
  // 추적분을 먼저 넣어 예산이 부족해도 유료·알림 대상이 밀리지 않게 한다.
  const trackedIds = await listTrackedNovelIds();
  const viewedIds = (await listRecentlyViewedIds(WATCH_COLLECT_LIMIT)).filter(
    (id) => !trackedIds.includes(id),
  );
  const ids = [...trackedIds, ...viewedIds];
  let ok = 0;
  const errors: number[] = [];
  for (const id of ids) {
    try {
      const stats = await fetchNovelAny(id);
      await saveSnapshot(stats);
      ok++;
      await sleep(800); // throttle
    } catch {
      errors.push(id);
    }
  }

  // 변화 감지 + 알림 발송
  let notified = 0;
  const prefs = await listNotifyPrefs();
  for (const p of prefs) {
    if (!p.contact) continue;
    const snaps = await getSnapshots(p.novel_id, 2);
    if (snaps.length < 2) continue;
    const flags = detectAlerts(snaps[snaps.length - 2], snaps[snaps.length - 1]);
    if (!flags.length) continue;
    const stats = await fetchNovelAny(p.novel_id).catch(() => null);
    const title = stats?.title ?? `작품 ${p.novel_id}`;
    const body = digestText({
      novelId: p.novel_id,
      title,
      channel: p.notify_channel,
      contact: p.contact,
      flags,
      latest: snaps[snaps.length - 1],
    });
    const r = await notify(p.notify_channel, p.contact, `[노블메트릭] ${title} 변화 알림`, body);
    if (r.sent) notified++;
  }

  // [Pro 덤] 이탈 경보 — Pro 추적 작품은 매일 연독률을 다시 계산해,
  // 갓 평가 가능해진 회차의 급락(이탈)을 다음날 아침 메일로 알린다
  let dropoffAlerted = 0;
  try {
    const proTargets = await listWeeklyTargets();
    const today = kstToday();
    for (const t of proTargets) {
      try {
        const eps = await fetchEpisodesAny(t.novel_id).catch(() => []);
        if (eps.length < 8) continue;
        const r = computeRetention(eps);
        const flags = detectFreshDropoffs(r, today);
        if (!flags.length) continue;
        const stats = await fetchNovelAny(t.novel_id).catch(() => null);
        const title = stats?.title ?? `작품 ${t.novel_id}`;
        const body = [
          `[노블메트릭 Pro] "${title}" 이탈 경보`,
          ...flags.map((f) => `· ${f.message}`),
          `→ https://novelmetric.vercel.app/dashboard`,
        ].join("\n");
        const res = await notify("email", t.contact, `[노블메트릭] ${title} 이탈 경보`, body);
        if (res.sent) dropoffAlerted++;
        await sleep(800);
      } catch {
        // 개별 실패는 다음 대상 계속
      }
    }
  } catch {
    // 이탈 경보 실패해도 나머지 계속
  }

  // Pro 주간 성장 리포트 — 월요일(KST) 또는 ?weekly=1 수동 트리거
  const kstDow = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  const weeklyForced = req.nextUrl.searchParams.get("weekly") === "1";
  let weeklySent = 0;
  let compareSent = 0;
  // 정기(Vercel cron) 월요일에만 자동 발송 — 수동/외부 트리거 재실행 시 중복 메일 방지
  if ((kstDow === 1 && isVercelCron) || weeklyForced) {
    const targets = await listWeeklyTargets();
    // 장르 벤치마크 재료 — 연독률 풀(최근 90일 스캔)과 7일 전 베스트 아카이브
    const weekAgoDay = new Date(Date.now() + 9 * 3600_000 - 7 * 86_400_000).toISOString().slice(0, 10);
    const [benchPool, bestWeekAgo] = await Promise.all([
      getRecentPaidBench().catch(() => []),
      getBestDaily(weekAgoDay).catch(() => null),
    ]);
    // [Pro] 경쟁작 워치 — 같은 연락처가 추적하는 작품들을 모아 주간 비교표를 한 통으로
    const compareByContact = new Map<string, Map<number, CompareWork>>();
    for (const t of targets) {
      try {
        const snaps = await getSnapshots(t.novel_id, 10);
        const stats = await fetchNovelAny(t.novel_id).catch(() => null);
        if (!stats) continue;
        const eps = await fetchEpisodesAny(t.novel_id).catch(() => []);
        const retention = eps.length ? computeRetention(eps) : null;
        const platform = platformOf(t.novel_id);
        if (!compareByContact.has(t.contact)) compareByContact.set(t.contact, new Map());
        compareByContact.get(t.contact)!.set(t.novel_id, {
          title: stats.title,
          platform,
          snaps,
          retention,
        });
        const report = buildWeeklyReport({
          title: stats.title,
          platform,
          snaps,
          retention,
          genreBench:
            retention?.adjustedRate != null
              ? retentionBenchmark(benchPool, platform, stats.genre, retention.adjustedRate)
              : null,
          growthBench:
            bestToday && bestWeekAgo
              ? growthBenchmark(bestWeekAgo[platform] ?? [], bestToday[platform] ?? [], stats.genre)
              : null,
        });
        if (!report) continue;
        const r = await notify("email", t.contact, report.subject, report.body);
        if (r.sent) weeklySent++;
        await sleep(800);
      } catch {
        // 개별 실패는 다음 대상 계속
      }
    }
    for (const [contact, works] of compareByContact) {
      const report = buildCompareReport([...works.values()]);
      if (!report) continue; // 2작품 미만 또는 비교창 미성립
      const r = await notify("email", contact, report.subject, report.body);
      if (r.sent) compareSent++;
      await sleep(800);
    }
  }

  return NextResponse.json({
    ok: true,
    collected: ok,
    failed: errors.length,
    total: ids.length,
    tracked: trackedIds.length,
    watched: viewedIds.length, // 조회만으로 자동 수집된 작품 수
    notified,
    weeklySent,
    compareSent,
    bestSaved,
    benchScanned,
    dropoffAlerted,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** items[].questionScore 를 제자리 채움. 실패 시 조용히 넘어가 수집을 막지 않는다.
 *  휴리스틱 폴백 결과는 저장하지 않는다 — 페이지가 "AI 채점"으로 표기하므로
 *  Claude 채점일 때만 기록하고, 아니면 점수 없이 저장돼 카드가 뜨지 않는다. */
async function attachCuriosity(items: RankItem[]): Promise<void> {
  if (!items.length) return;
  try {
    const { scores, engine } = await scoreCuriosity(items.map((it) => it.title));
    if (engine !== "claude") return;
    items.forEach((it, i) => {
      it.questionScore = typeof scores[i] === "number" ? scores[i] : null;
    });
  } catch (e) {
    console.error("[cron] 궁금증 채점 실패:", e);
  }
}
