// 장르 벤치마크 — 상위권 스캔 풀 대비 내 작품의 위치
// 연독률 풀: nm_best_daily.paidBench 행들 (매일 12작품 회차 스캔의 부산물, lib/paidbench)
// 성장 풀: nm_best_daily 베스트 목록의 조회수 스냅샷 (7일 전 vs 오늘)
// 같은 장르 표본이 5개 미만이면 플랫폼 전체로 폴백하고 scope로 구분해 표기한다.

import type { RankItem } from "./munpia";
import type { PaidTransitionRow } from "./paidbench";

const MIN_POOL = 5;

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

export type RetentionBench = {
  sampleSize: number;
  median: number; // 풀 연독률 중앙값(%)
  rank: number; // 내 작품이 풀에 끼면 몇 위 수준인지 (1 = 최고)
  scope: "genre" | "platform";
};

/** 상위권 스캔 풀에서 같은 플랫폼(가능하면 같은 장르)의 연독률 분포 대비 내 위치 */
export function retentionBenchmark(
  rows: PaidTransitionRow[],
  platform: string,
  genre: string,
  myRate: number
): RetentionBench | null {
  // 작품별 최신 스캔만
  const latest = new Map<number, PaidTransitionRow>();
  for (const r of rows) {
    if (r.platform !== platform || r.adjustedRate == null) continue;
    const prev = latest.get(r.novelId);
    if (!prev || r.scannedAt > prev.scannedAt) latest.set(r.novelId, r);
  }
  const all = [...latest.values()];
  const genrePool = genre ? all.filter((r) => r.genre === genre) : [];
  const scope: RetentionBench["scope"] = genrePool.length >= MIN_POOL ? "genre" : "platform";
  const pool = (scope === "genre" ? genrePool : all).map((r) => r.adjustedRate!);
  if (pool.length < MIN_POOL) return null;
  return {
    sampleSize: pool.length,
    median: median(pool)!,
    rank: pool.filter((v) => v > myRate).length + 1,
    scope,
  };
}

export type GrowthBench = {
  sampleSize: number;
  medianDelta: number; // 기간 내 조회 증가 중앙값
  scope: "genre" | "platform";
  days: number;
};

/** 두 시점의 베스트 목록에 모두 있는 작품들의 조회 증가 중앙값 (장르 우선, 부족하면 전체) */
export function growthBenchmark(
  oldList: RankItem[],
  newList: RankItem[],
  genre: string,
  days = 7
): GrowthBench | null {
  const oldViews = new Map<number, number>();
  for (const it of oldList) {
    if (it.novelId != null && it.views != null) oldViews.set(it.novelId, it.views);
  }
  const deltas: { genre: string; d: number }[] = [];
  for (const it of newList) {
    if (it.novelId == null || it.views == null) continue;
    const prev = oldViews.get(it.novelId);
    if (prev == null) continue;
    const d = it.views - prev;
    if (d < 0) continue; // 집계 리셋 등 이상치 제외
    deltas.push({ genre: it.genre ?? "", d });
  }
  const genreDeltas = genre ? deltas.filter((x) => x.genre === genre).map((x) => x.d) : [];
  const scope: GrowthBench["scope"] = genreDeltas.length >= MIN_POOL ? "genre" : "platform";
  const pool = scope === "genre" ? genreDeltas : deltas.map((x) => x.d);
  if (pool.length < MIN_POOL) return null;
  return { sampleSize: pool.length, medianDelta: Math.round(median(pool)!), scope, days };
}
