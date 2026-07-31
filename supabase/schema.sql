-- 노블메트릭 DB 스키마
-- Supabase SQL Editor에 붙여넣어 실행하세요.

-- Phase 0: 대기자 ------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  genre text,
  source text default 'landing',
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;

-- Phase 1: 작품 추적 ---------------------------------------------------------

-- 작품 마스터
create table if not exists public.novels (
  novel_id bigint primary key,
  platform text not null default 'munpia',
  title text,
  genre text,
  author text,
  author_id bigint,
  registered_at text,
  created_at timestamptz not null default now()
);

-- 일별 지표 스냅샷 (시계열)
create table if not exists public.snapshots (
  id bigint generated always as identity primary key,
  novel_id bigint not null references public.novels(novel_id) on delete cascade,
  episodes int,
  views bigint,
  recommends bigint,
  chars bigint,
  favorites bigint,
  last_updated_at text,
  collected_at timestamptz not null default now()
);
create index if not exists snapshots_novel_time_idx
  on public.snapshots (novel_id, collected_at desc);

-- 사용자가 추적 등록한 작품 (Phase 0: 이메일 단위, 추후 user_id로 확장)
create table if not exists public.tracked_novels (
  id bigint generated always as identity primary key,
  novel_id bigint not null,
  email text,
  notify_channel text default 'none', -- 'email' | 'kakao' | 'none' (작가가 앱에서 선택)
  contact text,                        -- 이메일 주소 또는 휴대폰번호
  created_at timestamptz not null default now(),
  unique (novel_id, email)
);

-- 기존 테이블에 알림 컬럼 추가(이미 만들었던 경우용 마이그레이션)
alter table public.tracked_novels add column if not exists notify_channel text default 'none';
alter table public.tracked_novels add column if not exists contact text;

-- 서버(서비스 롤 키)에서만 접근. 클라이언트 직접 접근 차단.
alter table public.novels enable row level security;
alter table public.snapshots enable row level security;
alter table public.tracked_novels enable row level security;

-- Phase 2: 일일 베스트 아카이브 (자동 콘텐츠/SEO 엔진) -------------------------
-- Cron이 매일 오늘베스트를 저장 → /insights/[day] 페이지가 자동으로 쌓인다.
create table if not exists public.nm_best_daily (
  day date primary key,
  items jsonb not null,    -- RankItem[] 원본
  created_at timestamptz not null default now()
);
alter table public.nm_best_daily enable row level security;

-- Phase 2: Pro 패스 (30일 이용권, 토스 결제) ----------------------------------
create table if not exists public.nm_pass (
  code text primary key,           -- NM-XXXXXXXXXXXX (결제 후 발급, 로그인 대신 사용)
  order_id text not null unique,   -- 토스 orderId (중복 발급 방지)
  payment_key text not null,
  amount integer not null,
  expires_at timestamptz not null, -- 발급 + 30일
  created_at timestamptz not null default now()
);
alter table public.nm_pass enable row level security;

-- Phase 3: Pro 주간 리포트 — 추적↔패스 연결 -----------------------------------
-- Pro 패스로 추적 등록하면 코드를 함께 저장 → 주간 성장 리포트 이메일 대상 판별.
alter table public.tracked_novels add column if not exists pass_code text;

-- Phase 4: 퍼널 계측 ---------------------------------------------------------
-- 어떤 기능이 실제로 쓰이는지 판단할 근거. 추적은 tracked_novels로 소급 확인되지만
-- 제목 진단은 아무 흔적도 남지 않아 비교가 불가능했다(Vercel 로그는 1시간 보존).
-- 개인정보는 담지 않는다 — 이메일·제목·본문 저장 금지, 집계용 메타만.
create table if not exists public.nm_events (
  id bigint generated always as identity primary key,
  event text not null,   -- diagnose_run | diagnose_402 | track_add | track_402 | pro_view | pro_paid
                         --   | signup_request | signup_done | login | diagnose_401 | track_401
  meta jsonb,            -- { engine, genre, platform, channel } 등 집계용 값만
  created_at timestamptz not null default now()
);
create index if not exists nm_events_event_time_idx
  on public.nm_events (event, created_at desc);
alter table public.nm_events enable row level security;

-- Phase 5: 계정 (매직링크 로그인) ---------------------------------------------
-- 도입 이유는 두 가지 구멍이다.
--  1) 추적 무료 1작품 한도가 '알림 안 받음'을 고르면 이메일이 없어 통째로 스킵됐다.
--  2) 진단 무료 횟수가 쿠키 기준이라 시크릿창으로 무한 반복됐다(호출마다 실제 AI 비용).
-- 둘 다 "신원"이 없어서 생긴 문제라, 소유자 기준으로 세도록 바꾼다.
-- 로그인 수단은 여러 개(구글·이메일+비밀번호·메일 링크)지만 계정은 이메일 하나로 통일된다.
-- email이 unique라 어느 경로로 들어와도 같은 주소면 같은 계정이 된다.
create table if not exists public.nm_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,       -- 항상 소문자·trim 정규화 후 저장
  password_hash text,               -- "scrypt$솔트$해시" (소셜/메일링크만 쓰는 계정은 null)
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.nm_users add column if not exists password_hash text;
alter table public.nm_users enable row level security;

