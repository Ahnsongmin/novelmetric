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

/**
 * 퍼널 이벤트 1건 기록 (nm_events).
 * 어떤 기능이 실제로 쓰이는지 비교할 근거 — 개인정보는 담지 않는다(집계용 메타만).
 * DB 없으면 no-op이고, 적재에 실패해도 절대 호출한 요청을 깨뜨리지 않는다.
 */
export async function logEvent(event: string, meta?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const { error } = await db.from("nm_events").insert({ event, meta: meta ?? null });
    if (error) console.error("[logEvent]", event, error.message);
  } catch (e) {
    console.error("[logEvent]", event, e);
  }
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

export type TrackOptions = {
  userId?: string | null;
  anonId?: string | null;
  channel?: string;
  contact?: string;
  passCode?: string;
};

/** 작품 추적 등록 (+ 알림 채널/연락처, Pro면 패스 코드 연결).
 *
 *  소유자(user_id 또는 anon_id) 기준으로 기존 행을 찾아 갱신한다. upsert의 onConflict를 쓰지
 *  않는 이유는 소유자 유니크 인덱스가 partial(NULL 제외)이라 PostgREST가 추론하지 못하기 때문.
 *  레거시 email 컬럼에는 더 이상 쓰지 않는다 — 옛 unique(novel_id,email)과 충돌하지 않게 하고,
 *  연락처는 contact 한 곳에만 둔다. */
export async function trackNovel(novelId: number, opts: TrackOptions = {}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const fields = {
    notify_channel: opts.channel ?? "none",
    contact: opts.contact ?? null,
    ...(opts.passCode ? { pass_code: opts.passCode } : {}),
  };
  const ownerCol = opts.userId ? "user_id" : opts.anonId ? "anon_id" : null;
  const ownerVal = opts.userId ?? opts.anonId ?? null;

  if (!ownerCol || !ownerVal) {
    const { error } = await db.from("tracked_novels").insert({ novel_id: novelId, ...fields });
    if (error) console.error("[trackNovel]", error.message);
    return;
  }

  const { data: existing } = await db
    .from("tracked_novels")
    .select("id")
    .eq("novel_id", novelId)
    .eq(ownerCol, ownerVal)
    .maybeSingle();

  const { error } = existing
    ? await db.from("tracked_novels").update(fields).eq("id", (existing as { id: number }).id)
    : await db.from("tracked_novels").insert({ novel_id: novelId, [ownerCol]: ownerVal, ...fields });
  if (error) console.error("[trackNovel]", error.message);
}

/** 추적 중인 모든 작품 ID (중복 제거) */
export async function listTrackedNovelIds(): Promise<number[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from("tracked_novels").select("novel_id");
  const ids = (data ?? []).map((r: { novel_id: number }) => r.novel_id);
  return [...new Set(ids)];
}

// ── 조회 기반 자동 수집 ─────────────────────────────────────────────────────
// 왜 필요한가: 매일 받아오는 4개 플랫폼 랭킹은 "이미 잘 되는 작품"뿐이라, 정작 우리 고객의
// 작품(랭킹 밖)은 아무리 자동 수집을 늘려도 절대 안 들어온다. 반대로 **누군가 대시보드에서
// 조회한 작품**은 실제 수요가 있는 작품이다. 그래서 조회만 해도 그 순간부터 수집 대상에 넣어
// 다음날부터 추이가 생기게 한다(등록·가입 불필요). 나중에 그 사람이 돌아오면 이미 쌓인
// 추이를 그 자리에서 보게 되는 게 핵심 가치다.
//
// tracked_novels에 섞지 않는 이유: 무료 1작품 한도 계산(trackedCountByOwner),
// 알림 대상(listNotifyPrefs), 주간 리포트 대상(listWeeklyTargets)이 전부 tracked_novels를
// 기준으로 돌아간다. 자동 수집분이 거기 섞이면 남의 한도를 깎거나 원치 않는 메일을 보낼 수 있다.
//
// 저장소는 **이미 있는 `nm_events`를 조회 로그로 겸용**한다(전용 표를 새로 만들지 않는다).
//   · 이유 1: 새 표는 DDL이 필요하고, Supabase 대시보드가 자주 멈춰 스키마 변경이 병목이 된다.
//   · 이유 2: 조회 자체가 퍼널 지표다 — "진단 vs 추적" 비교에 빠져 있던 조회 수치가 함께 생긴다.
//   · 대신 최신순 이벤트를 읽어 코드에서 중복을 제거한다(PostgREST는 GROUP BY를 못 쓴다).
const VIEW_EVENT = "novel_view";

/** 조회된 작품을 자동 수집 대상에 올린다(이벤트 1행). 실패해도 조회 요청을 깨지 않는다. */
export async function recordNovelView(novelId: number, platform: string): Promise<void> {
  await logEvent(VIEW_EVENT, { novelId, platform });
}

