// Pro 패스(30일 이용권) + 무료 사용량 게이트.
//   비로그인: 작품 추적 1개까지 (제목 진단은 불가 — 계정이 있어야 한다)
//   무료 회원: 추적 1작품 + 제목 진단 매달 1회
//   Pro: 30일간 추적 무제한 + 진단 월 30회
// 토스 키(또는 페이앱)와 DB가 없으면 게이트 자체가 꺼져 전부 무료(기존 동작).
//
// 한도는 항상 "소유자"(user_id 또는 비로그인 anon_id) 기준으로 센다. 예전처럼 연락처
// 이메일 문자열로 세면 알림을 끈 사용자에게는 검사가 아예 돌지 않아 한도가 무의미했다.

import { randomBytes } from "node:crypto";
import { getDb, dbEnabled } from "./db";

export const PASS = { amount: 9900, days: 30, name: "노블메트릭 Pro 30일 패스" };
export const FREE_DIAG_PER_MONTH = 1;
// 진단만 Pro에도 상한이 있다 — 호출마다 실시간 AI 비용이 드는 유일한 기능이라,
// 무제한이면 헤비 유저 한 명이 패스 값을 넘겨 쓸 수 있다. 추적·대시보드는 무제한.
export const PRO_DIAG_PER_MONTH = 30;
export const FREE_TRACK_LIMIT = 1;

export function passEnabled(): boolean {
  // 결제 수단이 하나라도 켜져 있으면(토스 또는 페이앱) 무료 제한·패스 게이트 활성.
  const toss = Boolean(process.env.TOSS_SECRET_KEY && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
  const payapp = Boolean(
    process.env.PAYAPP_USERID && process.env.PAYAPP_LINKKEY && process.env.PAYAPP_LINKVAL,
  );
  return (toss || payapp) && dbEnabled();
}

// ── Pro 패스 ────────────────────────────────────────────────────────────────
export async function createPass(opts: {
  orderId: string;
  paymentKey: string;
  amount: number;
}): Promise<{ code: string; expiresAt: string }> {
  const db = getDb();
  if (!db) throw new Error("DB 미연결");
  const code = `NM-${randomBytes(6).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + PASS.days * 86400_000).toISOString();
  const { error } = await db.from("nm_pass").insert({
    code,
    order_id: opts.orderId,
    payment_key: opts.paymentKey,
    amount: opts.amount,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`패스 발급 실패: ${error.message}`);
  return { code, expiresAt };
}

/** 유효한 패스면 만료시각(ISO), 아니면 null */
export async function passValidUntil(code: string | undefined | null): Promise<string | null> {
  if (!code) return null;
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_pass").select("expires_at").eq("code", code).maybeSingle();
  const exp = (data as { expires_at: string } | null)?.expires_at;
  return exp && new Date(exp) > new Date() ? exp : null;
}

/** 계정에 연결된 유효 패스의 만료시각. 기기를 바꿔도 Pro가 따라오게 하는 근거. */
export async function activePassFor(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("nm_pass")
    .select("expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { expires_at: string } | null)?.expires_at ?? null;
}

/** 로그인 상태로 코드를 적용하면 계정에 귀속시킨다. 이미 다른 계정 것이면 건드리지 않는다. */
export async function linkPassToUser(code: string, userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { error } = await db
    .from("nm_pass")
    .update({ user_id: userId })
    .eq("code", code)
    .is("user_id", null);
  if (error) console.error("[pass] 패스-계정 연결 실패:", error.message);
}

// ── 추적 한도 ───────────────────────────────────────────────────────────────
export type TrackOwner = { userId?: string | null; anonId?: string | null };

/** 소유자가 추적 중인 작품 수 (무료 1작품 제한용). 지정 novel_id 제외(재등록 허용). */
export async function trackedCountByOwner(
  owner: TrackOwner,
  excludeNovelId?: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  let q = db.from("tracked_novels").select("novel_id", { count: "exact", head: true });
  if (owner.userId) q = q.eq("user_id", owner.userId);
  else if (owner.anonId) q = q.eq("anon_id", owner.anonId);
  else return 0;
  if (excludeNovelId) q = q.neq("novel_id", excludeNovelId);
  const { count } = await q;
  return count ?? 0;
}
