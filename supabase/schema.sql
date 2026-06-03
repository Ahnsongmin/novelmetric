-- 노블메트릭 Phase 0: 대기자(waitlist) 테이블
-- Supabase SQL Editor에 붙여넣어 실행하세요.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  genre text,
  source text default 'landing',
  created_at timestamptz not null default now()
);

-- 서비스 롤 키로만 서버에서 insert 하므로 RLS는 켜두고 정책은 두지 않음(클라이언트 직접 접근 차단)
alter table public.waitlist enable row level security;
