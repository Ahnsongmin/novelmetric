"use client";

// Pro 패스(30일) 판매 페이지 — 결제 → /pro/success에서 코드 발급.
// 결제 env가 없으면(준비 전) 대기 안내만 보여준다.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Gate = {
  enabled: boolean;
  freeLeft: number | null;
  passValidUntil: string | null;
  clientKey: string | null;
  pass: { amount: number; days: number; name: string };
};

const PASS_KEY = "nm_pass";

function storedPass(): string | null {
  try {
    return (JSON.parse(localStorage.getItem(PASS_KEY) ?? "null") as { code?: string } | null)?.code ?? null;
  } catch {
    return null;
  }
}

const FREE_FEATURES = ["제목 진단 월 3회", "작품 추적 1개", "베스트 분석 열람"];
const PRO_FEATURES = ["제목 진단 무제한", "작품 추적 무제한", "연독률·추이 분석 전부", "지표 급변 알림(이메일)"];

function ProContent() {
  const sp = useSearchParams();
  const [gate, setGate] = useState<Gate | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState(sp.get("pay") === "fail" ? "결제가 취소되거나 실패했어요." : "");

  useEffect(() => {
    const code = storedPass();
    fetch(`/api/gate${code ? `?code=${encodeURIComponent(code)}` : ""}`)
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

  async function applyCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setError("");
    const g = (await fetch(`/api/gate?code=${encodeURIComponent(code)}`).then((r) => r.json())) as Gate;
    if (!g.passValidUntil) {
      setError("코드를 찾을 수 없거나 만료됐어요.");
      return;
    }
    localStorage.setItem(PASS_KEY, JSON.stringify({ code }));
    setValidUntil(g.passValidUntil);
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 py-12">
      <a href="/" className="text-sm text-muted hover:text-foreground">← 노블메트릭</a>
      <h1 className="mt-3 text-3xl font-bold">Pro 패스</h1>
      <p className="mt-2 text-muted">
        회원가입 없이, 결제하면 받는 <b className="text-foreground">코드 한 줄</b>로 30일 동안 모든 기능이 열립니다.
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
          {gate?.enabled ? (
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
          <p className="mt-2 text-xs text-muted">다른 기기에서 결제했다면 받은 코드를 입력하면 이 기기에서도 열려요.</p>
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
