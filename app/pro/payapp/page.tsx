"use client";

// 페이앱 결제 후 도착 페이지(returnurl) — 웹훅 발급이 끝날 때까지 폴링해 코드 표시.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const POLL_MS = 2500;
const MAX_POLLS = 40; // 최대 100초 대기 후 안내 전환

function PayappResult() {
  const sp = useSearchParams();
  const order = sp.get("order") ?? "";
  const [state, setState] = useState<"waiting" | "done" | "timeout" | "error">(order ? "waiting" : "error");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const polls = useRef(0);

  useEffect(() => {
    if (!order) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const j = await fetch(`/api/payapp/code?order=${encodeURIComponent(order)}`).then((r) => r.json());
        if (j.code) {
          localStorage.setItem("nm_pass", JSON.stringify({ code: j.code }));
          setCode(j.code);
          setExpiresAt(j.expiresAt ?? "");
          setState("done");
          return;
        }
      } catch {
        /* 일시 오류는 다음 폴링에서 재시도 */
      }
      polls.current += 1;
      if (polls.current >= MAX_POLLS) {
        setState("timeout");
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [order]);

  return (
    <main className="mx-auto max-w-md flex-1 px-5 py-16 text-center">
      {state === "waiting" && (
        <div className="rounded-2xl border border-border bg-card/60 p-8">
          <p className="mb-2 text-3xl">⏳</p>
          <p className="text-sm text-muted">결제를 확인하는 중이에요… 잠시만요 (보통 몇 초 안에 끝나요)</p>
        </div>
      )}
      {state === "done" && (
        <div className="rounded-2xl border border-border bg-card/60 p-8 shadow-xl shadow-black/20">
          <p className="mb-2 text-3xl">🎫</p>
          <h1 className="mb-1 text-lg font-bold">Pro 패스가 켜졌어요</h1>
          <p className="mb-4 text-sm text-muted">
            {expiresAt && `${new Date(expiresAt).toLocaleDateString("ko-KR")}까지 모든 기능 무제한.`} 이 브라우저에 자동
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
      {state === "timeout" && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-8 text-sm">
          <p className="mb-3">
            결제 확인이 지연되고 있어요. 결제가 완료됐다면 코드는 정상 발급되니, 잠시 후 이 페이지를 새로고침하거나
            아래로 문의 주세요. 바로 처리해 드릴게요.
          </p>
          <p className="font-mono text-xs text-muted">주문번호: {order}</p>
          <a href="mailto:songminan90@gmail.com" className="mt-3 inline-block text-accent hover:underline">
            메일로 문의하기
          </a>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-8">
          <p className="mb-3 text-sm text-red-300">⚠️ 주문 정보가 없어요.</p>
          <a href="/pro" className="text-sm text-accent hover:underline">← Pro 페이지로</a>
        </div>
      )}
    </main>
  );
}

export default function PayappResultPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">불러오는 중…</div>}>
      <PayappResult />
    </Suspense>
  );
}
