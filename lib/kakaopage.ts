// 카카오페이지(page.kakao.com) 공개 데이터 수집 모듈
// - 회차별 지표는 미공개 → 연독률 계산 불가
// - 작품 단위 지표(누적 열람수·별점 참여수·댓글수·판매 화수)는 공개 REST API 제공
//   GET bff-page.kakao.com/api/gateway/api/v1/content/overview?series_id=...
// robots.txt 준수(뷰어만 금지) · 공개 데이터만.

import type { NovelStats } from "./munpia";

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
