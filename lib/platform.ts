// 플랫폼 디스패처 — 문피아·노벨피아를 하나의 ID 체계로 통합
// 노벨피아 작품은 저장 ID = NOVELPIA_ID_BASE + 원본 novel_no 로 관리해
// 기존 DB 스키마(novels.novel_id PK)와 충돌 없이 두 플랫폼을 함께 다룬다.

import * as munpia from "./munpia";
import * as novelpia from "./novelpia";
import type { NovelStats, Episode, SearchHit } from "./munpia";

export type Platform = "munpia" | "novelpia";

export const NOVELPIA_ID_BASE = 1_000_000_000;

export function platformOf(storageId: number): Platform {
  return storageId >= NOVELPIA_ID_BASE ? "novelpia" : "munpia";
}

export function rawIdOf(storageId: number): number {
  return storageId >= NOVELPIA_ID_BASE ? storageId - NOVELPIA_ID_BASE : storageId;
}

export function toStorageId(platform: Platform, rawId: number): number {
  return platform === "novelpia" ? NOVELPIA_ID_BASE + rawId : rawId;
}

/** URL/ID 문자열 → 저장 ID. 노벨피아 URL은 오프셋 ID로 변환, 숫자는 그대로(오프셋 포함) 해석 */
export function parseQuery(input: string): number | null {
  const s = input.trim();
  const np = s.match(/novelpia\.com\/novel\/(\d+)/);
  if (np) return toStorageId("novelpia", parseInt(np[1], 10));
  return munpia.parseNovelId(s); // 숫자·문피아 URL (오프셋 숫자도 그대로 통과)
}

export type PlatformNovelStats = NovelStats & { platform: Platform };

/** 개별 작품 지표 (플랫폼 자동 판별). 반환 novelId는 저장 ID. */
export async function fetchNovelAny(storageId: number): Promise<PlatformNovelStats> {
  const platform = platformOf(storageId);
  const raw = rawIdOf(storageId);
  const stats =
    platform === "novelpia" ? await novelpia.fetchNovel(raw) : await munpia.fetchNovel(raw);
  return { ...stats, novelId: storageId, platform };
}

/** 회차별 조회수 (플랫폼 자동 판별) */
export async function fetchEpisodesAny(storageId: number): Promise<Episode[]> {
  const platform = platformOf(storageId);
  const raw = rawIdOf(storageId);
  return platform === "novelpia" ? novelpia.fetchEpisodes(raw) : munpia.fetchEpisodes(raw);
}

export type PlatformSearchHit = SearchHit & { platform: Platform };

/** 두 플랫폼 동시 검색. 반환 novelId는 저장 ID. */
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
