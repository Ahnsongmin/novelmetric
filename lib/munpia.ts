// 문피아(munpia) 공개 데이터 수집 모듈
// - 베스트/랭킹 리스트: mm.munpia.com (모바일, 서버렌더 HTML)
// - 개별 작품 지표·회차·검색: www.munpia.com/api/v1 (2026-07 사이트 개편으로 구 novel.munpia.com
//   HTML이 SPA 껍데기로 바뀌어, 그 SPA가 쓰는 공개 JSON API를 그대로 사용)
// robots.txt 준수 · 요청 throttle · 공개 데이터만.

import { parse } from "node-html-parser";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type RankItem = {
  rank: number;
  novelId: number | null;
  title: string;
  genre: string;
  author: string;
  episodes: number | null; // 연재 화수
  views: number | null; // 조회수
  recommends: number | null; // 추천수
  synopsis: string;
  cover: string | null;
  favorites?: number | null; // 선호작수 (노벨피아 top100 제공)
  questionScore?: number | null; // 제목 궁금증(호기심 갭) 지수 0~100 — 수집 시 1회 채점(lib/curiosity)
};

export type NovelStats = {
  novelId: number;
  title: string;
  genre: string;
  author: string;
  authorId: number | null;
  episodes: number | null; // 연재수
  views: number | null; // 조회수
  recommends: number | null; // 추천수
  chars: number | null; // 글자수
  favorites: number | null; // 선호작수
  registeredAt: string | null; // 작품등록일
  lastUpdatedAt: string | null; // 최근연재일
  collectedAt: string; // 수집 시각(ISO)
};

const BEST_SECTIONS = ["today", "week", "month", "total"] as const;
export type BestSection = (typeof BEST_SECTIONS)[number];

