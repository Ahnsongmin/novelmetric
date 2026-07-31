"use client";

// Pro 패스(30일) 판매 페이지 — 결제 → /pro/success에서 코드 발급.
// 결제 env가 없으면(준비 전) 대기 안내만 보여준다.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { savePassCode, storedPassCode } from "@/lib/session-client";

type Gate = {
  enabled: boolean;
  loggedIn: boolean;
  freeLeft: number | null;
  passValidUntil: string | null;
  clientKey: string | null;
  payapp: boolean;
  pass: { amount: number; days: number; name: string };
};

const FREE_FEATURES = [
  "작품 추적 1개 — 매일 새벽 자동 수집",
  "연독률·이탈 분석 · CSV",
  "지표 급변·이정표 알림 (이메일 등록 시)",
  "베스트 분석 · 트렌드 리포트 열람",
  "제목 진단 매달 1회 (무료 회원가입 필요)",
];
// 문구는 "조건 없이 다 된다"로 읽히면 안 된다(2026-07-30 정직성 수정).
// 실측으로 확인된 제약 두 가지를 각 항목에 그대로 적는다.
//   ① 메일로 가는 3종(주간 리포트·경쟁작 워치·이탈 경보)은 대시보드에서 작품을 추적하고
//      이메일 알림을 켠 사람만 대상이 된다(lib/db.ts listWeeklyTargets).
//   ② 연독률 기반 기능(장르 벤치마크·이탈 경보)은 회차별 조회수를 주는 문피아·노벨피아만
//      가능하다. 네이버시리즈·카카오페이지는 회차 조회수 비공개라 원천적으로 계산이 안 된다.
const PRO_FEATURES = [
  "작품 추적 무제한 — 경쟁작도 나란히 추적 (4개 플랫폼)",
  "심화 추이 분석 — 일별 증감표·성장 속도·이정표 예상",
  "장르 벤치마크 — 장르 상위권 연독률 대비 내 위치 (문피아·노벨피아 작품)",
  "제목 진단 월 30회",
  "주간 성장 리포트 이메일 — 매주 월요일 (이메일 알림 설정 시)",
  "경쟁작 워치 — 추적 작품끼리 주간 비교표 메일 (2작품 이상 + 이메일 알림 설정 시)",
  "이탈 경보 — 새 회차 이탈 감지되면 다음날 아침 메일 (문피아·노벨피아 · 이메일 알림 설정 시)",
];

