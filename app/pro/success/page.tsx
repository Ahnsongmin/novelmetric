"use client";

// 토스 결제 성공 리다이렉트 — 서버 승인 후 패스 코드를 발급받아 저장·표시.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { savePassCode } from "@/lib/session-client";

function PaySuccess() {
  const sp = useSearchParams();
  const [state, setState] = useState<"confirming" | "done" | "error">("confirming");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    const paymentKey = sp.get("paymentKey");
    const orderId = sp.get("orderId");
    const amount = Number(sp.get("amount"));
    if (!paymentKey || !orderId || !amount) {
      setState("error");
      setMessage("결제 정보가 올바르지 않아요.");
      return;
    }
    fetch("/api/payment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "결제 승인에 실패했어요.");
        savePassCode(j.code);
        // 로그인 상태면 이 호출로 패스가 계정에 귀속된다(기기를 바꿔도 따라오게).
        void fetch(`/api/gate?code=${encodeURIComponent(j.code)}`);
        setCode(j.code);
        setExpiresAt(j.expiresAt);
        setState("done");
      })
      .catch((e) => {
        setState("error");
        setMessage((e as Error).message);
      });
  }, [sp]);

  return (
    <main className="mx-auto max-w-md flex-1 px-5 py-16 text-center">
      {state === "confirming" && <p className="text-muted">결제를 확인하는 중…</p>}
      {state === "done" && (
        <div className="rounded-2xl border border-border bg-card/60 p-8 shadow-xl shadow-black/20">
          <p className="mb-2 text-3xl">🎫</p>
          <h1 className="mb-1 text-lg font-bold">Pro 패스가 켜졌어요</h1>
          <p className="mb-4 text-sm text-muted">
            {expiresAt && `${new Date(expiresAt).toLocaleDateString("ko-KR")}까지 Pro 기능이 열립니다.`} 이 브라우저에 자동
            저장됐고, 다른 기기에서는 아래 코드를 입력하면 돼요.
          </p>
          <p className="mb-6 rounded-lg bg-background/60 py-3 font-mono text-lg font-bold tracking-wider">{code}</p>
          <a
            href="/dashboard"
            className="block w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90"
          >
            대시보드로 가기
          </a>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-8">
          <p className="mb-3 text-sm text-red-300">⚠️ {message}</p>
          <a href="/pro" className="text-sm text-accent hover:underline">← 돌아가기</a>
        </div>
      )}
    </main>
  );
}

export default function PaySuccessPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">불러오는 중…</div>}>
      <PaySuccess />
    </Suspense>
  );
}
