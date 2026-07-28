// 플랫폼 디스패처 — 문피아·노벨피아·네이버시리즈·카카오페이지를 하나의 ID 체계로 통합
// 저장 ID = 플랫폼별 오프셋 + 원본 ID 로 관리해 기존 DB 스키마(novels.novel_id PK, bigint)와
// 충돌 없이 여러 플랫폼을 함께 다룬다.
// 네이버시리즈·카카오페이지는 회차별 데이터 비공개 → 작품 단위 지표(일일 추적)만 지원.

import * as munpia from "./munpia";
import * as novelpia from "./novelpia";
import * as naverseries from "./naverseries";
import * as kakaopage from "./kakaopage";
import type { NovelStats, Episode, SearchHit } from "./munpia";

export type Platform = "munpia" | "novelpia" | "naverseries" | "kakaopage";

export const NOVELPIA_ID_BASE = 1_000_000_000;
export const SERIES_ID_BASE = 2_000_000_000;
export const KAKAO_ID_BASE = 3_000_000_000;

export function platformOf(storageId: number): Platform {
  if (storageId >= KAKAO_ID_BASE) return "kakaopage";
  if (storageId >= SERIES_ID_BASE) return "naverseries";
  if (storageId >= NOVELPIA_ID_BASE) return "novelpia";
  return "munpia";
}

const BASE_OF: Record<Platform, number> = {
  munpia: 0,
  novelpia: NOVELPIA_ID_BASE,
  naverseries: SERIES_ID_BASE,
  kakaopage: KAKAO_ID_BASE,
};

export function rawIdOf(storageId: number): number {
  return storageId - BASE_OF[platformOf(storageId)];
}

export function toStorageId(platform: Platform, rawId: number): number {
  return BASE_OF[platform] + rawId;
}

/** URL/ID 문자열 → 저장 ID. 각 플랫폼 URL은 오프셋 ID로 변환, 숫자는 그대로(오프셋 포함) 해석 */
export function parseQuery(input: string): number | null {
  const s = input.trim();
  const np = s.match(/novelpia\.com\/novel\/(\d+)/);
  if (np) return toStorageId("novelpia", parseInt(np[1], 10));
  const ns = s.match(/series\.naver\.com\/[a-z]+\/detail\.series\?[^ ]*productNo=(\d+)/);
  if (ns) return toStorageId("naverseries", parseInt(ns[1], 10));
  const kp = s.match(/page\.kakao\.com\/(?:content|home\/[^/]+)\/(\d+)/);
  if (kp) return toStorageId("kakaopage", parseInt(kp[1], 10));
  return munpia.parseNovelId(s); // 숫자·문피아 URL (오프셋 숫자도 그대로 통과)
}

export type PlatformNovelStats = NovelStats & { platform: Platform };

/** 개별 작품 지표 (플랫폼 자동 판별). 반환 novelId는 저장 ID. */
export async function fetchNovelAny(storageId: number): Promise<PlatformNovelStats> {
  const platform = platformOf(storageId);
  const raw = rawIdOf(storageId);
  const stats =
    platform === "novelpia"
      ? await novelpia.fetchNovel(raw)
      : platform === "naverseries"
        ? await naverseries.fetchNovel(raw)
        : platform === "kakaopage"
          ? await kakaopage.fetchNovel(raw)
          : await munpia.fetchNovel(raw);
  return { ...stats, novelId: storageId, platform };
}

/** 회차별 조회수 (플랫폼 자동 판별). 네이버시리즈·카카오페이지는 비공개 → 빈 배열. */
export async function fetchEpisodesAny(storageId: number): Promise<Episode[]> {
  const platform = platformOf(storageId);
  const raw = rawIdOf(storageId);
  if (platform === "novelpia") return novelpia.fetchEpisodes(raw);
  if (platform === "munpia") return munpia.fetchEpisodes(raw);
  return [];
}

export type PlatformSearchHit = SearchHit & { platform: Platform };

/** 제목 검색은 문피아·노벨피아만 지원 (시리즈·카카페는 URL 입력). 반환 novelId는 저장 ID. */
export async function searchAllPlatforms(keyword: string, limitEach = 10): Promise<PlatformSearchHit[]> {
  const [mp, np] = await Promise.all([
    munpia.searchNovels(keyword, limitEach).catch(() => [] as SearchHit[]),
    novelpia.searchNovels(keyword, limitEach).catch(() => [] as SearchHit[]),
  ]);
  return [
    ...mp.map((h): PlatformSearchHit => ({ ...h, platform: "munpia" })),
    ...np.map(
      (h): PlatformSearchHit => ({ ...h, novelId: toStorageId("novelpia", h.novelId), platform: "novelpia" })
    ),
  ];
}
