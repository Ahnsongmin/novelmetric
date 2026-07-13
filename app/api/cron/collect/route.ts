import { NextRequest, NextResponse } from "next/server";
import { fetchBest } from "@/lib/munpia";
import { fetchNovelAny } from "@/lib/platform";
import {
  listTrackedNovelIds,
  listNotifyPrefs,
  getSnapshots,
  saveSnapshot,
  saveBestDaily,
  kstToday,
  dbEnabled,
} from "@/lib/db";
import { detectAlerts, digestText } from "@/lib/alerts";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

// 매일 1회: 추적 작품 지표 수집 → 스냅샷 적재 → 변화 감지 → 채널별 알림 발송
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const isVercelCron = req.headers.get("x-vercel-cron") !== null;
    if (!isVercelCron && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!dbEnabled()) {
    return NextResponse.json({ ok: false, reason: "DB 미연결(Supabase 키 없음)" });
  }

  // 오늘 베스트 아카이브 — /insights 자동 콘텐츠의 원천
  let bestSaved = false;
  try {
    const best = await fetchBest("today");
    await saveBestDaily(kstToday(), best);
    bestSaved = best.length > 0;
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

  return NextResponse.json({
    ok: true,
    collected: ok,
    failed: errors.length,
    total: ids.length,
    notified,
    bestSaved,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
