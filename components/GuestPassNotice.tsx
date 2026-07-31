"use client";

// 계정 없이 Pro 코드만으로 쓰는 손님에게 보이는 안내.
// 톤이 핵심이다 — 기능을 막는 경고가 아니라 "지금은 그대로 쓰시고, 다음엔 가입하시라"는 권유다.
// 실제로 계정 없이 결제한 손님이 로그인 벽에 막힌 사고가 있었고(2026-07-27 결제 건),
// 그 반작용으로 만든 컴포넌트라 문구에서 '차단' 느낌이 나면 안 된다.

export default function GuestPassNotice({
  message,
  next = "/dashboard",
}: {
  message: string;
  next?: string;
}) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-200">
      <p className="break-keep">🎫 {message}</p>
      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mt-1.5 inline-block font-bold text-accent underline underline-offset-2"
      >
        회원가입하고 이 코드 연결하기 →
      </a>
    </div>
  );
}