-- 매직링크 1회용 토큰. 원문은 메일에만 들어가고 DB에는 sha256 해시만 둔다(nm_pass와 같은 방침).
create table if not exists public.nm_login_tokens (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.nm_login_tokens enable row level security;

-- 계정 기준 진단 사용량 (nm_diag 쿠키 카운터를 대체)
create table if not exists public.nm_diag_usage (
  user_id uuid not null references public.nm_users(id) on delete cascade,
  ym text not null,                 -- 'YYYY-MM'
  used int not null default 0,
  primary key (user_id, ym)
);
alter table public.nm_diag_usage enable row level security;

-- 소유자 컬럼. 기존 email 컬럼과 unique(novel_id, email)은 그대로 둬서 옛 행을 보존한다.
alter table public.tracked_novels add column if not exists user_id uuid references public.nm_users(id);
alter table public.tracked_novels add column if not exists anon_id text;  -- 비로그인 1작품 카운트용
alter table public.nm_pass        add column if not exists user_id uuid references public.nm_users(id);

-- NULL끼리는 서로 구분되므로 partial index로 각각 건다.
create unique index if not exists tracked_by_user_idx
  on public.tracked_novels (novel_id, user_id) where user_id is not null;
create unique index if not exists tracked_by_anon_idx
  on public.tracked_novels (novel_id, anon_id) where anon_id is not null;

-- Phase 6: 계정 없이 코드만 가진 Pro 손님의 진단 사용량 -------------------------
-- 2026-07-27 결제 손님이 계정 없이 코드만 갖고 있었는데, 7/29 배포한 "진단=로그인 필수"
-- 게이트에 막혀 돈을 내고도 진단을 못 쓰는 상태가 됐다. 로그인 벽으로 막는 대신
-- 유효한 코드를 신원으로 인정하고, 월 한도는 이 표로 코드 기준으로 센다.
create table if not exists public.nm_diag_usage_code (
  code text not null references public.nm_pass(code) on delete cascade,
  ym text not null,                 -- 'YYYY-MM'
  used int not null default 0,
  primary key (code, ym)
);
alter table public.nm_diag_usage_code enable row level security;

-- Phase 7: 문의 접수 -----------------------------------------------------------
-- 유료 고객이 생겼는데 사이트에 연락 창구가 없었다(결제 지연 화면의 mailto 하나가 전부).
-- 접수는 메일 발송이 1순위이고 이 표는 이력·중복 확인용 보조라, insert가 실패해도
-- /api/contact는 성공으로 응답한다(표가 없어도 문의는 접수된다).
create table if not exists public.nm_inquiry (
  id bigint generated always as identity primary key,
  kind text not null,               -- payment | bug | idea | etc
  email text not null,              -- 답장받을 주소
  message text not null,
  pass_code text,                   -- 결제 문의 식별용(있으면)
  user_id uuid references public.nm_users(id),
  sender_hash text,                 -- 도배 차단용 해시(원본 IP는 저장하지 않음)
  mailed boolean not null default false,
  handled_at timestamptz,           -- 답변 완료 표시(수동)
  created_at timestamptz not null default now()
);
create index if not exists nm_inquiry_sender_idx on public.nm_inquiry (sender_hash, created_at desc);
alter table public.nm_inquiry enable row level security;

-- Phase 8: 조회 기반 자동 수집 — 새 표 없음 ------------------------------------
-- 매일 받아오는 4개 플랫폼 랭킹은 "이미 잘 되는 작품"뿐이라 고객의 작품(랭킹 밖)은 자동으로
-- 절대 안 들어온다. 대신 **누군가 조회한 작품**은 수요가 증명된 작품이므로, 조회만 해도
-- 수집 대상에 올려 다음날부터 추이가 생기게 한다(등록·가입 불필요).
--
-- 저장은 위의 `nm_events`를 겸용한다: event='novel_view', meta={novelId, platform}.
-- 전용 표를 만들지 않은 이유는 두 가지다.
--   ① 스키마 변경이 병목이다(대시보드가 자주 멈춘다) — 새 표 없이 즉시 동작하는 편이 낫다.
--   ② 조회 자체가 퍼널 지표다 — "진단 vs 추적" 비교에 빠져 있던 조회 수치가 함께 생긴다.
-- 대상 목록은 lib/db.ts의 listRecentlyViewedIds()가 최신순 이벤트를 훑어 중복 제거해 만든다
-- (PostgREST는 GROUP BY를 못 쓴다). 30일 넘게 조회가 없으면 자동으로 대상에서 빠진다.
