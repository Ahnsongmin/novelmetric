// Pro 패스(30일 이용권) + 무료 사용량 게이트.
//   무료: 제목진단 월 3회(서명 쿠키), 작품 추적 이메일당 1작품
//   Pro: 결제 → NM-코드 발급(nm_pass) → 30일 무제한
// 토스 키 또는 DB가 없으면 게이트 자체가 꺼져 전부 무료(기존 동작).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb, dbEnabled } from "./db";

export const PASS = { amount: 9900, days: 30, name: "노블메트릭 Pro 30일 패스" };
export const FREE_DIAG_PER_MONTH = 3;
export const FREE_TRACK_LIMIT = 1;
export const DIAG_COOKIE = "nm_diag";

export function passEnabled(): boolean {
  return Boolean(
    process.env.TOSS_SECRET_KEY && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY && dbEnabled(),
  );
}

// ── 무료 진단 쿼터: "YYYY-MM.사용횟수.서명" 쿠키 ───────────────────────────
function sig(payload: string): string {
  const secret = process.env.GATE_SECRET ?? process.env.TOSS_SECRET_KEY ?? "nm-dev-secret";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 쿠키에서 이번 달 사용 횟수를 읽는다. 위조/지난달이면 0. */
export function diagUsed(cookieHeader: string | null): number {
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${DIAG_COOKIE}=([^;]+)`));
  if (!m) return 0;
  const [ym, n, s] = decodeURIComponent(m[1]).split(".");
  if (!ym || !n || !s || ym !== currentYm()) return 0;
  const want = Buffer.from(sig(`${ym}.${n}`));
  const got = Buffer.from(s);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return 0;
  return Number(n) || 0;
}

/** 사용 횟수 +1 한 Set-Cookie 값 */
export function diagCookie(used: number): string {
  const ym = currentYm();
  const n = used + 1;
  const value = encodeURIComponent(`${ym}.${n}.${sig(`${ym}.${n}`)}`);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DIAG_COOKIE}=${value}; Path=/; Max-Age=2764800; HttpOnly; SameSite=Lax${secure}`;
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

/** 이메일이 추적 중인 작품 수 (무료 1작품 제한용). 지정 novel_id 제외(재등록 허용). */
export async function trackedCountByEmail(email: string, excludeNovelId?: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  let q = db.from("tracked_novels").select("novel_id", { count: "exact", head: true }).eq("email", email);
  if (excludeNovelId) q = q.neq("novel_id", excludeNovelId);
  const { count } = await q;
  return count ?? 0;
}
