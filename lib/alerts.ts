// 스냅샷 변화 감지 → 알림 플래그
import type { Snapshot } from "./db";
import type { Retention } from "./munpia";

export type AlertFlag = {
  type: string;
  message: string;
  severity: "good" | "info" | "warn";
};

const SUNJAK_BENCHMARK = 200;
// 선작 이정표 — 신인 작가도 도달할 수 있게 촘촘하게
const FAV_MILESTONES = [50, 100, 200, 500, 1000, 3000];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.ceil(v)));
}

/** 직전 스냅샷 대비 최신 스냅샷의 급변 감지 — 임계값은 작품 규모에 비례 */
export function detectAlerts(prev: Snapshot, latest: Snapshot): AlertFlag[] {
  const flags: AlertFlag[] = [];
  const pFav = prev.favorites ?? 0;
  const lFav = latest.favorites ?? 0;
  const dFav = lFav - pFav;
  const pViews = prev.views ?? 0;
  const dViews = (latest.views ?? 0) - pViews;
  const pRec = prev.recommends ?? 0;
  const dRec = (latest.recommends ?? 0) - pRec;

  // 선작 이정표 돌파 (여러 개를 한 번에 넘으면 가장 높은 것만)
  const crossed = FAV_MILESTONES.filter((m) => pFav < m && lFav >= m);
  if (crossed.length) {
    const top = crossed[crossed.length - 1];
    flags.push(
      top === SUNJAK_BENCHMARK
        ? { type: "sunjak_200", message: "🎯 선작 200 돌파 — 투데이베스트를 노려볼 적기!", severity: "good" }
        : { type: `fav_milestone_${top}`, message: `🏅 선작 ${top.toLocaleString("ko-KR")} 돌파!`, severity: "good" }
    );
  }

  // 선작 급증/급감 — 규모가 작을수록 낮은 문턱 (최소 +5 / -5)
  const favUp = clamp(pFav * 0.1, 5, 100);
  const favDown = clamp(pFav * 0.05, 5, 50);
  if (dFav >= favUp) flags.push({ type: "fav_surge", message: `⭐ 선작 +${dFav.toLocaleString("ko-KR")} 급증`, severity: "good" });
  else if (dFav <= -favDown) flags.push({ type: "fav_drop", message: `⚠️ 선작 ${dFav.toLocaleString("ko-KR")} 감소`, severity: "warn" });

  // 조회수 급증 — 하루 +500 이상이면서 규모 대비 유의미할 때
  if (dViews >= clamp(pViews * 0.15, 500, 20000)) {
    flags.push({ type: "views_surge", message: `🔥 조회수 +${dViews.toLocaleString("ko-KR")} 급증`, severity: "good" });
  }
  // 추천 급증
  if (dRec >= clamp(pRec * 0.2, 10, 500)) {
    flags.push({ type: "rec_surge", message: `👍 추천 +${dRec.toLocaleString("ko-KR")} 급증`, severity: "good" });
  }

  return flags;
}

/** [Pro] 갓 확정된 이탈 구간 감지 — 상태 저장 없이 한 번만 알리기 위해,
 *  이탈 회차의 업로드일이 정확히 3일 전(최신 3화 제외 창을 막 벗어나 처음 평가 가능해진 날)인 것만 알린다. */
export function detectFreshDropoffs(r: Retention, todayKstYmd: string): AlertFlag[] {
  const todayMs = new Date(todayKstYmd + "T00:00:00+09:00").getTime();
  const flags: AlertFlag[] = [];
  for (const d of r.dropoffs) {
    const ep = r.episodes.find((e) => e.no === d.no);
    if (!ep || !/^\d{4}-\d{2}-\d{2}$/.test(ep.date)) continue;
    const ageDays = Math.round((todayMs - new Date(ep.date + "T00:00:00+09:00").getTime()) / 86_400_000);
    if (ageDays === 3) {
      flags.push({
        type: `dropoff_${d.no}`,
        message: `🚪 ${d.no}화에서 직전 대비 -${d.dropPct}% 이탈 감지 (${d.from.toLocaleString("ko-KR")} → ${d.to.toLocaleString("ko-KR")}) — 전개·끊는 지점을 점검해 보세요`,
        severity: "warn",
      });
    }
  }
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
  // 선작이 없는 플랫폼(네이버시리즈·카카오페이지)은 조회수만 표기
  const now = [
    d.latest.favorites != null ? `선작 ${d.latest.favorites.toLocaleString("ko-KR")}` : null,
    `조회 ${(d.latest.views ?? 0).toLocaleString("ko-KR")}`,
  ]
    .filter(Boolean)
    .join(" / ");
  const lines = [
    `[노블메트릭] "${d.title}" 변화 알림`,
    ...d.flags.map((f) => `· ${f.message}`),
    `현재 ${now}`,
    `→ https://novelmetric.vercel.app/dashboard`,
  ];
  return lines.join("\n");
}