// cacheSecs: Next fetch 데이터 캐시(초). 베스트 등 트래픽 몰리는 페이지만 사용 — 작품 지표는 실시간 유지.
async function fetchHtml(url: string, cacheSecs?: number): Promise<string> {
  const init: RequestInit = { headers: { "User-Agent": UA } };
  if (cacheSecs) (init as { next?: { revalidate: number } }).next = { revalidate: cacheSecs };
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/** 베스트 랭킹 리스트 수집 (기본: 오늘 무료 베스트) */
export async function fetchBest(section: BestSection = "today"): Promise<RankItem[]> {
  const url = `https://mm.munpia.com/?menu=best&action=list&section=${section}`;
  const root = parse(await fetchHtml(url));
  const lis = root.querySelectorAll("li.novel-list-template");

  return lis.map((li, i): RankItem => {
    const onclick = li.getAttribute("onclick") || "";
    const idMatch = onclick.match(/view_novel\((\d+)/);
    const inquirySpans = li.querySelectorAll(".inquiry span");
    const inq = (label: string) =>
      inquirySpans.find((s) => s.text.includes(label))?.querySelector("em")?.text ?? null;

    const titleEl = li.querySelector(".title");
    const title = titleEl
      ? titleEl.text.replace(titleEl.querySelector("span")?.text ?? "", "").trim()
      : "";
    const authorRaw = li.querySelector(".author")?.text ?? "";

    return {
      rank: i + 1,
      novelId: idMatch ? parseInt(idMatch[1], 10) : null,
      title,
      genre: li.querySelector(".genre")?.text.trim() ?? "",
      author: authorRaw.split(/\s{2,}|총/)[0].trim(),
      episodes: toInt(inq("연재")),
      views: toInt(inq("조회수")),
      recommends: toInt(inq("추천수")),
      synopsis: li.querySelector(".detail p")?.text.trim() ?? "",
      cover: li.querySelector("img")?.getAttribute("src") ?? null,
    };
  });
}

/** 투데이 베스트 TOP100 — www.munpia.com/best/today (SSR HTML, 순위·제목·장르·작가).
 *  조회수는 이 페이지에 없어 상위 10위는 fetchBest(모바일)에서 병합한다. */
export async function fetchBest100(): Promise<RankItem[]> {
  const html = await fetchHtml("https://www.munpia.com/best/today", 1800);
  const chunks = html.split(/<a href="https:\/\/www\.munpia\.com\/novel\/detail\//).slice(1);

  const seen = new Set<number>();
  const items: RankItem[] = [];
  for (const chunk of chunks) {
    const id = chunk.match(/^(\d+)/)?.[1];
    if (!id) continue;
    const novelId = parseInt(id, 10);
    if (seen.has(novelId)) continue;

    const rank =
      chunk.match(/class="rank-num">\s*<span>(\d+)<\/span>/)?.[1] ??
      chunk.match(/class="month">(\d+)/)?.[1];
    const titleBlock = chunk.match(/class="novel-title">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const title = titleBlock.match(/<span>([^<]+)<\/span>\s*$/)?.[1]?.trim() ?? "";
    if (!rank || !title) continue;

    seen.add(novelId);
    items.push({
      rank: parseInt(rank, 10),
      novelId,
      title,
      genre: chunk.match(/class="novel-genre">\s*<span>([^<]*)<\/span>/)?.[1]?.trim() ?? "",
      author: chunk.match(/class="novel-author">([^<]*)</)?.[1]?.trim() ?? "",
      episodes: null,
      views: null,
      recommends: null,
      synopsis: "",
      cover: chunk.match(/<img src="([^"]+)"/)?.[1] ?? null,
    });
  }
  items.sort((a, b) => a.rank - b.rank);
  return items.filter((it) => it.rank <= 100);
}

/** TOP100 + 상위권 조회수 병합 (모바일 베스트의 조회·추천을 같은 작품에 매칭) */
export async function fetchBest100WithViews(): Promise<RankItem[]> {
  const [top100, top10] = await Promise.all([
    fetchBest100(),
    fetchBest("today").catch(() => [] as RankItem[]),
  ]);
  if (!top10.length) return top100;
  const byId = new Map(top10.filter((t) => t.novelId).map((t) => [t.novelId, t]));
  return top100.map((it) => {
    const src = it.novelId ? byId.get(it.novelId) : undefined;
    return src ? { ...it, views: src.views, recommends: src.recommends, episodes: src.episodes } : it;
  });
}

type MunpiaNovelInfo = {
  title?: string;
  genres?: string[];
  genreBestName?: string;
  authorName?: string;
  chapterCount?: number;
  viewCount?: number;
  likeCount?: number;
  characters?: number;
  preferenceCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** 개별 작품 지표 수집 */
export async function fetchNovel(novelId: number): Promise<NovelStats> {
  const json = await fetchJson<{ result?: { novelInfo?: MunpiaNovelInfo } }>(
    `https://www.munpia.com/api/v1/pc/novel-detail/${novelId}`
  );
  const n = json.result?.novelInfo;
  if (!n?.title) throw new Error(`작품 ${novelId} 정보 없음(삭제·비공개 가능성)`);

  return {
    novelId,
    title: n.title,
    genre: n.genres?.[0] ?? n.genreBestName ?? "",
    author: n.authorName ?? "",
    authorId: null, // 개편 API는 작가 번호를 제공하지 않음
    episodes: n.chapterCount ?? null,
    views: n.viewCount ?? null,
    recommends: n.likeCount ?? null,
    chars: n.characters ?? null,
    favorites: n.preferenceCount ?? null,
    registeredAt: n.createdAt ?? null,
    lastUpdatedAt: n.updatedAt ?? null,
    collectedAt: new Date().toISOString(),
  };
}

// ---------- 작품 검색 (제목으로) ----------

export type SearchHit = {
  novelId: number;
  title: string;
  author: string;
  genre: string;
  cover: string | null;
};

type MunpiaSearchDto = {
  novelId?: number;
  title?: string;
  author?: string;
  mainGenre?: string;
  subGenre?: string;
  coverUrl?: string;
};

/** 제목 키워드로 문피아 작품 검색 → 후보 목록 (유사도순 정렬은 API가 해줌) */
export async function searchNovels(keyword: string, limit = 20): Promise<SearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const url =
    `https://www.munpia.com/api/v1/main/search?query=${encodeURIComponent(kw)}` +
    `&tab=NOVEL&sort=SIMILARITY&novelType=ALL&finishedOnly=false&adultMode=false&page=0&size=${limit}`;
  const json = await fetchJson<{ result?: { searchNovelTabDtos?: MunpiaSearchDto[] } }>(url);
  const dtos = json.result?.searchNovelTabDtos ?? [];
  return dtos
    .filter((d): d is MunpiaSearchDto & { novelId: number; title: string } => Boolean(d.novelId && d.title))
    .map((d) => ({
      novelId: d.novelId,
      title: d.title,
      author: d.author ?? "",
      genre: [d.mainGenre, d.subGenre].filter(Boolean).join(" "),
      cover: d.coverUrl ?? null,
    }));
}

// ---------- 연독률 (회차별 조회수 기반) ----------

export type Episode = { no: number; title: string; date: string; views: number | null; paid?: boolean };

export type Dropoff = { no: number; title: string; dropPct: number; from: number; to: number };

export type Retention = {
  episodes: Episode[]; // 1화 → 최신화 순서
  firstViews: number | null;
  latestViews: number | null;
  cumulativeRate: number | null; // 누적 연독률 = 최신화/1화 ×100
  adjustedRate: number | null; // 보정 연독률 = (최신-3화)/4화 ×100 (커뮤니티 통용 기준)
  grade: string; // 매우 좋음 / 좋음 / 보통 / 주의 / 위험
  dropoffs: Dropoff[]; // 회차별 급락(이탈 의심) 구간
  paidStartNo: number | null; // 유료 전환 첫 회차 번호 (무료 연재작·완전유료작은 null)
  freeRate: number | null; // 무료 구간 연독률 = 마지막 무료화 / 4화 ×100
  paidRate: number | null; // 유료 구간 연독률 = (최신-3화) / 유료 첫화 ×100
  paidPassRate: number | null; // 전환 통과율 = 유료 첫화 / 마지막 무료화 ×100
};

type MunpiaChapter = { num?: number; title?: string | number; createdAt?: string; viewCount?: number; free?: boolean };

/** 작품의 전체 회차별 조회수 수집 (JSON API 페이지네이션). 1화→최신화 순으로 반환. */
export async function fetchEpisodes(novelId: number, maxPages = 12): Promise<Episode[]> {
  const eps: Episode[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const json = await fetchJson<{ result?: { total?: number; list?: MunpiaChapter[] } }>(
      `https://www.munpia.com/api/v1/pc/novel-detail/${novelId}/chapters?order=ENTRY_FIRST&page=${p}&size=100`
    );
    const list = json.result?.list ?? [];
    for (const c of list) {
      eps.push({
        no: c.num ?? eps.length + 1,
        title: String(c.title ?? ""),
        date: (c.createdAt ?? "").slice(0, 10),
        views: typeof c.viewCount === "number" ? c.viewCount : null,
        paid: typeof c.free === "boolean" ? !c.free : undefined,
      });
    }
    const total = json.result?.total ?? 0;
    if (list.length === 0 || eps.length >= total) break;
    if (p < maxPages) await sleep(300); // throttle
  }
  return eps;
}

/** 회차별 조회수로 연독률 계산
 *  계산 방식은 작가 커뮤니티(웹연갤 필독글 등)에서 통용되는 기준을 따른다:
 *  - 분모 = 4화 조회수 (1~3화는 '구경 유입'이 빠져나가는 구간이라 제외)
 *  - 분자 = 최신 3화를 제외한 마지막 회차 (갓 올라온 회차는 조회수가 덜 쌓여 왜곡)
 *  회차가 8화 미만이면 보정 계산이 불가 → 누적(최신/1화)만 제공 */
export function computeRetention(eps: Episode[]): Retention {
  const valid = eps.filter((e): e is Episode & { views: number } => e.views !== null);
  const first = valid[0]?.views ?? null;
  const latest = valid.length ? valid[valid.length - 1].views : null;
  const cumulative = first && latest ? Math.round((latest / first) * 100) : null;

  const e4 = valid[3]?.views ?? null;
  const eLatestMinus3 = valid.length >= 8 ? valid[valid.length - 4].views : null;
  const adjusted = e4 && eLatestMinus3 ? Math.round((eLatestMinus3 / e4) * 100) : null;

  const r = adjusted ?? cumulative ?? 0;
  // 해석 구간도 커뮤니티 통용 눈금(80 상위권 / 60 무난 / 50 방어 / 40 미만 위기)에 맞춘다
  const grade = r >= 80 ? "매우 좋음" : r >= 60 ? "좋음" : r >= 50 ? "보통" : r >= 40 ? "주의" : "위험";

  // 유료 전환 지점: paid가 처음 true가 되는 회차. 1화부터 유료(완전유료작)거나 유료 회차가 없으면 구간 구분 무의미 → null
  const paidIdx = valid.findIndex((e) => e.paid === true);
  const hasTransition = paidIdx > 0;
  const paidStartNo = hasTransition ? valid[paidIdx].no : null;

  let freeRate: number | null = null;
  let paidRate: number | null = null;
  let paidPassRate: number | null = null;
  if (hasTransition) {
    const lastFree = valid[paidIdx - 1].views;
    const firstPaid = valid[paidIdx].views;
    // 무료 구간: 분모는 기존과 동일한 4화, 분자는 마지막 무료화 (무료 구간 8화 미만이면 계산 불가)
    if (paidIdx >= 8 && e4) freeRate = Math.round((lastFree / e4) * 100);
    if (lastFree > 0) paidPassRate = Math.round((firstPaid / lastFree) * 100);
    // 유료 구간: 유료 첫화 대비 (최신-3화) 유지율 (유료 구간 8화 미만이면 계산 불가)
    const paidLen = valid.length - paidIdx;
    if (paidLen >= 8 && firstPaid > 0) {
      paidRate = Math.round((valid[valid.length - 4].views / firstPaid) * 100);
    }
  }

  // 회차별 급락(이탈 의심): 4화 이후 ~ 최신-3화, 직전 회차 대비 15%+ 하락
  // 단, 유료 전환 경계 회차는 낙폭이 당연히 크므로 이탈 의심에서 제외 (전환 통과율로 따로 보여줌)
  const dropoffs: Dropoff[] = [];
  for (let i = 3; i < valid.length - 3; i++) {
    if (hasTransition && i === paidIdx) continue;
    const prev = valid[i - 1].views;
    const cur = valid[i].views;
    if (prev > 0 && cur < prev) {
      const dropPct = Math.round((1 - cur / prev) * 100);
      if (dropPct >= 15) dropoffs.push({ no: valid[i].no, title: valid[i].title, dropPct, from: prev, to: cur });
    }
  }
  dropoffs.sort((a, b) => b.dropPct - a.dropPct);

  return {
    episodes: eps,
    firstViews: first,
    latestViews: latest,
    cumulativeRate: cumulative,
    adjustedRate: adjusted,
    grade,
    dropoffs: dropoffs.slice(0, 3),
    paidStartNo,
    freeRate,
    paidRate,
    paidPassRate,
  };
}

/** 문피아 작품 URL 또는 숫자ID 문자열에서 novelId 추출
 *  지원: novel.munpia.com/555698 · www.munpia.com/novel/detail/555698 (개편 URL) · novelno=555698 */
export function parseNovelId(input: string): number | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/munpia\.com\/(?:novel\/(?:detail\/)?)?(\d+)/) || s.match(/novelno=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export { BEST_SECTIONS };
