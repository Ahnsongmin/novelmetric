# 소셜 로그인 설정 안내 (사용자가 직접 해야 하는 부분)

코드는 다 들어가 있다. 각 플랫폼에서 **키를 발급받아 Vercel env에 넣는 순간 버튼이 자동으로 나타난다**
(키가 없으면 버튼 자체가 숨는다 — `lib/oauth.ts`의 `enabledProviders()`).

Claude가 대신 하지 않는 이유: 개발자센터 앱 생성은 계정 설정 변경이고, client secret은 Claude가
다루지 않는 자격증명이다. 아래 절차만 따라 하면 된다.

---

## 0. 먼저 실행할 SQL 한 줄 (필수)

비밀번호 로그인이 동작하려면 컬럼이 하나 필요하다. Supabase → SQL Editor → 붙여넣고 Run:

```sql
alter table public.nm_users add column if not exists password_hash text;

-- 겸사겸사 검증용 테스트 데이터 정리
delete from tracked_novels where anon_id is not null;
delete from nm_diag_usage;
```

이 컬럼이 없으면 비밀번호 가입/로그인이 500으로 실패한다(계정이 잘못 만들어지지는 않는다).

---

## 1. 구글 — 심사 없음, 바로 켤 수 있다

`email`·`profile`·`openid`는 비민감(non-sensitive) scope라 **구글 검증 절차가 필요 없다.**

1. https://console.cloud.google.com 접속 (songminan90@gmail.com으로 로그인)
2. 상단 프로젝트 선택 → **새 프로젝트** → 이름 `novelmetric` → 만들기
3. 왼쪽 메뉴 **API 및 서비스 → OAuth 동의 화면**
   - User Type: **외부(External)** → 만들기
   - 앱 이름: `노블메트릭`
   - 사용자 지원 이메일: songminan90@gmail.com
   - 개발자 연락처 정보: songminan90@gmail.com
   - 나머지는 기본값으로 저장하며 넘어가기
   - 마지막에 **게시 상태 → 앱 게시(Publish app)** 를 눌러 `프로덕션`으로 바꾼다
     (테스트 상태로 두면 등록한 테스트 사용자만 로그인된다)
4. 왼쪽 메뉴 **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `novelmetric web`
   - **승인된 리디렉션 URI**에 아래 두 개를 추가 (오타 주의 — 정확히 이 문자열이어야 한다)
     ```
     https://novelmetric.vercel.app/api/auth/oauth/google/callback
     http://localhost:3000/api/auth/oauth/google/callback
     ```
   - 만들기 → **클라이언트 ID**와 **클라이언트 보안 비밀**이 나온다 (이 창을 닫으면 보안 비밀은 다시 못 본다)
5. 터미널에서 Vercel env 등록 (값 뒤에 줄바꿈이 필요하다):
   ```
   printf '받은_클라이언트_ID\n'     | npx vercel env add GOOGLE_CLIENT_ID production
   printf '받은_클라이언트_보안비밀\n' | npx vercel env add GOOGLE_CLIENT_SECRET production
   ```
   또는 Vercel 대시보드 → novelmetric → Settings → Environment Variables 에서 직접 추가.
6. 등록 후 재배포 (`npx vercel --prod --yes`) 하면 로그인 화면에 **Google로 계속하기** 버튼이 뜬다.

---

## 2. 카카오 — 로그인은 바로, **이메일은 비즈앱 전환 + 심사** 필요

카카오 로그인 자체는 앱만 만들면 되지만, **카카오계정 이메일 동의항목은 비즈니스 앱 전환 후
심사를 받아야** 쓸 수 있다. 우리 서비스는 계정의 존재 이유가 "알림 보낼 이메일"이라
이메일을 못 받으면 가입 후 이메일을 또 입력받아야 해서 의미가 반감된다.
→ **신청해두고 승인 나면 켜는 순서**로 간다.

1. https://developers.kakao.com → 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
   - 앱 이름 `노블메트릭`, 사업자명은 개인 이름으로
2. **앱 설정 → 플랫폼 → Web 플랫폼 등록**
   - 사이트 도메인: `https://novelmetric.vercel.app`
3. **제품 설정 → 카카오 로그인 → 활성화 ON**
   - **Redirect URI**: `https://novelmetric.vercel.app/api/auth/oauth/kakao/callback`
4. **제품 설정 → 카카오 로그인 → 동의항목**
   - `닉네임`, `프로필 사진`은 바로 설정 가능
   - **`카카오계정(이메일)`은 "비즈 앱 전환 후 신청 가능"**으로 표시된다
5. **앱 설정 → 비즈니스 → 비즈 앱 전환** 신청 → 심사 대기
6. 승인 후 REST API 키를 받아 `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET`으로 등록하면
   `lib/oauth.ts`의 `PROVIDERS`에 항목 하나만 추가해서 바로 붙일 수 있다.

---

## 3. 네이버 — **검수 약 1주일**, 승인 전엔 테스트 아이디만 로그인됨

네이버는 애플리케이션을 등록하면 기본이 `개발중` 상태이고, 이 상태에서는 **등록해둔 테스트
아이디로만 로그인이 된다.** 일반 사용자가 쓰려면 검수 승인이 필요하고 **약 1주일** 걸린다.

1. https://developers.naver.com → 로그인 → **Application → 애플리케이션 등록**
   - 애플리케이션 이름: `노블메트릭`
   - 사용 API: **네이버 로그인** 선택 → 제공 정보 중 **이메일 주소** 체크 (필수로)
   - 환경 추가: **PC 웹**
   - 서비스 URL: `https://novelmetric.vercel.app`
   - **Callback URL**: `https://novelmetric.vercel.app/api/auth/oauth/naver/callback`
2. 등록하면 Client ID / Client Secret이 나온다 (이 시점엔 `개발중`)
3. **내 애플리케이션 → 해당 앱 → 개발 상태 → 네아로 검수요청**
   - 테스트 아이디 등록, 로그인 프로세스 스크린샷, 개인정보 수집 항목 최소화 등이 요구된다
   - 심사 거절을 줄이려면 수집 항목을 **이메일만**으로 최소화하는 게 좋다
4. 승인되면 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 등록 → `PROVIDERS`에 추가.

---

## 우선순위 정리

| 수단 | 지금 쓸 수 있나 | 필요한 것 |
|---|---|---|
| 이메일 + 비밀번호 | ✅ | 위 0번 SQL 한 줄 |
| 메일 링크(비밀번호 없이) | ✅ 이미 동작 중 | 없음 |
| 구글 | ✅ 오늘 가능 | 위 1번 (심사 없음) |
| 카카오 | ⏳ | 비즈앱 전환 심사 |
| 네이버 | ⏳ | 검수 약 1주일 |

## 참고 출처

- 구글 OAuth 검증 필요 조건: https://support.google.com/cloud/answer/13463073
- 구글 엔드포인트(디스커버리): https://accounts.google.com/.well-known/openid-configuration
- 카카오 로그인 설정하기: https://developers.kakao.com/docs/ko/kakaologin/prerequisite
- 네이버 검수 절차 관련: https://developers.naver.com/docs/login/devguide/devguide.md
