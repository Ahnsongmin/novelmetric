// 계정 — 매직링크 로그인(비밀번호 없음).
//
// 왜 필요한가: 신원이 없어서 무료 한도가 두 군데서 새고 있었다.
//   1) 추적 1작품 한도가 이메일 문자열 기준이라 "알림 안 받음"이면 검사가 통째로 스킵됐다.
//   2) 진단 횟수가 쿠키 기준이라 시크릿창으로 무한 반복됐다(호출마다 실제 AI 비용).
// 소유자(user_id / anon_id)를 기준으로 세면 둘 다 근본적으로 막힌다.
//
// 서명 쿠키는 lib/pass.ts가 쓰던 HMAC 패턴을 그대로 따른다 — 새 의존성 없음.

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDb, dbEnabled } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "nm_session";
export const ANON_COOKIE = "nm_anon";

const SESSION_DAYS = 30;
const TOKEN_MINUTES = 15;
const ANON_DAYS = 365;

export type User = { id: string; email: string };

/** 계정 기능은 DB가 있어야 성립한다. 키 없는 로컬에서는 로그인 게이트가 꺼져 앱이 그대로 동작한다. */
export function authEnabled(): boolean {
  return dbEnabled();
}

// ── 서명 ────────────────────────────────────────────────────────────────────
function sign(payload: string): string {
  const secret = process.env.GATE_SECRET ?? process.env.TOSS_SECRET_KEY ?? "nm-dev-secret";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

function sameSig(got: string, want: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── 쿠키 ────────────────────────────────────────────────────────────────────
function readCookie(header: string | null, name: string): string | null {
  const m = header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function attrs(maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

/** 세션 쿠키 값: "userId.만료ms.서명" (uuid에는 점이 없어 split이 안전하다) */
export function sessionCookie(userId: string): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const value = encodeURIComponent(`${userId}.${exp}.${sign(`${userId}.${exp}`)}`);
  return `${SESSION_COOKIE}=${value}; ${attrs(SESSION_DAYS * 86_400)}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/** 위조·만료면 null */
export function readSession(cookieHeader: string | null): string | null {
  const raw = readCookie(cookieHeader, SESSION_COOKIE);
  if (!raw) return null;
  const [userId, exp, sig] = raw.split(".");
  if (!userId || !exp || !sig) return null;
  if (!sameSig(sig, sign(`${userId}.${exp}`))) return null;
  return Number(exp) > Date.now() ? userId : null;
}

export function newAnonId(): string {
  return randomBytes(12).toString("hex");
}

export function anonCookie(anonId: string): string {
  const value = encodeURIComponent(`${anonId}.${sign(anonId)}`);
  return `${ANON_COOKIE}=${value}; ${attrs(ANON_DAYS * 86_400)}`;
}

export function readAnon(cookieHeader: string | null): string | null {
  const raw = readCookie(cookieHeader, ANON_COOKIE);
  if (!raw) return null;
  const [anonId, sig] = raw.split(".");
  if (!anonId || !sig) return null;
  return sameSig(sig, sign(anonId)) ? anonId : null;
}

// ── 현재 사용자 ─────────────────────────────────────────────────────────────
type HasHeaders = { headers: { get(name: string): string | null } };

export async function currentUser(req: HasHeaders): Promise<User | null> {
  const userId = readSession(req.headers.get("cookie"));
  if (!userId) return null;
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_users").select("id,email").eq("id", userId).maybeSingle();
  return (data as User | null) ?? null;
}

// ── 이메일 ──────────────────────────────────────────────────────────────────
export function normalizeEmail(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ── 비밀번호 ────────────────────────────────────────────────────────────────
// Node 내장 scrypt만 쓴다(bcrypt/argon2 같은 네이티브 의존성 없이). 저장 형식은
// "scrypt$솔트$해시" 한 문자열이라 나중에 알고리즘을 바꿔도 구분해 처리할 수 있다.
export const PASSWORD_MIN = 8;

export function passwordProblem(password: string): string | null {
  if ([...(password ?? "")].length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상으로 만들어 주세요.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const got = await scryptAsync(password, salt, 64);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

// ── 계정 조회·생성 ──────────────────────────────────────────────────────────
/** 이메일로 계정을 찾거나 만든다. 구글·카카오 등 어떤 경로로 들어와도 같은 주소면 같은 계정이다. */
export async function findOrCreateUser(
  email: string,
): Promise<{ user: User; isNew: boolean } | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date().toISOString();

  const existing = await db.from("nm_users").select("id,email").eq("email", email).maybeSingle();
  if (existing.data) {
    const user = existing.data as User;
    await db.from("nm_users").update({ last_login_at: now }).eq("id", user.id);
    return { user, isNew: false };
  }

  const created = await db
    .from("nm_users")
    .insert({ email, last_login_at: now })
    .select("id,email")
    .maybeSingle();
  if (!created.data) {
    console.error("[auth] 계정 생성 실패:", created.error?.message);
    return null;
  }
  return { user: created.data as User, isNew: true };
}

// password_hash 컬럼이 아직 없는 DB에서도 앱이 깨지지 않게 한다 — 컬럼이 생기면 자동으로
// 비밀번호 로그인이 노출된다(키가 있으면 켜지는 다른 기능들과 같은 방식).
let passwordColumnReady: boolean | undefined;

export async function passwordLoginAvailable(): Promise<boolean> {
  if (passwordColumnReady === true) return true; // 한 번 확인되면 다시 묻지 않는다
  const db = getDb();
  if (!db) return false;
  const { error } = await db.from("nm_users").select("password_hash").limit(1);
  if (!error) passwordColumnReady = true;
  return !error;
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from("nm_users").select("password_hash").eq("id", userId).maybeSingle();
  return (data as { password_hash: string | null } | null)?.password_hash ?? null;
}


// ── 매직링크 토큰 ───────────────────────────────────────────────────────────
/** 원문 토큰을 반환(메일에만 실린다). DB에는 sha256 해시만 저장. */
export async function issueLoginToken(email: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await db.from("nm_login_tokens").insert({
    token_hash: hashToken(token),
    email,
    expires_at: new Date(Date.now() + TOKEN_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    console.error("[auth] 로그인 토큰 발급 실패:", error.message);
    return null;
  }
  return token;
}

/** 토큰을 1회 소비하고 계정을 만들거나 조회한다. 만료·재사용·위조면 null. */
export async function consumeLoginToken(
  token: string,
): Promise<{ user: User; isNew: boolean } | null> {
  const db = getDb();
  if (!db || !token) return null;
  const tokenHash = hashToken(token);

  const { data } = await db
    .from("nm_login_tokens")
    .select("email,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const row = data as { email: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || new Date(row.expires_at) <= new Date()) return null;

  await db
    .from("nm_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return findOrCreateUser(row.email);
}

// ── 진단 사용량 (계정 기준) ─────────────────────────────────────────────────
export function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function diagUsedByUser(userId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const { data } = await db
    .from("nm_diag_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("ym", currentYm())
    .maybeSingle();
  return (data as { used: number } | null)?.used ?? 0;
}

/** 이번 달 사용량을 used+1로 기록. 실패해도 요청을 깨뜨리지 않는다. */
export async function bumpDiagUsed(userId: string, used: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { error } = await db
    .from("nm_diag_usage")
    .upsert({ user_id: userId, ym: currentYm(), used: used + 1 }, { onConflict: "user_id,ym" });
  if (error) console.error("[auth] 진단 사용량 기록 실패:", error.message);
}

// ── 로그인 시 기존 추적 승계 ────────────────────────────────────────────────
/**
 * 계정이 생기기 전에 등록해둔 추적을 계정으로 옮긴다. 두 갈래를 챙긴다.
 *   1) 계정 도입 이전에 이메일만으로 등록한 행 (같은 주소면 같은 사람이다)
 *   2) 이번 브라우저에서 가입 없이 등록한 행 (anon_id)
 * "가입 없이 추적 → 알림 켜려고 가입 → 추적이 그대로 이어짐" 흐름이 끊기지 않게 하는 게 목적.
 * 2)는 계정에 이미 추적이 있으면 무료 1작품 한도를 넘기지 않도록 건너뛴다.
 */
export async function adoptTracking(user: User, anonId: string | null): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  let adopted = 0;

  const legacy = await db
    .from("tracked_novels")
    .update({ user_id: user.id })
    .eq("contact", user.email)
    .is("user_id", null)
    .select("id");
  if (legacy.error) console.error("[auth] 기존 추적 승계 실패:", legacy.error.message);
  else adopted += ((legacy.data as { id: number }[] | null) ?? []).length;

  if (!anonId) return adopted;

  const { count } = await db
    .from("tracked_novels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) > 0) return adopted;

  const anon = await db
    .from("tracked_novels")
    .update({ user_id: user.id, anon_id: null })
    .eq("anon_id", anonId)
    .select("id");
  if (anon.error) console.error("[auth] 익명 추적 승계 실패:", anon.error.message);
  else adopted += ((anon.data as { id: number }[] | null) ?? []).length;

  return adopted;
}
