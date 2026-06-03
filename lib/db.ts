// Supabase 데이터 접근 헬퍼
// 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없으면
// dbEnabled=false 이며 모든 쓰기는 no-op, 읽기는 빈 결과를 반환한다.
// → 키 없이도 앱이 죽지 않고, 키를 넣으면 자동으로 영속화가 켜진다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NovelStats } from "./munpia";

let cached: SupabaseClient | null | undefined;

export function getDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function dbEnabled(): boolean {
  return getDb() !== null;
}

export type Snapshot = {
  episodes: number | null;
  views: number | null;
  recommends: number | null;
  chars: number | null;
  favorites: number | null;
  collected_at: string;
};

/** 작품 마스터 upsert + 스냅샷 1건 적재 */
export async function saveSnapshot(s: NovelStats): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from("novels").upsert(
    {
      novel_id: s.novelId,
      platform: "munpia",
      title: s.title,
      genre: s.genre,
      author: s.author,
      author_id: s.authorId,
      registered_at: s.registeredAt,
    },
    { onConflict: "novel_id" }
  );
  await db.from("snapshots").insert({
    novel_id: s.novelId,
    episodes: s.episodes,
    views: s.views,
    recommends: s.recommends,
    chars: s.chars,
    favorites: s.favorites,
    last_updated_at: s.lastUpdatedAt,
  });
}

/** 특정 작품의 스냅샷 시계열 (오래된→최신) */
export async function getSnapshots(novelId: number, limit = 90): Promise<Snapshot[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from("snapshots")
    .select("episodes,views,recommends,chars,favorites,collected_at")
    .eq("novel_id", novelId)
    .order("collected_at", { ascending: false })
    .limit(limit);
  return ((data as Snapshot[]) ?? []).reverse();
}

/** 작품 추적 등록 */
export async function trackNovel(novelId: number, email?: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .from("tracked_novels")
    .upsert({ novel_id: novelId, email: email ?? null }, { onConflict: "novel_id,email" });
}

/** 추적 중인 모든 작품 ID (중복 제거) */
export async function listTrackedNovelIds(): Promise<number[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from("tracked_novels").select("novel_id");
  const ids = (data ?? []).map((r: { novel_id: number }) => r.novel_id);
  return [...new Set(ids)];
}