function ProContent() {
  const sp = useSearchParams();
  const [gate, setGate] = useState<Gate | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [phone, setPhone] = useState("");
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState(sp.get("pay") === "fail" ? "결제가 취소되거나 실패했어요." : "");

  useEffect(() => {
    const code = storedPassCode();
    // from=pro → 판매 페이지 조회를 퍼널 이벤트로 기록(대시보드에서 오는 gate 호출과 구분)
    const qs = new URLSearchParams({ from: "pro" });
    if (code) qs.set("code", code);
    fetch(`/api/gate?${qs.toString()}`)
      .then((r) => r.json())
      .then((g: Gate) => {
        setGate(g);
        setValidUntil(g.passValidUntil);
      })
      .catch(() => {});
  }, []);

  async function buy() {
    if (!gate?.clientKey) return;
    setError("");
    try {
      if (!document.querySelector('script[src^="https://js.tosspayments.com/v2"]')) {
        await new Promise<void>((ok, fail) => {
          const s = document.createElement("script");
          s.src = "https://js.tosspayments.com/v2/standard";
          s.onload = () => ok();
          s.onerror = () => fail(new Error("결제 모듈을 불러오지 못했어요."));
          document.head.appendChild(s);
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TossPayments = (window as any).TossPayments;
      const payment = TossPayments(gate.clientKey).payment({ customerKey: TossPayments.ANONYMOUS });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: gate.pass.amount },
        orderId: `nmpass-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        orderName: gate.pass.name,
        successUrl: `${location.origin}/pro/success`,
        failUrl: `${location.origin}/pro?pay=fail`,
        card: { useEscrow: false, flowMode: "DEFAULT", useCardPoint: false, useAppCardOnly: false },
      });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/취소/.test(msg)) setError(msg || "결제를 시작하지 못했어요.");
    }
  }

  // 페이앱 결제 — 휴대폰 번호로 결제요청 생성 후 결제창(payurl)으로 이동
  async function buyPayapp() {
    setError("");
    setBuying(true);
    try {
      const res = await fetch("/api/payapp/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "결제요청 생성에 실패했어요.");
      location.href = j.payurl;
    } catch (e) {
      setError((e as Error).message);
      setBuying(false);
    }
  }

  async function applyCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setError("");
    const g = (await fetch(`/api/gate?code=${encodeURIComponent(code)}`).then((r) => r.json())) as Gate;
    if (!g.passValidUntil) {
      setError("코드를 찾을 수 없거나 만료됐어요.");
      return;
    }
    savePassCode(code);
    setValidUntil(g.passValidUntil);
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 py-12">
      {/* 상단 네비·계정 배지는 layout.tsx의 SiteNav가 공통으로 그린다. */}
      <h1 className="text-3xl font-bold">Pro 패스</h1>
      <p className="mt-2 break-keep text-muted">
        결제하면 받는 <b className="text-foreground">코드 한 줄</b>로 30일 동안 열립니다. 로그인한
        상태로 코드를 넣으면 계정에 연결돼, 기기를 바꾸거나 코드를 잃어버려도 그대로 쓸 수 있어요.
      </p>

      {validUntil && (
        <div className="mt-5 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          ✅ Pro 패스 사용 중 — <b>{new Date(validUntil).toLocaleDateString("ko-KR")}</b>까지
        </div>
      )}
      {error && (
        <div className="mt-5 rounded-xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-300">{error}</div>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/60 p-6">
          <h2 className="font-bold">Free</h2>
          <p className="mt-1 text-2xl font-bold">0원</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {FREE_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-accent/50 bg-card/60 p-6 shadow-xl shadow-black/20">
          <h2 className="font-bold text-accent">Pro 패스 · 30일</h2>
          <p className="mt-1 text-2xl font-bold">
            9,900원 <span className="text-sm font-normal text-muted">/ 30일 · 자동결제 없음</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {PRO_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          {/* 메일 혜택이 왜 안 오는지 나중에 묻게 만들지 말고 여기서 미리 알린다. */}
          <p className="mt-3 break-keep rounded-lg border border-border bg-background/40 p-2.5 text-xs text-muted">
            메일로 오는 3가지(주간 리포트·경쟁작 워치·이탈 경보)는{" "}
            <a href="/dashboard" className="text-accent underline underline-offset-2">
              대시보드
            </a>
            에서 작품을 추적하고 <b className="text-foreground">이메일 알림을 켜야</b> 발송됩니다.
            연독률을 쓰는 기능(장르 벤치마크·이탈 경보)은 회차별 조회수를 공개하는{" "}
            <b className="text-foreground">문피아·노벨피아</b> 작품에만 적용돼요.
          </p>
          {gate?.payapp ? (
            <div className="mt-5">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder="휴대폰 번호 (결제 확인용, 01012345678)"
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
              />
              <button
                onClick={buyPayapp}
                disabled={buying || phone.replace(/[^0-9]/g, "").length < 10}
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
              >
                {buying ? "결제창 여는 중…" : "카드·간편결제로 구매하기"}
              </button>
              <p className="mt-2 text-xs text-muted">
                결제창에서 카드/간편결제 후, 코드가 자동 발급됩니다. 번호는 결제 확인 외에 쓰지 않아요.
              </p>
            </div>
          ) : gate?.enabled && gate?.clientKey ? (
            <button
              onClick={buy}
              className="mt-5 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90"
            >
              30일 패스 구매하기
            </button>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-background/60 p-3 text-center text-sm text-muted">
              결제 오픈 준비 중이에요. 지금은 모든 기능이 무료입니다 — 마음껏 써보세요!
            </p>
          )}
        </div>
      </div>

      {gate?.enabled && (
        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <p className="mb-2 text-sm font-semibold">이미 패스가 있나요?</p>
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="NM-XXXXXXXXXXXX"
              className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm uppercase outline-none focus:border-accent"
            />
            <button
              onClick={applyCode}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:border-accent"
            >
              적용
            </button>
          </div>
          <p className="mt-2 break-keep text-xs text-muted">
            다른 기기에서 결제했다면 받은 코드를 입력하면 이 기기에서도 열려요.
            {gate?.loggedIn
              ? " 로그인 상태라 코드가 계정에 연결됩니다."
              : " 로그인한 뒤 넣으면 계정에 연결돼 다음부터는 코드 없이도 열립니다."}
          </p>
          {/* 결제 관련 문의는 여기서 가장 많이 생긴다 — 유형을 미리 골라 보낸다. */}
          <p className="mt-3 break-keep text-xs text-muted">
            결제했는데 코드를 못 받으셨거나 코드를 잃어버리셨나요?{" "}
            <a href="/contact?kind=payment" className="font-bold text-accent hover:underline">
              결제 문의하기 →
            </a>
          </p>
        </div>
      )}
    </main>
  );
}

export default function ProPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">불러오는 중…</div>}>
      <ProContent />
    </Suspense>
  );
}
