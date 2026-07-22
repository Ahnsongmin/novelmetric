# 월요일(7/27) 출시 런북 — 아카 글 + 대기자 메일 + Pro 베타

> 결제는 **플랜 B(개인 송금, 비용 0원)**. 정식 PG(네이버페이/페이앱)는 반응 보고 나중에.
> 코드/링크는 각 단계에 채워 넣기. 순서대로 하면 됨.

## D-Day 전 (지금~일요일) — 준비 완료분 ✅ / 남은 것 ⬜

- ✅ 대기자 10명 명단 최신화 (`scripts/waitlist-recipients.txt`)
- ✅ 무료 체험 코드 10개 생성 (`scripts/waitlist-codes.json` / `.sql`, 만료 2026-09-30)
- ✅ 대기자 메일 본문 + 개인 코드 자동 삽입 (`waitlist-message.txt`, dry_run 검증됨)
- ✅ 송금 고객용 1건 코드 발급기 (`node scripts/gen-pass-codes.mjs --one`)
- ⬜ **체험 코드 10개 DB 삽입** — `scripts/waitlist-codes.sql`을 Supabase SQL Editor에서 실행 (메일 발송 전 필수)
- ⬜ **송금 링크 확정** — 사장님 개인 토스 송금 링크(toss.me/…) → /pro 플랜 B에 삽입
- ⬜ **/pro 플랜 B 배포** — 결제 버튼을 "송금 링크 + 코드 발급 안내"로 (송금 링크 받으면 5분)
- ⬜ 아카 글 원고 확정 (아래)

## 월요일 오전 발사 순서

**1) 체험 코드 DB 반영 확인** (아직 안 했으면)
   - Supabase SQL Editor에 `scripts/waitlist-codes.sql` 실행
   - 검증: `curl "https://novelmetric.vercel.app/api/gate?code=NM-225AF1E787E0"` → `passValidUntil`에 날짜 나오면 OK

**2) /pro 플랜 B 라이브 확인**
   - https://novelmetric.vercel.app/pro 열어 "송금 링크 + 코드 안내" 정상 표시, 코드 입력창 작동 확인

**3) 대기자 메일 발송** (10명)
   - 미리보기: `node scripts/send-waitlist-email.mjs` (dry_run — 코드 치환 확인)
   - 실발송: `node scripts/send-waitlist-email.mjs --live`
   - ※ 공개 발송이라 **사장님 최종 확인 후 실행**. 발송 = 되돌릴 수 없음.

**4) 아카 글 게시** (게시는 사장님 직접)
   - UTM 링크 사용: `node scripts/utm.mjs launch-0727` 로 뽑은 아카용 링크
   - 홈: `https://novelmetric.vercel.app/?utm_source=arca&utm_medium=post&utm_campaign=launch-0727`

**5) 발사 후 모니터링 (당일~3일)**
   - 송금 오면 → `node scripts/gen-pass-codes.mjs --one` → SQL 실행 → 코드 손님에게 답장
   - 유료 결제(송금) 건수 = 페이앱/네이버페이 전환 판단 지표
   - Vercel Analytics UTM 탭에서 아카 유입 수 확인

## 결제 흐름 (플랜 B, 손님 입장)
1. /pro에서 "9,900원 토스로 보내기" → 사장님 송금 링크
2. 송금 후 주문자명/입금 알림 → 사장님이 코드 1개 발급(`--one`)해 전달
3. 손님이 /pro에 코드 입력 → 30일 Pro 열림

## 나중 (반응 보고)
- 유료 전환이 붙으면 → 페이앱(개인 가입, 카드결제, 가입비 0) 연동 → 수동 발급 졸업
- 매출 커지고 사업자 내면 → 네이버페이(연회비 0) + 포트원으로 카드까지. 토스 33만원은 스킵 가능.
