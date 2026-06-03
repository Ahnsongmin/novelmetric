// 베스트 랭킹 데이터 분석 (마케팅 콘텐츠/인사이트용)
import type { RankItem } from "./munpia";

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
  };
}
