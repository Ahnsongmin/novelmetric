# 노블메트릭 (NovelMetric)

웹소설 작가를 위한 **노출·성장 분석 SaaS**. 기존 집필 에디터(노벨라·펜시브 등)와 달리 "쓴 다음" — 노출·순위·성장을 데이터로 돕습니다.

> 전체 사업/마케팅 계획: `~/.claude/plans/idea-witty-bonbon.md`

## 현재 (Phase 0 — 수요 검증)

- **무료 제목 클릭률 진단**: 제목·소개글·장르 입력 → 후킹 점수 + 강점/약점 + 대안 제목 5개 + 키워드
- **대기자 신청**: 정식 출시 알림 이메일 수집

## 빠른 시작

```bash
npm install
npm run dev        # http://localhost:3000
```

키가 없어도 **즉시 동작**합니다(휴리스틱 데모). 정밀 진단/대기자 저장을 켜려면:

```bash
cp .env.example .env.local   # 값 채우기
```

- `ANTHROPIC_API_KEY` → 있으면 Claude(`claude-sonnet-4-6`)로 정밀 진단, 없으면 휴리스틱 폴백
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → 있으면 대기자 저장
  - `supabase/schema.sql`을 Supabase SQL Editor에서 실행해 `waitlist` 테이블 생성

## 스택

Next.js 16 (App Router) · React 19 · Tailwind v4 · Anthropic SDK · Supabase · Vercel 배포.

## 구조

```
app/
  page.tsx              랜딩 + 무료 진단 UI + 대기자
  api/diagnose/route.ts 제목 진단 API
  api/waitlist/route.ts 대기자 수집 API
lib/diagnose.ts         진단 로직(Claude + 휴리스틱 폴백)
supabase/schema.sql     waitlist 테이블
```

## 배포 (Vercel)

1. GitHub에 푸시 → Vercel 임포트
2. 환경변수(`ANTHROPIC_API_KEY` 등) 등록
3. Deploy
