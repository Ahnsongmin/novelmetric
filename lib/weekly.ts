// Pro 주간 성장 리포트 — 스냅샷 시계열로 지난 7일 증감을 정리한다.
// 원칙: 실측치만 쓰고, 추정은 "최근 속도 유지 가정" 명시. 근거 없는 판정·권고 없음.
import type { Snapshot } from "./db";
import type { Retention } from "./munpia";
import type { RetentionBench, GrowthBench } from "./benchmark";

const MILESTONES = [
  { label: "투베 도전 적기(통설)", threshold: 200 },
  { label: "나홀로 유료화 통용선", threshold: 1000 },
  { label: "유료화 신청 통과 통용선", threshold: 3000 },
];

function fmt(n: number | null | undefined): string {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}

function delta(n: number): string {
  return n >= 0 ? `+${n.toLocaleString("ko-KR")}` : n.toLocaleString("ko-KR");
}

/** 지난 7일 구간의 처음/끝 스냅샷 쌍. 데이터가 짧으면 가능한 범위로. */
function weekWindow(snaps: Snapshot[]): { from: Snapshot; to: Snapshot; days: number } | null {
  if (snaps.length < 2) return null;
  const to = snaps[snaps.length - 1];
  const toMs = new Date(to.collected_at).getTime();
  let from = snaps[0];
  for (const s of snaps) {
    if (toMs - new Date(s.collected_at).getTime() <= 7.5 * 86_400_000) {
      from = s;
      break;
    }
  }
  if (from === to) from = snaps[snaps.length - 2];
  const days = Math.max(1, Math.round((toMs - new Date(from.collected_at).getTime()) / 86_400_000));
  return { from, to, days };
}

export function buildWeeklyReport(opts: {
  title: string;
  platform: string;
  snaps: Snapshot[];
  retention: Retention | null;
  genreBench?: RetentionBench | null; // 상위권 연독률 분포 대비 내 위치
  growthBench?: GrowthBench | null; // 상위권 주간 조회 증가 중앙값
}): { subject: string; body: string } | null {
  const w = weekWindow(opts.snaps);
  if (!w) return null;
  const { from, to, days } = w;

  const dViews = (to.views ?? 0) - (from.views ?? 0);
  const dFav = (to.favorites ?? 0) - (from.favorites ?? 0);
  const dRec = (to.recommends ?? 0) - (from.recommends ?? 0);
  const favPerDay = dFav / days;

  const lines: string[] = [];
  lines.push(`"${opts.title}" 주간 성장 리포트 (최근 ${days}일 실측)`);
  lines.push("");
  lines.push(`📈 조회수  ${fmt(from.views)} → ${fmt(to.views)}  (${delta(dViews)})`);
  lines.push(`⭐ 선호작  ${fmt(from.favorites)} → ${fmt(to.favorites)}  (${delta(dFav)}, 하루 평균 ${delta(Math.round(favPerDay * 10) / 10)})`);
  lines.push(`👍 추천    ${fmt(from.recommends)} → ${fmt(to.recommends)}  (${delta(dRec)})`);

  if (opts.retention?.adjustedRate != null) {
    lines.push(`📖 연독률  ${opts.retention.adjustedRate}% (커뮤니티 통용 방식: 4화 기준, 최신 3화 제외)`);
  }

  // 장르 벤치마크 — 상위권 스캔 풀 대비 내 위치 (풀이 얇으면 생략)
  const scopeWord = (s: "genre" | "platform") => (s === "genre" ? "장르 상위권" : "플랫폼 상위권");
  if (opts.genreBench && opts.retention?.adjustedRate != null) {
    const g = opts.genreBench;
    lines.push(
      `📊 ${scopeWord(g.scope)} 연독률 중앙값 ${g.median}% — 내 작품 ${opts.retention.adjustedRate}% (${g.sampleSize}작품 중 ${g.rank}위 수준)`
    );
  }
  if (opts.growthBench) {
    const g = opts.growthBench;
    lines.push(
      `🏁 ${scopeWord(g.scope)} 최근 ${g.days}일 조회 증가 중앙값 ${delta(g.medianDelta)} — 내 작품 ${delta(dViews)}`
    );
  }

  // 이정표 진행 — 문피아 선작 기준 통설 (비공식)
  const fav = to.favorites;
  if (opts.platform === "munpia" && fav != null) {
    const next = MILESTONES.find((m) => fav < m.threshold);
    if (next) {
      lines.push("");
      lines.push(`🚩 다음 이정표: ${next.label} 선작 ${fmt(next.threshold)} — 현재 ${fmt(fav)} (${Math.round((fav / next.threshold) * 100)}%)`);
      if (favPerDay > 0.5) {
        const eta = Math.ceil((next.threshold - fav) / favPerDay);
        lines.push(`   최근 속도(하루 +${Math.round(favPerDay * 10) / 10})가 유지된다면 약 ${eta}일 뒤 도달 — 단순 외삽 추정입니다.`);
      }
      lines.push(`   ※ 이정표 수치는 작가 커뮤니티에서 통용되는 비공식 참고치입니다.`);
    } else {
      lines.push("");
      lines.push(`🚩 통용 이정표(선작 3,000)를 모두 넘었습니다.`);
    }
  }

  lines.push("");
  lines.push(`상세 그래프 → https://novelmetric.vercel.app/dashboard`);
  lines.push(`— 노블메트릭 Pro 주간 리포트 · 매주 월요일 발송`);

  const headline = `선작 ${delta(dFav)} · 조회 ${delta(dViews)}`;
  return { subject: `[노블메트릭] ${opts.title} 주간 리포트 — ${headline}`, body: lines.join("\n") };
}

