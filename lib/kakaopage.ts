// 카카오페이지(page.kakao.com) 공개 데이터 수집 모듈
// - 회차별 지표는 미공개 → 연독률 계산 불가
// - 작품 단위 지표(누적 열람수·별점 참여수·댓글수·판매 화수)는 공개 REST API 제공
//   GET bff-page.kakao.com/api/gateway/api/v1/content/overview?series_id=...
// robots.txt 준수(뷰어만 금지) · 공개 데이터만.

import type { NovelStats, RankItem, SearchHit } from "./munpia";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type KakaoOverview = {
  result?: {
    content?: {
      series_id?: number;
      title?: string;
      sub_category?: string;
      category?: string;
      authors?: string;
      on_sale_count?: number;
      last_slide_added_dt?: string;
      start_sale_dt?: string;
      service_property?: {
        view_count?: number;
        rating_count?: number;
        comment_count?: number;
      };
    };
  };
};

// ---------- 작품 검색 (제목으로) ----------

type KakaoSearchItem = {
  series_id?: number;
  title?: string;
  category_uid?: number; // 11 = 웹소설
  sub_category?: string;
  authors?: string;
};

/** 제목 키워드로 카카오페이지 웹소설 검색 (웹툰 등 다른 카테고리는 제외) */
export async function searchNovels(keyword: string, limit = 20): Promise<SearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const res = await fetch(
    `https://bff-page.kakao.com/api/gateway/api/v2/search/series?keyword=${encodeURIComponent(kw)}` +
      `&category_uid=0&is_complete=false&sort_type=ACCURACY&page=0&size=${limit}`,
    { headers: { "User-Agent": UA, Referer: "https://page.kakao.com/", Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} (kakaopage search)`);
  const list = (findSeriesList(await res.json()) ?? []) as KakaoSearchItem[];
  return list
    .filter((it) => it.series_id && it.title && it.category_uid === 11)
    .map((it) => ({
      novelId: it.series_id!,
      title: it.title!,
      author: it.authors ?? "",
      genre: it.sub_category ?? "",
      cover: null,
    }));
}

// ---------- 웹소설 실시간 랭킹 ----------

type KakaoRankItem = {
  series_id?: number;
  title?: string;
  sub_category?: string;
  authors?: string;
  service_property?: { view_count?: number; rank?: string | number };
};

/** 응답 JSON 어디에 있든 series_id 배열을 찾는다 (뷰 구조 변경에 대한 내성) */
function findSeriesList(o: unknown): unknown[] | null {
  if (Array.isArray(o)) {
    if (o.length && typeof o[0] === "object" && o[0] !== null && "series_id" in (o[0] as object)) {
      return o;
    }
    for (const x of o) {
      const f = findSeriesList(x);
      if (f) return f;
    }
    return null;
  }
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) {
      const f = findSeriesList(v);
      if (f) return f;
    }
  }
  return null;
}

/** 웹소설 실시간 랭킹 TOP50 — 제목·장르·작가·누적 열람수 포함 */
export async function fetchRanking(): Promise<RankItem[]> {
  const res = await fetch(
    "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=11&screen_uid=94",
    { headers: { "User-Agent": UA, Referer: "https://page.kakao.com/", Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} (kakaopage ranking)`);
  const list = (findSeriesList(await res.json()) ?? []) as KakaoRankItem[];
  return list.map((it, i): RankItem => {
    const rank = Number(it.service_property?.rank);
    return {
      rank: Number.isFinite(rank) && rank > 0 ? rank : i + 1,
      novelId: it.series_id ?? null,
      title: it.title ?? "",
      genre: it.sub_category ?? "",
      author: it.authors ?? "",
      episodes: null,
      views: it.service_property?.view_count ?? null,
      recommends: null,
      synopsis: "",
      cover: null,
    };
  });
}

/** 작품 단위 지표. views = 누적 열람수(view_count). 회차별 데이터는 미제공. */
export async function fetchNovel(seriesId: number): Promise<NovelStats> {
  const res = await fetch(
    `https://bff-page.kakao.com/api/gateway/api/v1/content/overview?series_id=${seriesId}`,
    { headers: { "User-Agent": UA, Referer: "https://page.kakao.com/", Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} (kakaopage overview ${seriesId})`);
  const json = (await res.json()) as KakaoOverview;
  const c = json.result?.content;
  if (!c?.title) throw new Error(`카카오페이지 작품 없음 (seriesId=${seriesId})`);

  return {
    novelId: seriesId,
    title: c.title,
    genre: [c.category, c.sub_category].filter(Boolean).join(" "),
    author: c.authors ?? "",
    authorId: null,
    episodes: c.on_sale_count ?? null,
    views: c.service_property?.view_count ?? null,
    recommends: null,
    chars: null,
    favorites: null,
    registeredAt: (c.start_sale_dt ?? "").slice(0, 10) || null,
    lastUpdatedAt: (c.last_slide_added_dt ?? "").slice(0, 10) || null,
    collectedAt: new Date().toISOString(),
  };
}
