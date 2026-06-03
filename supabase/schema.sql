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
  created_at timestamptz not null default now(),
  unique (novel_id, email)
);

-- 서버(서비스 롤 키)에서만 접근. 클라이언트 직접 접근 차단.
alter table public.novels enable row level security;
alter table public.snapshots enable row level security;
alter table public.tracked_novels enable row level security;