/**
 * 자동 수집 대상 ID — 최근 activeDays일 안에 조회된 작품, **최근 조회순** limit개까지.
 * limit이 있는 이유: 크론은 300초 예산 안에서 끝나야 한다(작품당 약 2.7초 실측).
 * scan은 훑을 이벤트 행 수 상한 — 조회가 폭증해도 읽기 비용이 일정하게 유지된다.
 */
export async function listRecentlyViewedIds(
  limit = 60,
  activeDays = 30,
  scan = 2000,
): Promise<number[]> {
  const db = getDb();
  if (!db) return [];
  const since = new Date(Date.now() - activeDays * 86_400_000).toISOString();
  const { data, error } = await db
    .from("nm_events")
    .select("meta")
    .eq("event", VIEW_EVENT)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(scan);
  if (error) {
    console.error("[listRecentlyViewedIds]", error.message);
    return [];
  }
  const seen = new Set<number>();
  for (const row of (data ?? []) as { meta: { novelId?: number } | null }[]) {
    const id = Number(row.meta?.novelId);
    if (Number.isFinite(id) && id > 0) seen.add(id);
    if (seen.size >= limit) break; // 최신순으로 훑으므로 앞쪽이 가장 최근 조회분이다
  }
  return [...seen];
}

// ── 일일 베스트 아카이브 (자동 콘텐츠 엔진) ──────────────────────────────
import type { RankItem } from "./munpia";

/** 한국시간 기준 오늘 날짜(YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

import type { PaidTransitionRow } from "./paidbench";

/** 일일 베스트 — 플랫폼별 분리 저장. (2026-07-14 이전은 문피아 단독 배열, 07-28 이전은 문피아·노벨피아만)
 *  paidBench: 그날 스캔한 유료 전환작 벤치마크 행(선택) — 별도 테이블 없이 여기 같이 쌓는다. */
export type BestDaily = {
  munpia: RankItem[];
  novelpia: RankItem[];
  naverseries: RankItem[];
  kakaopage: RankItem[];
  paidBench?: PaidTransitionRow[];
};

export async function saveBestDaily(day: string, data: BestDaily): Promise<void> {
  const db = getDb();
  const { paidBench, ...lists } = data;
  if (!db || (Object.values(lists).every((arr) => !arr.length) && !paidBench?.length)) return;
  await db.from("nm_best_daily").upsert({ day, items: data }, { onConflict: "day" });
}

export async function getBestDaily(day: string): Promise<BestDaily | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_best_daily").select("items").eq("day", day).maybeSingle();
  const items = (data as { items: RankItem[] | Partial<BestDaily> } | null)?.items;
  if (!items) return null;
  if (Array.isArray(items)) return { munpia: items, novelpia: [], naverseries: [], kakaopage: [] }; // 구버전 호환
  return {
    munpia: items.munpia ?? [],
    novelpia: items.novelpia ?? [],
    naverseries: items.naverseries ?? [],
    kakaopage: items.kakaopage ?? [],
    paidBench: items.paidBench ?? [],
  };
}

/** 최근 N일의 유료 전환 벤치마크 행 전부 (집계는 lib/paidbench.aggregatePaidBench) */
export async function getRecentPaidBench(days = 90): Promise<PaidTransitionRow[]> {
  const db = getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() + 9 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("nm_best_daily").select("items").gte("day", cutoff);
  const rows: PaidTransitionRow[] = [];
  for (const r of (data as { items: Partial<BestDaily> | RankItem[] }[]) ?? []) {
    if (!Array.isArray(r.items) && r.items?.paidBench) rows.push(...r.items.paidBench);
  }
  return rows;
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

export type WeeklyTarget = { novel_id: number; contact: string; pass_code: string | null };

/** Pro 주간 리포트 대상: 이메일 연락처 + 유효한 패스가 붙은 추적들.
 *  패스는 두 경로로 연결된다 — 등록 시 함께 저장된 pass_code(구방식), 또는 계정에 귀속된 패스.
 *  계정 경로가 있어야 기기를 바꾸거나 코드를 잃어버려도 리포트가 끊기지 않는다. */
export async function listWeeklyTargets(): Promise<WeeklyTarget[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from("tracked_novels")
    .select("novel_id,contact,pass_code,user_id")
    .eq("notify_channel", "email")
    .not("contact", "is", null);
  if (error || !data) return [];
  const rows = data as (WeeklyTarget & { user_id: string | null })[];
  if (!rows.length) return [];

  const { data: passes } = await db
    .from("nm_pass")
    .select("code,user_id")
    .gt("expires_at", new Date().toISOString());
  const active = (passes as { code: string; user_id: string | null }[]) ?? [];
  const validCodes = new Set(active.map((p) => p.code));
  const proUsers = new Set(active.map((p) => p.user_id).filter(Boolean) as string[]);

  return rows.filter(
    (r) => (r.pass_code && validCodes.has(r.pass_code)) || (r.user_id && proUsers.has(r.user_id)),
  );
}
