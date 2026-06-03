# 키 연결 가이드 (당신이 해야 할 일만)

코드는 전부 배포돼 있고, 아래 키만 넣으면 **자동으로** 기능이 켜집니다.
키가 없어도 사이트는 동작합니다(진단=샘플, 추이=미수집).

## 1. Supabase (작품 추적·추이 누적·Cron 켜기) — 가장 중요

1. https://supabase.com 에서 프로젝트 생성 (무료)
2. **SQL Editor** 에 `supabase/schema.sql` 전체 붙여넣고 실행
3. **Project Settings → API** 에서 두 값 복사:
   - `Project URL`
   - `service_role` 키 (secret)
4. Vercel에 등록 (프로젝트 폴더에서):
   ```powershell
   vercel env add NEXT_PUBLIC_SUPABASE_URL production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel --prod        # 재배포
   ```
→ 이제 `/dashboard`에서 ‘이 작품 매일 추적하기’ 누르면 매일 18:00(UTC) 자동 수집되어 추이 그래프가 쌓입니다.

## 2. Claude API (제목 진단을 AI 정밀 모드로) — 선택

1. https://console.anthropic.com 에서 API 키 발급
2. ```powershell
   vercel env add ANTHROPIC_API_KEY production
   vercel --prod
   ```
→ `/api/diagnose`가 휴리스틱 → Claude(sonnet) 정밀 진단으로 전환.

## 3. CRON_SECRET (수집 엔드포인트 보호) — 선택

```powershell
vercel env add CRON_SECRET production   # 아무 랜덤 문자열
vercel --prod
```
Vercel Cron은 자동 통과(헤더 인증), 외부의 무단 호출만 차단됩니다.

---

### 로컬에서 켜려면
`.env.local` 파일에 같은 키를 넣고 `npm run dev`.
샘플은 `.env.example` 참고.