// ── [Pro] 경쟁작 워치 — 추적 작품 전체의 주간 증감을 한 표로 비교 ─────────────
// /compare(현재 시점 1:1)와 달리, 매주 "누가 얼마나 앞서갔는지"를 실측 증감으로 줄 세운다.

export type CompareWork = {
  title: string;
  platform: string;
  snaps: Snapshot[];
  retention: Retention | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  munpia: "문피아",
  novelpia: "노벨피아",
  naverseries: "네이버시리즈",
  kakaopage: "카카오페이지",
};

/** 2작품 이상 + 각각 주간 비교창이 성립할 때만 리포트를 만든다. */
export function buildCompareReport(works: CompareWork[]): { subject: string; body: string } | null {
  const rows = works
    .map((wk) => {
      const w = weekWindow(wk.snaps);
      if (!w) return null;
      const dViews = (w.to.views ?? 0) - (w.from.views ?? 0);
      const dFav = w.to.favorites != null ? (w.to.favorites ?? 0) - (w.from.favorites ?? 0) : null;
      return {
        title: wk.title,
        platform: PLATFORM_LABEL[wk.platform] ?? wk.platform,
        dViews,
        dFav,
        fav: w.to.favorites,
        ret: wk.retention?.adjustedRate ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length < 2) return null;

  // 모든 플랫폼에 존재하는 조회(열람·다운로드) 증감 기준으로 줄 세운다
  rows.sort((x, y) => y.dViews - x.dViews);

  const lines: string[] = [];
  lines.push(`경쟁작 워치 — 추적 작품 ${rows.length}개 주간 비교 (조회 증가 순, 최근 7일 실측)`);
  lines.push("");
  rows.forEach((r, i) => {
    const parts = [
      `📈 조회 ${delta(r.dViews)}`,
      r.dFav != null ? `⭐ 선작 ${delta(r.dFav)} (현재 ${fmt(r.fav)})` : null,
      r.ret != null ? `📖 연독 ${r.ret}%` : null,
    ].filter(Boolean);
    lines.push(`${i + 1}. "${r.title}" [${r.platform}]`);
    lines.push(`   ${parts.join(" · ")}`);
  });
  lines.push("");
  lines.push(`※ 플랫폼마다 조회 집계 방식이 달라(카카오페이지 열람수·네이버시리즈 다운로드수) 순위는 참고용입니다.`);
  lines.push(`상세 그래프 → https://novelmetric.vercel.app/dashboard`);
  lines.push(`— 노블메트릭 Pro 경쟁작 워치 · 매주 월요일 발송`);

  return {
    subject: `[노블메트릭] 경쟁작 워치 — 이번 주 1위 "${rows[0].title}" (조회 ${delta(rows[0].dViews)})`,
    body: lines.join("\n"),
  };
}
