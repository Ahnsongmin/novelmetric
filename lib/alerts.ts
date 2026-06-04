// 스냅샷 변화 감지 → 알림 플래그
import type { Snapshot } from "./db";

export type AlertFlag = {
  type: string;
  message: string;
  severity: "good" | "info" | "warn";
};

const SUNJAK_BENCHMARK = 200;

/** 직전 스냅샷 대비 최신 스냅샷의 급변 감지 */
export function detectAlerts(prev: Snapshot, latest: Snapshot): AlertFlag[] {
  const flags: AlertFlag[] = [];
  const pFav = prev.favorites ?? 0;
  const lFav = latest.favorites ?? 0;
  const dFav = lFav - pFav;
  const dViews = (latest.views ?? 0) - (prev.views ?? 0);
  const dRec = (latest.recommends ?? 0) - (prev.recommends ?? 0);

  // 투베 적기 돌파
  if (pFav < SUNJAK_BENCHMARK && lFav >= SUNJAK_BENCHMARK) {
    flags.push({ type: "sunjak_200", message: "🎯 선작 200 돌파 — 투데이베스트를 노려볼 적기!", severity: "good" });
  }
  // 선작 급증/급감
  if (dFav >= 50) flags.push({ type: "fav_surge", message: `⭐ 선작 +${dFav.toLocaleString("ko-KR")} 급증`, severity: "good" });
  else if (dFav <= -30) flags.push({ type: "fav_drop", message: `⚠️ 선작 ${dFav.toLocaleString("ko-KR")} 감소`, severity: "warn" });

  // 조회수 급증
  if (dViews >= 5000) flags.push({ type: "views_surge", message: `🔥 조회수 +${dViews.toLocaleString("ko-KR")} 급증`, severity: "good" });
  // 추천 급증
  if (dRec >= 100) flags.push({ type: "rec_surge", message: `👍 추천 +${dRec.toLocaleString("ko-KR")} 급증`, severity: "good" });

  return flags;
}

/** 알림 다이제스트 한 건(작품별) */
export type NovelDigest = {
  novelId: number;
  title: string;
  channel: string;
  contact: string;
  flags: AlertFlag[];
  latest: Snapshot;
};

export function digestText(d: NovelDigest): string {
  const lines = [
    `[노블메트릭] "${d.title}" 변화 알림`,
    ...d.flags.map((f) => `· ${f.message}`),
    `현재 선작 ${(d.latest.favorites ?? 0).toLocaleString("ko-KR")} / 조회 ${(d.latest.views ?? 0).toLocaleString("ko-KR")}`,
    `→ https://novelmetric.vercel.app/dashboard`,
  ];
  return lines.join("\n");
}
