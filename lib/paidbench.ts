// 유료 전환 벤치마크 수집·집계
// 매일 크론이 베스트/톱100 작품 일부를 순환 스캔해 "몇 화에 유료 전환했고 통과율이 얼마였나"를
// 아카이브(nm_best_daily JSON의 paidBench 키)에 쌓는다. 신규 테이블 없이 동작.
// 분포가 쌓이면 Pro '유료 전환 타이밍' 카드의 근거 데이터가 된다.

import { computeRetention, type RankItem } from "./munpia";
import { fetchEpisodesAny, toStorageId, type Platform } from "./platform";

export type PaidTransitionRow = {
  novelId: number; // 저장 ID (플랫폼 오프셋 포함)
  platform: Platform;
  title: string;
  genre: string;
  paidStartNo: number; // 유료 전환 첫 회차
  totalEps: number;
  freeRate: number | null; // 무료 구간 연독률
  paidPassRate: number | null; // 전환 통과율
  paidRate: number | null; // 유료 구간 연독률
  scannedAt: string; // ISO
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 후보 작품들 중 오늘 스캔할 몫을 회차 스캔해 유료 전환작만 골라낸다.
 *  dayIndex로 매일 다른 구간을 순환 — 전체 후보를 여러 날에 걸쳐 커버. */
export async function scanPaidTransitions(
  candidates: { platform: Platform; items: RankItem[] }[],
  dayIndex: number,
  perDay = 12
): Promise<PaidTransitionRow[]> {
  // 플랫폼 라벨을 붙여 평평하게
  const flat = candidates.flatMap((c) =>
    c.items
      .filter((it) => it.novelId != null && it.title)
      .map((it) => ({ platform: c.platform, item: it }))
  );
  if (!flat.length) return [];

  // 오늘 몫: dayIndex 기반 순환 슬라이스
  const start = (dayIndex * perDay) % flat.length;
  const todays = [...flat.slice(start), ...flat.slice(0, start)].slice(0, perDay);

  const rows: PaidTransitionRow[] = [];
  for (const { platform, item } of todays) {
    try {
      const storageId = toStorageId(platform, item.novelId!);
      const eps = await fetchEpisodesAny(storageId);
      if (!eps.length) continue;
      const r = computeRetention(eps);
      if (r.paidStartNo == null) continue; // 아직 무료 연재 → 전환작 아님
      rows.push({
        novelId: storageId,
        platform,
        title: item.title,
        genre: item.genre ?? "",
        paidStartNo: r.paidStartNo,
        totalEps: eps.length,
        freeRate: r.freeRate,
        paidPassRate: r.paidPassRate,
        paidRate: r.paidRate,
        scannedAt: new Date().toISOString(),
      });
    } catch {
      // 개별 작품 실패는 무시하고 계속
    }
    await sleep(400); // throttle
  }
  return rows;
}

export type PaidBenchStats = {
  sampleSize: number;
  medianPaidStartNo: number | null;
  avgPaidStartNo: number | null;
  medianPassRate: number | null;
  byGenre: { genre: string; count: number; medianPaidStartNo: number | null }[];
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** 여러 날의 paidBench 행을 작품별로 최신 1건만 남기고 분포 통계로 집계 */
export function aggregatePaidBench(rows: PaidTransitionRow[]): PaidBenchStats {
  const latest = new Map<number, PaidTransitionRow>();
  for (const r of rows) {
    const prev = latest.get(r.novelId);
    if (!prev || r.scannedAt > prev.scannedAt) latest.set(r.novelId, r);
  }
  const list = [...latest.values()];
  const starts = list.map((r) => r.paidStartNo);
  const passes = list.map((r) => r.paidPassRate).filter((v): v is number => v != null);

  const genreMap = new Map<string, number[]>();
  for (const r of list) {
    const g = r.genre || "기타";
    if (!genreMap.has(g)) genreMap.set(g, []);
    genreMap.get(g)!.push(r.paidStartNo);
  }
  const byGenre = [...genreMap.entries()]
    .map(([genre, arr]) => ({ genre, count: arr.length, medianPaidStartNo: median(arr) }))
    .sort((a, b) => b.count - a.count);

  return {
    sampleSize: list.length,
    medianPaidStartNo: median(starts),
    avgPaidStartNo: starts.length ? Math.round(starts.reduce((s, v) => s + v, 0) / starts.length) : null,
    medianPassRate: median(passes),
    byGenre,
  };
}
