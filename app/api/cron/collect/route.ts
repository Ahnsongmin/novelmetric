import { NextRequest, NextResponse } from "next/server";
import { fetchBest100WithViews, computeRetention, type RankItem } from "@/lib/munpia";
import { fetchTop100 } from "@/lib/novelpia";
import { fetchTop100 as fetchSeriesTop100 } from "@/lib/naverseries";
import { fetchRanking as fetchKakaoRanking } from "@/lib/kakaopage";
import { fetchNovelAny, fetchEpisodesAny, platformOf } from "@/lib/platform";
import {
  listTrackedNovelIds,
  listNotifyPrefs,
  listWeeklyTargets,
  getSnapshots,
  saveSnapshot,
  saveBestDaily,
  kstToday,
  dbEnabled,
} from "@/lib/db";
import { detectAlerts, digestText } from "@/lib/alerts";
import { buildWeeklyReport } from "@/lib/weekly";
import { notify } from "@/lib/notify";
import { scoreCuriosity } from "@/lib/curiosity";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    await saveBestDaily(kstToday(), { munpia, novelpia, naverseries, kakaopage });
    bestSaved = [munpia, novelpia, naverseries, kakaopage].some((a) => a.length > 0);
  } catch {
    // 베스트 수집 실패해도 추적 수집은 계속
  }

  const ids = await listTrackedNovelIds();
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

  // Pro 주간 성장 리포트 — 월요일(KST) 또는 ?weekly=1 수동 트리거
  const kstDow = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  const weeklyForced = req.nextUrl.searchParams.get("weekly") === "1";
  let weeklySent = 0;
  // 정기(Vercel cron) 월요일에만 자동 발송 — 수동/외부 트리거 재실행 시 중복 메일 방지
  if ((kstDow === 1 && isVercelCron) || weeklyForced) {
    const targets = await listWeeklyTargets();
    for (const t of targets) {
      try {
        const snaps = await getSnapshots(t.novel_id, 10);
        const stats = await fetchNovelAny(t.novel_id).catch(() => null);
        if (!stats) continue;
        const eps = await fetchEpisodesAny(t.novel_id).catch(() => []);
        const report = buildWeeklyReport({
          title: stats.title,
          platform: platformOf(t.novel_id),
          snaps,
          retention: eps.length ? computeRetention(eps) : null,
        });
        if (!report) continue;
        const r = await notify("email", t.contact, report.subject, report.body);
        if (r.sent) weeklySent++;
        await sleep(800);
      } catch {
        // 개별 실패는 다음 대상 계속
      }
    }
  }

  return NextResponse.json({
    ok: true,
    collected: ok,
    failed: errors.length,
    total: ids.length,
    notified,
    weeklySent,
    bestSaved,
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
