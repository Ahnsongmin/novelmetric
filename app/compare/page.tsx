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
  favorites: number | null;
};
type Retention = { adjustedRate: number | null; cumulativeRate: number | null; grade: string };
type Benchmark = { todayBestRank: number | null };
type Resp = { stats: Stats; retention: Retention | null; benchmark: Benchmark | null };

export default function ComparePage() {
  const [qa, setQa] = useState("");
  const [qb, setQb] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [a, setA] = useState<Resp | null>(null);
  const [b, setB] = useState<Resp | null>(null);

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    if (!qa.trim() || !qb.trim()) {
      setError("두 작품 모두 입력해 주세요. (작품 ID 또는 문피아·노벨피아 URL)");
      return;
    }
    setError("");
    setLoading(true);
    setA(null);
    setB(null);
    try {
      const [ra, rb] = await Promise.all([
        fetch(`/api/novel?q=${encodeURIComponent(qa)}`).then((r) => r.json()),
        fetch(`/api/novel?q=${encodeURIComponent(qb)}`).then((r) => r.json()),
      ]);
      if (ra.error) throw new Error(`첫 번째 작품: ${ra.error}`);
      if (rb.error) throw new Error(`두 번째 작품: ${rb.error}`);
      setA(ra);
      setB(rb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-5 py-10">
      <a href="/" className="text-sm text-muted hover:text-foreground">
        ← 노블메트릭
      </a>
      <h1 className="mt-3 text-2xl font-bold md:text-3xl">작품 비교</h1>
      <p className="mt-1.5 text-muted">
        내 작품과 경쟁작을 나란히 비교하세요. 연독률·선작·조회수·추천을 한눈에. (작품 ID 또는 문피아·노벨피아 URL)
      </p>

      <form onSubmit={compare} className="mt-6 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={qa}
            onChange={(e) => setQa(e.target.value)}
            placeholder="첫 번째 작품 (ID 또는 URL)"
            className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
          <input
            value={qb}
            onChange={(e) => setQb(e.target.value)}
            placeholder="두 번째 작품 (ID 또는 URL)"
            className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {loading ? "비교 중…" : "비교하기"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-accent-2">{error}</p>}

      {loading && !a && (
        <div className="mt-8 grid animate-pulse grid-cols-3 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className={`h-9 rounded ${i % 3 === 0 ? "bg-border/30" : "bg-border/40"}`} />
          ))}
        </div>
      )}

      {a && b && <CompareTable a={a} b={b} />}

      <p className="mt-8 text-center text-xs text-muted">
        작품 ID를 모르면 <a href="/dashboard" className="text-accent underline">대시보드</a>에서 제목으로 검색해 확인할 수 있어요.
      </p>
    </main>
  );
}

function CompareTable({ a, b }: { a: Resp; b: Resp }) {
  const rows: { label: string; va: number | null; vb: number | null; higher: boolean }[] = [
    { label: "연독률(보정)", va: a.retention?.adjustedRate ?? null, vb: b.retention?.adjustedRate ?? null, higher: true },
    { label: "선호작수", va: a.stats.favorites, vb: b.stats.favorites, higher: true },
    { label: "조회수", va: a.stats.views, vb: b.stats.views, higher: true },
    { label: "추천수", va: a.stats.recommends, vb: b.stats.recommends, higher: true },
    { label: "연재 화수", va: a.stats.episodes, vb: b.stats.episodes, higher: true },
  ];
  const fmt = (n: number | null, suffix = "") => (n === null ? "-" : n.toLocaleString("ko-KR") + suffix);
  const win = (va: number | null, vb: number | null, side: "a" | "b") => {
    if (va === null || vb === null || va === vb) return false;
    return side === "a" ? va > vb : vb > va;
  };

  return (
    <div className="mt-8 animate-fadeUp overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card/60">
          <tr>
            <th className="px-3 py-3 text-left font-medium text-muted">지표</th>
            <th className="px-3 py-3 text-center font-bold">{a.stats.title}</th>
            <th className="px-3 py-3 text-center font-bold">{b.stats.title}</th>
          </tr>
          <tr className="text-xs text-muted">
            <th className="px-3 pb-2 text-left font-normal">
              {a.benchmark?.todayBestRank ? `오늘베스트 ${a.benchmark.todayBestRank}위 vs ` : ""}
            </th>
            <th className="px-3 pb-2 text-center font-normal">
              {a.stats.genre} · {a.stats.author}
              {a.benchmark?.todayBestRank ? ` · 베스트 ${a.benchmark.todayBestRank}위` : ""}
            </th>
            <th className="px-3 pb-2 text-center font-normal">
              {b.stats.genre} · {b.stats.author}
              {b.benchmark?.todayBestRank ? ` · 베스트 ${b.benchmark.todayBestRank}위` : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <td className="px-3 py-2.5 text-muted">{r.label}</td>
              <td className={`px-3 py-2.5 text-center ${win(r.va, r.vb, "a") ? "font-extrabold text-emerald-300" : ""}`}>
                {fmt(r.va, r.label === "연독률(보정)" ? "%" : "")}
                {win(r.va, r.vb, "a") && " ▲"}
              </td>
              <td className={`px-3 py-2.5 text-center ${win(r.va, r.vb, "b") ? "font-extrabold text-emerald-300" : ""}`}>
                {fmt(r.vb, r.label === "연독률(보정)" ? "%" : "")}
                {win(r.va, r.vb, "b") && " ▲"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
