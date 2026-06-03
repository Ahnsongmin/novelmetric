"use client";

import { useState } from "react";

type Stats = {
  novelId: number;
  title: string;
  genre: string;
  author: string;
  episodes: number | null;
  views: number | null;
  recommends: number | null;
  chars: number | null;
  favorites: number | null;
  registeredAt: string | null;
  lastUpdatedAt: string | null;
};
type Snapshot = {
  views: number | null;
  recommends: number | null;
  favorites: number | null;
  collected_at: string;
};
type Resp = { stats: Stats; history: Snapshot[]; dbEnabled: boolean };

export default function DashboardPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setData(null);
    setTracked(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/novel?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "조회 실패");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function track() {
    if (!data) return;
    setTracking(true);
    try {
      const res = await fetch("/api/novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: String(data.stats.novelId) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "추적 실패");
      setTracked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setTracking(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-5 py-10">
      <a href="/" className="text-sm text-muted hover:text-foreground">
        ← 노블메트릭
      </a>
      <h1 className="mt-3 text-2xl font-bold md:text-3xl">작품 성장 대시보드</h1>
      <p className="mt-1.5 text-muted">
        문피아 작품 URL 또는 작품 ID를 넣으면 현재 지표와 추이를 보여줍니다.
      </p>

      <form onSubmit={lookup} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="예) https://novel.munpia.com/555698  또는  555698"
          className="flex-1 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "조회 중…" : "지표 조회"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-accent-2">{error}</p>}

      {data && (
        <div className="mt-8 animate-fadeUp space-y-6">
          <div>
            <p className="text-xs text-muted">
              {data.stats.genre} · {data.stats.author}
            </p>
            <h2 className="text-xl font-bold">{data.stats.title}</h2>
            <p className="mt-0.5 text-xs text-muted">
              최근 연재일 {data.stats.lastUpdatedAt ?? "-"} · 작품ID {data.stats.novelId}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="연재 화수" value={data.stats.episodes} unit="화" />
            <Metric label="조회수" value={data.stats.views} />
            <Metric label="추천수" value={data.stats.recommends} />
            <Metric label="선호작수" value={data.stats.favorites} highlight />
            <Metric label="글자수" value={data.stats.chars} />
          </div>

          <TrendChart history={data.history} />

          <div className="flex items-center gap-3">
            <button
              onClick={track}
              disabled={tracking || tracked}
              className="rounded-lg border border-accent bg-accent/10 px-5 py-2.5 text-sm font-bold text-foreground transition hover:bg-accent/20 disabled:opacity-60"
            >
              {tracked ? "✓ 추적 등록됨" : tracking ? "등록 중…" : "📈 이 작품 매일 추적하기"}
            </button>
            {!data.dbEnabled && (
              <span className="text-xs text-muted">
                * 추이 누적은 DB 연결 후 매일 자동 수집됩니다.
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number | null;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-accent/60 bg-accent/10" : "border-border bg-card/40"
      }`}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-extrabold">
        {value === null ? "-" : value.toLocaleString("ko-KR")}
        {unit && value !== null && <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

function TrendChart({ history }: { history: Snapshot[] }) {
  const points = history
    .filter((h): h is Snapshot & { views: number } => h.views !== null)
    .map((h) => ({ views: h.views, collected_at: h.collected_at }));
  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/20 p-6 text-center text-sm text-muted">
        📉 추이 그래프는 데이터가 2일 이상 쌓이면 표시됩니다.
        <br />
        <span className="text-xs">‘이 작품 매일 추적하기’를 누르면 매일 자동 수집됩니다.</span>
      </div>
    );
  }

  const W = 720,
    H = 200,
    P = 30;
  const xs = points.map((_, i) => P + (i / (points.length - 1)) * (W - 2 * P));
  const vals = points.map((p) => p.views);
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const y = (v: number) => H - P - ((v - min) / Math.max(max - min, 1)) * (H - 2 * P);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${y(p.views)}`).join(" ");

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="mb-2 text-sm font-bold">조회수 추이</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <polyline
          points={`${xs[0]},${H - P} ${points.map((p, i) => `${xs[i]},${y(p.views)}`).join(" ")} ${xs[xs.length - 1]},${H - P}`}
          fill="url(#g)"
          opacity="0.25"
        />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={y(p.views)} r="3" fill="var(--accent-2)" />
        ))}
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
