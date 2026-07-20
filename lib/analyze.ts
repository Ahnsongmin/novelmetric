// 베스트 랭킹 데이터 분석 (마케팅 콘텐츠/인사이트용)
import type { RankItem, NovelStats, Episode } from "./munpia";

// ---------- 연참 리듬(업로드 주기) 분석 ----------

export type Cadence = {
  totalEpisodes: number;
  avgGapDays: number | null; // 평균 연참 간격(일)
  perWeek: number | null; // 주당 평균 연재 수
  recent30: number; // 최근 30일 연재 수
  daysSinceLast: number | null; // 마지막 연재 후 경과일
  lastDate: string | null;
  regularity: "규칙적" | "다소 불규칙" | "불규칙" | null; // 간격 변동성 기준
  onHiatus: boolean; // 휴재 의심(평균 간격의 3배 & 7일 초과)
  note: string;
};

/** 회차 날짜로 연재 리듬 분석. 작가가 가장 신경 쓰는 '연참 규칙성'을 수치화. */
export function computeCadence(eps: Episode[], now: Date = new Date()): Cadence | null {
  const dates = eps
    .map((e) => e.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map((d) => new Date(d + "T00:00:00+09:00").getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  if (dates.length < 2) return null;

  const DAY = 86_400_000;
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY);
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

  const lastMs = dates[dates.length - 1];
  const daysSinceLast = Math.max(0, Math.floor((now.getTime() - lastMs) / DAY));
  const cutoff30 = now.getTime() - 30 * DAY;
  const recent30 = dates.filter((t) => t >= cutoff30).length;

  // 변동계수(표준편차/평균)로 규칙성 판정
  const mean = avgGap || 1;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  const regularity: Cadence["regularity"] = cv < 0.4 ? "규칙적" : cv < 0.9 ? "다소 불규칙" : "불규칙";

  const onHiatus = daysSinceLast > Math.max(avgGap * 3, 7);
  const perWeek = avgGap > 0 ? Math.round((7 / avgGap) * 10) / 10 : null;

  let note: string;
  if (onHiatus) note = `마지막 연재 후 ${daysSinceLast}일 — 휴재로 보일 수 있어요. 독자 이탈 전에 공지나 연재 재개를 권합니다.`;
  else if (regularity === "규칙적") note = `연참 간격이 일정합니다(평균 ${avgGap.toFixed(1)}일). 독자가 다음 화를 기다리기 좋은 리듬이에요.`;
  else note = `연참 간격이 들쭉날쭉해요(평균 ${avgGap.toFixed(1)}일). 일정한 요일·주기를 잡으면 연독률이 안정됩니다.`;

  return {
    totalEpisodes: eps.length,
    avgGapDays: Math.round(avgGap * 10) / 10,
    perWeek,
    recent30,
    daysSinceLast,
    lastDate: eps.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).slice(-1)[0]?.date ?? null,
    regularity,
    onHiatus,
    note,
  };
}

// 웹소설 제목 후킹 클리셰 사전
export const HOOKS: { label: string; re: RegExp }[] = [
  { label: "회귀", re: /회귀|리턴|돌아|다시\s?시작/ },
  { label: "빙의", re: /빙의|빙의했|들어왔/ },
  { label: "환생", re: /환생|다시\s?태어/ },
  { label: "먼치킨/최강", re: /천재|최강|먼치킨|S+급|랭커|만렙|최고|전능/ },
  { label: "악역/흑막", re: /악역|악녀|빌런|흑막/ },
  { label: "신분/관계", re: /황제|황녀|공작|재벌|회장|계약|결혼|약혼/ },
  { label: "사이다/전개", re: /했더니|하게\s?되었|줍줍|날먹|착각|키웠|살렸/ },
  { label: "게임/탑/헌터", re: /헌터|탑\s?등반|던전|레벨|스킬|게임|시스템/ },
];

export type BestAnalysis = {
  total: number;
  genres: { name: string; count: number }[];
  hooks: { label: string; count: number; pct: number }[];
  avgViewsWithHook: number;
  avgViewsNoHook: number;
  topKeywords: { word: string; count: number }[];
  // 제목 궁금증(호기심 갭) 지수 분석 — questionScore가 채점된 데이터에서만 채워진다(옛 데이터는 null)
  curiosity: CuriosityAnalysis | null;
};

export type CuriosityAnalysis = {
  scored: number; // 궁금증 점수가 매겨진 작품 수
  avgViewsHigh: number; // 궁금증 상위 그룹 평균 조회수
  avgViewsLow: number; // 궁금증 하위 그룹 평균 조회수
  quantile: number; // 상·하위를 가른 분위 비율(예: 0.25 = 상/하위 25%)
};

const STOPWORDS = new Set([
  "그","이","저","것","수","나","내","의","에","를","은","는","이런","그런",
  "NEW","UP","DOWN","화","독점","무료",
]);

