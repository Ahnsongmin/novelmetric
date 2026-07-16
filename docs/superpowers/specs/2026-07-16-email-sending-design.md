# 이메일 발송 연결 (Gmail SMTP) — 설계

> 2026-07-16 승인됨. 배경: Pro 기능 4종 중 "지표 급변 알림"만 발송 키가 없어 죽어 있음.
> 대기자(waitlist) 6명에게 안내 메일을 보낼 수단도 필요.

## 결정

- **발송 방식: Gmail SMTP** (songminan90@gmail.com + 앱 비밀번호). 도메인·비용 없이 즉시 가동.
  유료 결제가 붙으면 도메인 구매 + Resend로 전환 — env만 교체하면 되도록 어댑터 구조 유지.
- 대기자 안내 메일의 **본문은 사용자가 직접 작성**해서 전달 → 스크립트는 그 텍스트를 그대로 발송.

## 구현

1. `lib/notify.ts`의 `sendEmail`을 2-프로바이더 폴백으로:
   - `RESEND_API_KEY` 있으면 Resend (기존 코드 그대로)
   - 없고 `GMAIL_USER` + `GMAIL_APP_PASSWORD` 있으면 Gmail SMTP (nodemailer)
   - 둘 다 없으면 기존처럼 graceful skip
   - 발신자 표시: `노블메트릭 <GMAIL_USER>` (화이트라벨 — 벤더명 금지)
2. 대기자 안내는 일회성 로컬 스크립트 `scripts/send-waitlist-email.mjs`:
   - 수신자: `scripts/waitlist-recipients.txt` (한 줄당 이메일 1개)
   - 본문: `scripts/waitlist-message.txt` (1번째 줄 = 제목, 나머지 = 본문 그대로)
   - **dry_run 기본** (수신자·본문 출력만), `--live` 플래그로만 실발송
   - 발송 간 2초 간격 (Gmail 스팸 판정 회피)
3. Vercel env 등록: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (production) → cron 알림 이메일 활성화

## 검증

- 로컬 빌드 통과
- 사용자 본인 이메일로 테스트 1통 발송 → 수신 확인 증거
- 대기자 실발송은 사용자가 본문을 준 뒤, dry_run 로그 확인 → --live

## 블로커 (사용자 몫)

- 구글 앱 비밀번호 발급 (myaccount.google.com/apppasswords, 2단계 인증 필요 — 폰 승인 1회)

## 나중에 (Resend 전환 시)

- 도메인 구매 → Resend 도메인 인증 → `RESEND_API_KEY`/`RESEND_FROM` 등록 → Gmail env 제거. 코드 수정 없음.
