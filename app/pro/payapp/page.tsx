"use client";

// 페이앱 결제 후 도착 페이지(returnurl) — 웹훅 발급이 끝날 때까지 폴링해 코드 표시.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import GuestPassNotice from "@/components/GuestPassNotice";
import { savePassCode } from "@/lib/session-client";

const POLL_MS = 2500;
const MAX_POLLS = 40; // 최대 100초 대기 후 안내 전환

function PayappResult() {
  const sp = useSearchParams();
  const order = sp.get("order") ?? "";
  const [state, setState] = useState<"waiting" | "done" | "timeout" | "error">(order ? "waiting" : "error");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loggedIn, setLoggedIn] = useState(true); // 확인 전에는 안내를 띄우지 않는다(깜빡임 방지)
  const polls = useRef(0);

  useEffect(() => {
    if (!order) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const j = await fetch(`/api/payapp/code?order=${encodeURIComponent(order)}`).then((r) => r.json());
        if (j.code) {
          savePassCode(j.code);
          // 로그인 상태면 이 호출로 패스가 계정에 귀속된다(기기를 바꿔도 따라오게).
          // 비로그인이면 귀속시킬 계정이 없으므로 아래에서 가입을 권한다 — 계정 없이 결제한
          // 손님은 코드를 잃으면 복구 수단이 없고 주간 리포트도 받을 수 없다.
          try {
            const g = await fetch(`/api/gate?code=${encodeURIComponent(j.code)}`).then((r) => r.json());
            setLoggedIn(Boolean(g.loggedIn));
          } catch {
            /* 연결 실패는 이용을 막지 않는다 */
          }
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
            {expiresAt && `${new Date(expiresAt).toLocaleDateString("ko-KR")}까지 Pro 기능이 열립니다.`} 이 브라우저에 자동
            저장됐고, 다른 기기에서는 아래 코드를 입력하면 돼요.
          </p>
          <p className="mb-4 rounded-lg bg-background/60 py-3 font-mono text-lg font-bold tracking-wider">{code}</p>
          {!loggedIn && (
            <div className="mb-4 text-left">
              <GuestPassNotice
                message="이 코드로 지금 바로 이용하실 수 있어요. 다음부터는 회원가입 후 이용해 주세요 — 계정에 연결해두면 코드를 잃어버리거나 기기를 바꿔도 Pro가 유지되고, 주간 성장 리포트를 이메일로 받을 수 있어요."
                next="/dashboard"
              />
            </div>
          )}
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
          {/* 결제 지연은 가장 급한 문의다 — 유형을 미리 결제로 골라 보낸다. */}
          <a
            href="/contact?kind=payment"
            className="mt-3 inline-block font-bold text-accent hover:underline"
          >
            결제 문의 남기기 →
          </a>
          <p className="mt-1 text-xs text-muted">
            또는 메일:{" "}
            <a href="mailto:songminan90@gmail.com" className="text-accent hover:underline">
              songminan90@gmail.com
            </a>
          </p>
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
