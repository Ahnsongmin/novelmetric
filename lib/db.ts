// Supabase 데이터 접근 헬퍼
// 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없으면
// dbEnabled=false 이며 모든 쓰기는 no-op, 읽기는 빈 결과를 반환한다.
// → 키 없이도 앱이 죽지 않고, 키를 넣으면 자동으로 영속화가 켜진다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NovelStats } from "./munpia";
import { platformOf } from "./platform";

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
      platform: platformOf(s.novelId),
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

export type TrackOptions = { email?: string; channel?: string; contact?: string; passCode?: string };

/** 작품 추적 등록 (+ 알림 채널/연락처, Pro면 패스 코드 연결).
 *  알림·pass_code 컬럼이 아직 없는 DB에서도 추적은 되도록 폴백한다. */
export async function trackNovel(novelId: number, opts: TrackOptions = {}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const email = opts.email ?? opts.contact ?? null;
  const { error } = await db.from("tracked_novels").upsert(
    {
      novel_id: novelId,
      email,
      notify_channel: opts.channel ?? "none",
      contact: opts.contact ?? opts.email ?? null,
      ...(opts.passCode ? { pass_code: opts.passCode } : {}),
    },
    { onConflict: "novel_id,email" }
  );
  if (error) {
    // notify_channel/contact/pass_code 컬럼이 없는 구버전 스키마 → 기본 필드만 저장
    await db.from("tracked_novels").upsert({ novel_id: novelId, email }, { onConflict: "novel_id,email" });
  }
}

/** 추적 중인 모든 작품 ID (중복 제거) */
export async function listTrackedNovelIds(): Promise<number[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from("tracked_novels").select("novel_id");
  const ids = (data ?? []).map((r: { novel_id: number }) => r.novel_id);
  return [...new Set(ids)];
}

// ── 일일 베스트 아카이브 (자동 콘텐츠 엔진) ──────────────────────────────
import type { RankItem } from "./munpia";

/** 한국시간 기준 오늘 날짜(YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 일일 베스트 — 플랫폼별 분리 저장. (2026-07-14 이전 데이터는 문피아 단독 배열) */
export type BestDaily = { munpia: RankItem[]; novelpia: RankItem[] };

export async function saveBestDaily(day: string, data: BestDaily): Promise<void> {
  const db = getDb();
  if (!db || (!data.munpia.length && !data.novelpia.length)) return;
  await db.from("nm_best_daily").upsert({ day, items: data }, { onConflict: "day" });
}

export async function getBestDaily(day: string): Promise<BestDaily | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_best_daily").select("items").eq("day", day).maybeSingle();
  const items = (data as { items: RankItem[] | BestDaily } | null)?.items;
  if (!items) return null;
  if (Array.isArray(items)) return { munpia: items, novelpia: [] }; // 구버전 호환
  return { munpia: items.munpia ?? [], novelpia: items.novelpia ?? [] };
}

export async function listBestDays(limit = 90): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from("nm_best_daily")
    .select("day")
    .order("day", { ascending: false })
    .limit(limit);
  return ((data as { day: string }[]) ?? []).map((r) => r.day);
}

export type TrackedPref = { novel_id: number; notify_channel: string; contact: string | null };

/** 알림 받기로 한(채널!=none) 추적 작품들의 채널·연락처 */
export async function listNotifyPrefs(): Promise<TrackedPref[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from("tracked_novels")
    .select("novel_id,notify_channel,contact")
    .neq("notify_channel", "none");
  return (data as TrackedPref[]) ?? [];
}

export type WeeklyTarget = { novel_id: number; contact: string; pass_code: string };

/** Pro 주간 리포트 대상: 이메일 연락처 + 유효한 패스가 연결된 추적들.
 *  pass_code 컬럼이 없는 구버전 스키마면 빈 배열(리포트 미발송)로 폴백. */
export async function listWeeklyTargets(): Promise<WeeklyTarget[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from("tracked_novels")
    .select("novel_id,contact,pass_code")
    .eq("notify_channel", "email")
    .not("pass_code", "is", null)
    .not("contact", "is", null);
  if (error || !data) return [];
  const rows = data as WeeklyTarget[];
  if (!rows.length) return [];
  // 유효(미만료) 패스만
  const codes = [...new Set(rows.map((r) => r.pass_code))];
  const { data: passes } = await db
    .from("nm_pass")
    .select("code,expires_at")
    .in("code", codes)
    .gt("expires_at", new Date().toISOString());
  const valid = new Set(((passes as { code: string }[]) ?? []).map((p) => p.code));
  return rows.filter((r) => valid.has(r.pass_code));
}
