import { NextRequest, NextResponse } from "next/server";
import { fetchNovel } from "@/lib/munpia";
import { listTrackedNovelIds, saveSnapshot, dbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

// 매일 1회 추적 작품들의 지표를 수집해 스냅샷으로 적재 (Vercel Cron이 호출)
// 보호: CRON_SECRET 설정 시 Authorization: Bearer <secret> 또는 Vercel Cron 헤더 필요
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

  const ids = await listTrackedNovelIds();
  let ok = 0;
  const errors: number[] = [];
  for (const id of ids) {
    try {
      const stats = await fetchNovel(id);
      await saveSnapshot(stats);
      ok++;
      await sleep(800); // throttle: 사이트 부하 방지
    } catch {
      errors.push(id);
    }
  }
  return NextResponse.json({ ok: true, collected: ok, failed: errors.length, total: ids.length });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