export function analyzeBest(items: RankItem[]): BestAnalysis {
  const total = items.length || 1;

  // 장르 분포
  const genreMap = new Map<string, number>();
  for (const it of items) {
    const g = it.genre || "기타";
    genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
  }
  const genres = [...genreMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 후킹 클리셰 빈도
  const hooks = HOOKS.map((h) => {
    const count = items.filter((it) => h.re.test(it.title)).length;
    return { label: h.label, count, pct: Math.round((count / total) * 100) };
  }).sort((a, b) => b.count - a.count);

  // 후킹 유무에 따른 평균 조회수
  const anyHook = (t: string) => HOOKS.some((h) => h.re.test(t));
  const withHook = items.filter((it) => anyHook(it.title) && it.views);
  const noHook = items.filter((it) => !anyHook(it.title) && it.views);
  const avg = (arr: RankItem[]) =>
    arr.length ? Math.round(arr.reduce((s, it) => s + (it.views ?? 0), 0) / arr.length) : 0;

  // 제목 키워드 빈도 (2글자 이상 토큰)
  const wordMap = new Map<string, number>();
  for (const it of items) {
    const tokens = it.title.split(/[\s,()\[\]:!?·~"']+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
    for (const w of tokens) wordMap.set(w, (wordMap.get(w) ?? 0) + 1);
  }
  const topKeywords = [...wordMap.entries()]
    .map(([word, count]) => ({ word, count }))
    .filter((k) => k.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    total: items.length,
    genres,
    hooks,
    avgViewsWithHook: avg(withHook),
    avgViewsNoHook: avg(noHook),
    topKeywords,
    curiosity: analyzeCuriosity(items),
  };
}

/** 제목 궁금증 지수 상위 그룹 vs 하위 그룹의 평균 조회수 비교.
 *  후킹 클리셰 유무(avgViewsWithHook/NoHook)와 별개로, '궁금증을 유발하는 제목'이
 *  실제 조회수와 어떻게 붙는지 본다. questionScore·views가 둘 다 있는 작품만 대상. */
function analyzeCuriosity(items: RankItem[]): CuriosityAnalysis | null {
  const scored = items
    .filter((it) => typeof it.questionScore === "number" && (it.views ?? 0) > 0)
    .map((it) => ({ score: it.questionScore as number, views: it.views as number }))
    .sort((a, b) => b.score - a.score);
  if (scored.length < 8) return null; // 표본이 너무 적으면 분위 비교가 무의미

  const quantile = 0.25;
  const k = Math.max(1, Math.floor(scored.length * quantile));
  const high = scored.slice(0, k);
  const low = scored.slice(-k);
  const avg = (arr: { views: number }[]) =>
    arr.length ? Math.round(arr.reduce((s, x) => s + x.views, 0) / arr.length) : 0;
  return { scored: scored.length, avgViewsHigh: avg(high), avgViewsLow: avg(low), quantile };
}

// ---------- 경쟁 벤치마크 (내 작품 vs 오늘 베스트) ----------

export type GenreBenchmark = {
  genre: string;
  sampleSize: number;
  avgViews: number; // 투베 표본 누적 총조회수 평균
  avgRecommends: number; // 투베 표본 누적 추천수 평균
  avgViewsPerEp: number | null; // 투베 표본 화당 평균 조회 (누적조회÷연재화수)
  myViews: number | null;
  myRecommends: number | null;
  myViewsPerEp: number | null;
  viewsRatio: number | null; // 내 누적 조회수 / 투베 누적 평균
  recommendsRatio: number | null;
  todayBestRank: number | null; // 오늘 베스트에 있으면 순위
};

export function computeBenchmark(stats: NovelStats, best: RankItem[]): GenreBenchmark | null {
  if (!best.length) return null;
  const myGenre = (stats.genre || "").split(/[,\s/]/).filter(Boolean)[0] || "";
  let pool = best.filter((b) => b.genre === myGenre);
  if (pool.length < 3) pool = best; // 표본 부족 시 전체 베스트로
  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
  const avgViews = avg(pool.map((b) => b.views ?? 0).filter((v) => v > 0));
  const avgRec = avg(pool.map((b) => b.recommends ?? 0).filter((v) => v > 0));
  const perEp = pool
    .filter((b) => (b.views ?? 0) > 0 && (b.episodes ?? 0) > 0)
    .map((b) => (b.views as number) / (b.episodes as number));
  const avgViewsPerEp = perEp.length ? avg(perEp) : null;
  const myViewsPerEp =
    stats.views && stats.episodes ? Math.round(stats.views / stats.episodes) : null;
  const rank = best.find((b) => b.novelId === stats.novelId)?.rank ?? null;
  return {
    genre: myGenre || stats.genre,
    sampleSize: pool.length,
    avgViews,
    avgRecommends: avgRec,
    avgViewsPerEp,
    myViews: stats.views,
    myRecommends: stats.recommends,
    myViewsPerEp,
    viewsRatio: avgViews && stats.views ? Math.round((stats.views / avgViews) * 100) / 100 : null,
    recommendsRatio:
      avgRec && stats.recommends ? Math.round((stats.recommends / avgRec) * 100) / 100 : null,
    todayBestRank: rank,
  };
}
