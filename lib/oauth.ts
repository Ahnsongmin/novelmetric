// 소셜 로그인 (OAuth 2.0 / OpenID Connect) — 라이브러리 없이 표준 흐름만 직접 구현한다.
//
// 지금은 구글만 켜져 있다. 카카오·네이버는 각각 비즈앱 전환·검수 승인이 필요해서
// 승인이 나면 PROVIDERS에 항목 하나만 추가하면 되도록 모양을 맞춰 뒀다.
//
// 엔드포인트는 구글 OpenID 디스커버리 문서(accounts.google.com/.well-known/openid-configuration)
// 에서 확인한 값이다.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type ProviderId = "google";

type Provider = {
  id: ProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
};

const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
};

export function getProvider(id: string): Provider | null {
  return PROVIDERS[id as ProviderId] ?? null;
}

/** 키가 없으면 버튼 자체를 숨긴다 — env만 넣으면 켜지는 기존 방식과 동일. */
export function enabledProviders(): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((id) => {
    const p = PROVIDERS[id];
    return Boolean(p.clientId() && p.clientSecret());
  });
}

/** 각 플랫폼 개발자센터에 이 값을 그대로 등록해야 한다. */
export function redirectUri(origin: string, id: ProviderId): string {
  return `${origin}/api/auth/oauth/${id}/callback`;
}

// ── state (CSRF 방지) ───────────────────────────────────────────────────────
// 값 자체에 서명해 쿠키로 왕복시킨다. 콜백에서 쿼리의 state와 쿠키가 같아야 통과.
export const OAUTH_STATE_COOKIE = "nm_oauth";

function sign(payload: string): string {
  const secret = process.env.GATE_SECRET ?? process.env.TOSS_SECRET_KEY ?? "nm-dev-secret";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

/** state 값에 로그인 후 돌아갈 경로를 함께 실어 보낸다. */
export function makeState(next: string): string {
  const nonce = randomBytes(12).toString("hex");
  const raw = `${nonce}|${next}`;
  return `${Buffer.from(raw).toString("base64url")}.${sign(raw)}`;
}

export function readState(state: string | null): { next: string } | null {
  if (!state) return null;
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  let raw: string;
  try {
    raw = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const want = Buffer.from(sign(raw));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const next = raw.split("|").slice(1).join("|");
  return { next: next.startsWith("/") ? next : "/dashboard" };
}

export function stateCookie(state: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`;
}

export function clearStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function readStateCookie(cookieHeader: string | null): string | null {
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// ── 인가 URL ────────────────────────────────────────────────────────────────
export function authorizeUrl(p: Provider, origin: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: p.clientId()!,
    redirect_uri: redirectUri(origin, p.id),
    response_type: "code",
    scope: p.scope,
    state,
    // 계정을 여러 개 쓰는 사람이 매번 고를 수 있게 — 잘못된 계정으로 묶이는 사고를 줄인다.
    prompt: "select_account",
  });
  return `${p.authorizeUrl}?${qs.toString()}`;
}

// ── 코드 → 이메일 ───────────────────────────────────────────────────────────
/**
 * 인가 코드를 토큰으로 바꾸고 검증된 이메일을 꺼낸다.
 * id_token은 구글과의 서버 대 서버 TLS 응답으로 직접 받은 값이라 페이로드를 그대로 읽는다.
 * 이메일이 미인증(email_verified=false)이면 계정을 만들지 않는다 — 남의 주소를 주장할 수 있다.
 */
export async function exchangeCodeForEmail(
  p: Provider,
  origin: string,
  code: string,
): Promise<{ email: string } | { error: string }> {
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: p.clientId()!,
      client_secret: p.clientSecret()!,
      redirect_uri: redirectUri(origin, p.id),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    return { error: `token_${res.status}` };
  }
  const token = (await res.json()) as { id_token?: string };
  if (!token.id_token) return { error: "no_id_token" };

  const payloadPart = token.id_token.split(".")[1];
  if (!payloadPart) return { error: "bad_id_token" };
  let payload: { email?: string; email_verified?: boolean | string };
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return { error: "bad_id_token" };
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!email) return { error: "no_email" };
  if (!verified) return { error: "email_unverified" };
  return { email };
}
