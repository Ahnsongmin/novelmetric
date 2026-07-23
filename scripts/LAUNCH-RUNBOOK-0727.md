# 월요일(7/27) 출시 런북 — 아카 글 + 대기자 메일 + Pro 베타

> 결제 = **페이앱(PayApp) 카드·간편결제, 전자동** (7/23 연동·배포 완료).
> toss.me 종료 확인 → 개인송금 플랜B 폐기, 페이앱으로 확정 (가입비 0, 개인 가입, 비사업자 수수료 4%).
> 페이앱 서류 심사(3~4영업일)는 "정산" 전까지만 — 결제받기는 즉시 가능.

## D-Day 전 (지금~일요일) — 준비 완료분 ✅ / 남은 것 ⬜

- ✅ **페이앱 결제 연동 배포** — /pro 휴대폰 입력→카드결제→웹훅→NM코드 자동발급 (`lib/payapp.ts`, /api/payapp/*)
- ✅ 게이트 라이브: `payapp:true, enabled:true` (무료 제한도 가동 — 진단 월3회·추적 1작품)
- ✅ 토스 테스트 키 제거(가짜 결제 구멍 차단), GATE_SECRET 등록
- ✅ 대기자 10명 명단 최신화 (`scripts/waitlist-recipients.txt`)
- ✅ 무료 체험 코드 10개 생성 (`scripts/waitlist-codes.json` / `.sql`, 만료 2026-09-30)
- ✅ 대기자 메일 본문 + 개인 코드 자동 삽입 (`waitlist-message.txt`, dry_run 검증됨)
- ⬜ **실결제 E2E 1건** — 사장님 폰번호+카드로 /pro에서 9,900원 결제 → 코드 자동발급 확인 → 페이앱 관리자에서 결제 취소(환불)
- ⬜ **페이앱 계약서류 제출** — 정산받으려면 필요(3~4영업일). 이번 주에 내면 첫 정산 무리 없음
- ⬜ **체험 코드 10개 DB 삽입** — `scripts/waitlist-codes.sql`을 Supabase SQL Editor에서 실행 (메일 발송 전 필수)
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

## 결제 흐름 (페이앱, 손님 입장 — 전자동)
1. /pro에서 휴대폰 번호 입력 → "카드·간편결제로 구매하기" → 페이앱 결제창(payurl)
2. 카드/간편결제 9,900원 → 페이앱 웹훅이 NM-코드 자동 발급
3. /pro/payapp 페이지에 코드 자동 표시 + 이 브라우저 자동 적용 (다른 기기는 코드 입력)
- 사장님 개입 없음. 승인취소 요청만 페이앱 관리자에서 수동 처리.

## 나중 (반응 보고)
- 매출 커지고 사업자 내면 → 네이버페이(연회비 0) 추가 + 수수료 우대(사업자 1.9~3.4%)로 페이앱 재계약. 토스 33만원은 스킵.
