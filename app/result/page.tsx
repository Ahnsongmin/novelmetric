"use client";

import { useEffect, useState } from "react";

export default function ResultPage() {
  const [params, setParams] = useState<{ t: string; s: number; g: string } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("t") || "";
    const s = Number(sp.get("s") || 0);
    const g = sp.get("g") || "";
    if (t) setParams({ t, s, g });
  }, []);

  const color =
    !params ? "#5b9bfd" : params.s >= 80 ? "#34d399" : params.s >= 65 ? "#5b9bfd" : params.s >= 50 ? "#fbbf24" : "#2dd4bf";

  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-5 py-16 text-center">
      <a href="/" className="mb-6 flex items-center gap-2 font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm text-background">
          N
        </span>
        노블메트릭
      </a>

      {params ? (
        <div className="w-full animate-fadeUp rounded-3xl border border-border bg-card/50 p-8">
          <p className="text-sm text-muted">웹소설 제목 클릭률 진단 결과</p>
          <h1 className="mt-2 text-balance text-xl font-bold">“{params.t}”</h1>
          <div className="my-6 flex items-center justify-center gap-4">
            <div>
              <span className="text-5xl font-extrabold" style={{ color }}>
                {params.s}
              </span>
              <span className="text-lg text-muted">점</span>
            </div>
            <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ color, border: `1px solid ${color}` }}>
              {params.g}등급
            </span>
          </div>
          <p className="text-sm text-muted">
            당신의 웹소설 제목은 몇 점일까요? 후킹 점수 + 대안 제목 3개를 받아보세요. 무료
            회원가입 후 매달 1회 무료입니다.
          </p>
          <a
            href="/#top"
            className="mt-5 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-3 font-bold text-background"
          >
            내 제목 무료 진단하기 →
          </a>
          <p className="mt-4 text-xs text-muted">
            연독률·투베·경쟁작 비교까지 →{" "}
            <a href="/dashboard" className="text-accent underline">
              대시보드
            </a>
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card/40 p-8">
          <p className="text-muted">잘못된 결과 링크예요.</p>
          <a href="/#top" className="mt-4 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 font-bold text-background">
            무료 진단하러 가기 →
          </a>
        </div>
      )}
    </main>
  );
}
