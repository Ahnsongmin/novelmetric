"use client";

import { useEffect, useState } from "react";

type Stats = {
  novelId: number;
  platform?: "munpia" | "novelpia";
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
type Episode = { no: number; title: string; date: string; views: number | null };
type Dropoff = { no: number; title: string; dropPct: number; from: number; to: number };
type Retention = {
  episodes: Episode[];
  firstViews: number | null;
  latestViews: number | null;
  cumulativeRate: number | null;
  adjustedRate: number | null;
  grade: string;
  dropoffs: Dropoff[];
};
type Benchmark = {
  genre: string;
  sampleSize: number;
  avgViews: number;
  avgRecommends: number;
  myViews: number | null;
  myRecommends: number | null;
  viewsRatio: number | null;
  recommendsRatio: number | null;
  todayBestRank: number | null;
};
type Cadence = {
  totalEpisodes: number;
  avgGapDays: number | null;
  perWeek: number | null;
  recent30: number;
  daysSinceLast: number | null;
  lastDate: string | null;
  regularity: "규칙적" | "다소 불규칙" | "불규칙" | null;
  onHiatus: boolean;
  note: string;
};
type Resp = {
  stats: Stats;
  retention: Retention | null;
  cadence: Cadence | null;
  benchmark: Benchmark | null;
  history: Snapshot[];
  dbEnabled: boolean;
};

type SearchHit = {
  novelId: number;
  platform?: "munpia" | "novelpia";
  title: string;
  author: string;
  genre: string;
  cover: string | null;
};

const NOVELPIA_ID_BASE = 1_000_000_000;
const PLATFORM_LABEL = { munpia: "문피아", novelpia: "노벨피아" } as const;

function displayId(id: number) {
  return id >= NOVELPIA_ID_BASE ? id - NOVELPIA_ID_BASE : id;
}

// 투베 진입 적기 벤치마크 (작가 통념: 선작 200)
const SUNJAK_BENCHMARK = 200;

export default function DashboardPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [channel, setChannel] = useState<"none" | "email" | "kakao">("none");
  const [contact, setContact] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [recents, setRecents] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem("nm_recents") || "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  function pushRecent(id: number, title: string) {
    setRecents((prev) => {
      const next = [{ id, title }, ...prev.filter((x) => x.id !== id)].slice(0, 8);
      try {
        localStorage.setItem("nm_recents", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function analyzeById(idOrUrl: string) {
    setError("");
    setData(null);
    setHits(null);
    setTracked(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/novel?q=${encodeURIComponent(idOrUrl)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "조회 실패");
      setData(json);
      pushRecent(json.stats.novelId, json.stats.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    // ID(숫자) 또는 문피아·노벨피아 URL이면 바로 분석, 아니면 제목 검색
    if (/^\d+$/.test(term) || /munpia\.com\/.*\d+/.test(term) || /novelpia\.com\/novel\/\d+/.test(term)) {
      analyzeById(term);
      return;
    }
    setError("");
    setData(null);
    setTracked(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "검색 실패");
      setHits(json.hits);
      if (!json.hits.length) setError("검색 결과가 없어요. 제목을 다시 확인해 주세요.");
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
      let passCode: string | undefined;
      try {
        passCode = (JSON.parse(localStorage.getItem("nm_pass") ?? "null") as { code?: string } | null)?.code;
      } catch {}
      const res = await fetch("/api/novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: String(data.stats.novelId), channel, contact, passCode }),
      });
      const json = await res.json();
      if (res.status === 402) {
        setError(`${json.message || "무료 추적 한도에 도달했어요."} → 메뉴의 Pro 패스에서 업그레이드`);
        return;
      }
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
        <b className="text-foreground">작품 제목</b>으로 검색하거나 문피아·노벨피아 URL을 넣으면, 연독률·선작·조회수를
        자동 계산하고 투베 진입 게이지·추이를 보여줍니다.
      </p>

      <form onSubmit={lookup} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="작품 제목 검색  또는  문피아·노벨피아 URL"
          aria-label="작품 제목 검색 또는 문피아·노벨피아 URL·작품 ID"
          className="flex-1 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "…" : "검색 / 조회"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-accent-2">
          {error}
        </p>
      )}

      {!data && !hits && !loading && (
        <button
          onClick={() => analyzeById("555698")}
          className="mt-3 text-sm text-accent underline-offset-2 hover:underline"
        >
          ✨ 작품 ID가 없다면? 예시 작품으로 바로 체험해보기 →
        </button>
      )}

      {recents.length > 0 && !data && !hits && !loading && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs text-muted">최근 분석한 작품</p>
          <div className="flex flex-wrap gap-2">
            {recents.map((r) => (
              <button
                key={r.id}
                onClick={() => analyzeById(String(r.id))}
                className="max-w-[14rem] truncate rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
                title={r.title}
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !hits && <ResultSkeleton />}

      {hits && hits.length > 0 && !data && (
        <div className="mt-4 animate-fadeUp">
          <p className="mb-2 text-sm text-muted">검색 결과 — 분석할 작품을 고르세요</p>
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={h.novelId}>
                <button
                  onClick={() => analyzeById(String(h.novelId))}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/40 p-2.5 text-left transition hover:border-accent"
                >
                  {h.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.cover.startsWith("http") ? h.cover : `https:${h.cover}`} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{h.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {h.platform && (
                        <span className="mr-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                          {PLATFORM_LABEL[h.platform]}
                        </span>
                      )}
                      {h.genre} · {h.author}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="mt-8 animate-fadeUp space-y-6">
          <div>
            <p className="text-xs text-muted">
              {data.stats.genre} · {data.stats.author}
            </p>
            <h2 className="text-xl font-bold">{data.stats.title}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {data.stats.platform ? `${PLATFORM_LABEL[data.stats.platform]} · ` : ""}
              최근 연재일 {data.stats.lastUpdatedAt ?? "-"} · 작품ID {displayId(data.stats.novelId)}
            </p>
          </div>

          <CopySummary data={data} />

          <Prescription data={data} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="연재 화수" value={data.stats.episodes} unit="화" />
            <Metric label="조회수" value={data.stats.views} />
            <Metric label="추천수" value={data.stats.recommends} />
            <Metric label="선호작수" value={data.stats.favorites} highlight />
            <Metric label="글자수" value={data.stats.chars} />
          </div>

          {data.benchmark && <BenchmarkCard b={data.benchmark} />}

          {data.stats.platform !== "novelpia" && <SunjakBenchmark favorites={data.stats.favorites} />}

          {data.retention && <RetentionPanel r={data.retention} />}

          <ConversionCard favorites={data.stats.favorites} firstViews={data.retention?.firstViews ?? null} />

          {data.cadence && <CadencePanel c={data.cadence} />}

          <TubePrediction favorites={data.stats.favorites} history={data.history} />

          <TrendChart history={data.history} />

          <TrackBox
            tracked={tracked}
            tracking={tracking}
            channel={channel}
            setChannel={setChannel}
            contact={contact}
            setContact={setContact}
            onTrack={track}
            dbEnabled={data.dbEnabled}
          />
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

function CopySummary({ data }: { data: Resp }) {
  const [copied, setCopied] = useState(false);
  const s = data.stats;
  const ret = data.retention?.adjustedRate;
  const rank = data.benchmark?.todayBestRank;
  const text =
    `📊 "${s.title}" 지표 (노블메트릭)\n` +
    (ret != null ? `연독률 ${ret}% · ` : "") +
    `선작 ${(s.favorites ?? 0).toLocaleString("ko-KR")} · 조회 ${(s.views ?? 0).toLocaleString("ko-KR")} · 추천 ${(s.recommends ?? 0).toLocaleString("ko-KR")}\n` +
    (rank ? `오늘 베스트 ${rank}위\n` : "") +
    `분석 👉 https://novelmetric.vercel.app/dashboard`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      onClick={copy}
      className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
    >
      {copied ? "✓ 복사됨" : "📋 지표 요약 복사"}
    </button>
  );
}

function ResultSkeleton() {
  return (
    <div className="mt-8 animate-pulse space-y-4">
      <div className="h-6 w-2/3 rounded bg-border/50" />
      <div className="h-12 w-full rounded-xl bg-border/40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-border/40" />
        ))}
      </div>
      <div className="h-24 w-full rounded-xl bg-border/30" />
      <div className="h-40 w-full rounded-xl bg-border/30" />
    </div>
  );
}

function Prescription({ data }: { data: Resp }) {
  const ret = data.retention?.adjustedRate ?? null;
  const vr = data.benchmark?.viewsRatio ?? null;
  const fav = data.stats.favorites ?? 0;
  const hasDrop = (data.retention?.dropoffs?.length ?? 0) > 0;

  let text: string;
  let tone: "good" | "warn" | "info" = "info";

  if (ret !== null && ret < 45) {
    tone = "warn";
    text = hasDrop
      ? `연독률이 낮습니다(${ret}%). 이탈 구간(${data.retention!.dropoffs[0].no}화)의 전개·끊은 지점을 먼저 손보세요.`
      : `연독률이 낮습니다(${ret}%). 초반 회차 몰입도와 연참 주기를 점검해 보세요.`;
  } else if (vr !== null && vr < 0.8 && ret !== null && ret >= 55) {
    tone = "info";
    text = `연독률(${ret}%)은 괜찮은데 유입이 약해요(베스트 평균의 ${Math.round(vr * 100)}%). 제목 클릭률부터 점검하세요 → 무료 진단.`;
  } else if (fav >= 150 && fav < SUNJAK_BENCHMARK) {
    tone = "good";
    text = `선작 ${fav.toLocaleString("ko-KR")} — 투베 적기(200)에 근접! 지금이 홍보·연참 집중 타이밍입니다.`;
  } else if (ret !== null && ret >= 60 && (vr === null || vr >= 1)) {
    tone = "good";
    text = `지표가 건강합니다(연독률 ${ret}%). 연참 유지하면서 투베 진입을 노려보세요.`;
  } else {
    text = `꾸준히 추적하며 연독률·선작 추세를 지켜보세요. 제목 클릭률 점검도 추천합니다.`;
  }

  const c =
    tone === "good"
      ? "border-emerald-400/40 bg-emerald-400/10"
      : tone === "warn"
        ? "border-accent-2/40 bg-accent-2/10"
        : "border-accent/40 bg-accent/10";
  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <p className="text-sm">
        <b>💡 한 줄 처방 </b>
        {text}{" "}
        {(vr !== null && vr < 0.8) || (ret !== null && ret < 45) ? (
          <a href="/#top" className="font-bold text-accent underline">
            무료 제목 진단 →
          </a>
        ) : null}
      </p>
    </div>
  );
}

function TrackBox({
  tracked,
  tracking,
  channel,
  setChannel,
  contact,
  setContact,
  onTrack,
  dbEnabled,
}: {
  tracked: boolean;
  tracking: boolean;
  channel: "none" | "email" | "kakao";
  setChannel: (c: "none" | "email" | "kakao") => void;
  contact: string;
  setContact: (s: string) => void;
  onTrack: () => void;
  dbEnabled: boolean;
}) {
  if (tracked) {
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm">
        ✅ 추적 등록 완료! 매일 자동 수집되고, 연독률·선작이 급변하면{" "}
        {channel === "email" ? "이메일로" : channel === "kakao" ? "카카오톡으로" : "(알림 미설정)"} 알려드릴게요.
      </div>
    );
  }
  const opts: { key: "none" | "email" | "kakao"; label: string }[] = [
    { key: "none", label: "알림 안 받음" },
    { key: "email", label: "📧 이메일" },
    { key: "kakao", label: "💬 카카오톡" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="text-sm font-bold">📈 이 작품 매일 추적 + 변화 알림</p>
      <p className="mt-0.5 text-xs text-muted">
        연독률·선작·조회수를 매일 자동 수집하고, 급변(투베 적기·선작 급증 등) 시 알려드립니다. 알림 방식을 고르세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => setChannel(o.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              channel === o.key
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {channel !== "none" && (
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === "email" ? "이메일 주소" : "휴대폰 번호 (010...)"}
          className="mt-3 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      )}
      <button
        onClick={onTrack}
        disabled={tracking || (channel !== "none" && !contact.trim())}
        className="mt-3 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {tracking ? "등록 중…" : "추적 시작하기"}
      </button>
      {!dbEnabled && (
        <p className="mt-2 text-xs text-muted">* 추이·알림은 DB 연결 시 작동합니다.</p>
      )}
    </div>
  );
}

function BenchmarkCard({ b }: { b: Benchmark }) {
  const ratioText = (r: number | null) =>
    r === null ? "-" : r >= 1 ? `${r}배 높음` : `${Math.round(r * 100)}% 수준`;
  const ratioColor = (r: number | null) =>
    r === null ? "#8ca0bd" : r >= 1.2 ? "#34d399" : r >= 0.8 ? "#5b9bfd" : "#fbbf24";
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">🏁 경쟁 위치 — 오늘 {b.genre} 베스트 대비</p>
        {b.todayBestRank ? (
          <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
            오늘 베스트 {b.todayBestRank}위 진입 중
          </span>
        ) : (
          <span className="text-xs text-muted">표본 {b.sampleSize}작</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted">조회수</p>
          <p className="mt-0.5 text-lg font-extrabold" style={{ color: ratioColor(b.viewsRatio) }}>
            {ratioText(b.viewsRatio)}
          </p>
          <p className="text-[11px] text-muted">베스트 평균 {b.avgViews.toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted">추천수</p>
          <p className="mt-0.5 text-lg font-extrabold" style={{ color: ratioColor(b.recommendsRatio) }}>
            {ratioText(b.recommendsRatio)}
          </p>
          <p className="text-[11px] text-muted">베스트 평균 {b.avgRecommends.toLocaleString("ko-KR")}</p>
        </div>
      </div>
    </div>
  );
}

function SunjakBenchmark({ favorites }: { favorites: number | null }) {
  if (favorites === null) return null;
  const pct = Math.min(Math.round((favorites / SUNJAK_BENCHMARK) * 100), 100);
  const reached = favorites >= SUNJAK_BENCHMARK;
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">⭐ 투베 진입 게이지 (선작 기준)</p>
        <p className="text-xs text-muted">
          선작 {favorites.toLocaleString("ko-KR")} / 적기 {SUNJAK_BENCHMARK}
        </p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-background">
        <div
          className={`h-full rounded-full ${reached ? "bg-emerald-400" : "bg-gradient-to-r from-accent to-accent-2"}`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {reached
          ? "✅ 선작 200 돌파 — 작가 통념상 투데이베스트를 노려볼 적기입니다."
          : `투베 진입 적기(선작 200)까지 ${(SUNJAK_BENCHMARK - favorites).toLocaleString("ko-KR")} 남음.`}
      </p>
    </div>
  );
}

function RetentionPanel({ r }: { r: Retention }) {
  const rate = r.adjustedRate ?? r.cumulativeRate;
  const color =
    rate === null ? "#8ca0bd" : rate >= 70 ? "#34d399" : rate >= 60 ? "#5b9bfd" : rate >= 45 ? "#fbbf24" : "#2dd4bf";
  const eps = r.episodes.filter((e): e is Episode & { views: number } => e.views !== null);

  // 회차별 조회수 라인
  const W = 720, H = 160, P = 26;
  let path = "";
  if (eps.length >= 2) {
    const vals = eps.map((e) => e.views);
    const min = Math.min(...vals), max = Math.max(...vals);
    const x = (i: number) => P + (i / (eps.length - 1)) * (W - 2 * P);
    const y = (v: number) => H - P - ((v - min) / Math.max(max - min, 1)) * (H - 2 * P);
    path = eps.map((e, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(e.views)}`).join(" ");
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-muted">연독률 (보정)</p>
          <p className="text-4xl font-extrabold leading-none" style={{ color }}>
            {rate === null ? "-" : `${rate}%`}
          </p>
          <p className="mt-1 text-xs font-bold" style={{ color }}>
            {r.grade}
          </p>
        </div>
        <div className="flex-1 text-sm text-muted">
          <p>
            <b className="text-foreground">연독률</b>은 작가들이 가장 중요하게 보는 지표예요. 3화 대비 최신화의
            조회수 유지율(앞 2화·최신 3화 제외)입니다.
          </p>
          <p className="mt-1">
            기준: <span className="text-foreground">60~70%+ 양호</span> · 1화 {r.firstViews?.toLocaleString("ko-KR")} →
            최신 {r.latestViews?.toLocaleString("ko-KR")} (누적 {r.cumulativeRate ?? "-"}%)
          </p>
        </div>
      </div>
      {path && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted">회차별 조회수 (1화 → 최신)</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <path d={path} fill="none" stroke={color} strokeWidth="2" />
          </svg>
        </div>
      )}
      {r.dropoffs.length > 0 && (
        <div className="mt-3 rounded-lg border border-accent-2/40 bg-accent-2/10 p-3">
          <p className="text-xs font-bold">🚪 독자 이탈 의심 구간</p>
          <ul className="mt-1.5 space-y-1">
            {r.dropoffs.map((d) => (
              <li key={d.no} className="text-xs text-muted">
                <b className="text-foreground">{d.no}화</b>에서 직전 대비{" "}
                <b className="text-accent-2">-{d.dropPct}%</b> 급락 ({d.from.toLocaleString("ko-KR")} →{" "}
                {d.to.toLocaleString("ko-KR")})
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">이 회차의 전개·끊은 지점을 점검해 보세요.</p>
        </div>
      )}
    </div>
  );
}

function ConversionCard({ favorites, firstViews }: { favorites: number | null; firstViews: number | null }) {
  if (!favorites || !firstViews) return null;
  const rate = Math.round((favorites / firstViews) * 1000) / 10; // 1화 유입 대비 선작률(%)
  // 웹소설 통념: 1화 조회 대비 선작 10%+면 우수, 5~10% 양호, 5%↓ 후킹 점검
  const tone = rate >= 10 ? "good" : rate >= 5 ? "info" : "warn";
  const color = tone === "good" ? "#34d399" : tone === "info" ? "#5b9bfd" : "#fbbf24";
  const msg =
    rate >= 10
      ? "1화를 본 독자가 선작으로 잘 이어집니다. 후킹이 먹히고 있어요."
      : rate >= 5
        ? "선작 전환은 무난합니다. 1화 결말의 '다음 화 궁금증'을 더 세게 하면 올라가요."
        : "1화는 봤는데 선작까지 안 갑니다. 1화 후반부 후킹·연참 예고를 점검하세요.";
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">🎯 선작 전환율 (1화 조회 대비)</p>
        <p className="text-2xl font-extrabold" style={{ color }}>
          {rate}%
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        1화 조회 {firstViews.toLocaleString("ko-KR")} 중 선작 {favorites.toLocaleString("ko-KR")} — {msg}
      </p>
    </div>
  );
}

function CadencePanel({ c }: { c: Cadence }) {
  const badge =
    c.onHiatus
      ? { t: "휴재 의심", cls: "bg-accent-2/20 text-accent-2" }
      : c.regularity === "규칙적"
        ? { t: "규칙적", cls: "bg-emerald-400/20 text-emerald-300" }
        : { t: c.regularity ?? "-", cls: "bg-amber-400/20 text-amber-300" };
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">🗓️ 연참 리듬 (업로드 주기)</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>{badge.t}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="평균 연참 간격" value={c.avgGapDays} unit="일" />
        <Metric label="주당 연재" value={c.perWeek} unit="화" />
        <Metric label="최근 30일 연재" value={c.recent30} unit="화" />
      </div>
      <p className="mt-3 text-xs text-muted">
        {c.lastDate && (
          <>
            마지막 연재 {c.lastDate}
            {c.daysSinceLast != null && ` (${c.daysSinceLast}일 전)`} ·{" "}
          </>
        )}
        {c.note}
      </p>
    </div>
  );
}

function TubePrediction({ favorites, history }: { favorites: number | null; history: Snapshot[] }) {
  if (favorites == null) return null;
  if (favorites >= SUNJAK_BENCHMARK) return null; // 이미 달성 → 게이지에서 안내

  // 추이 데이터로 하루 선작 증가 속도 추정 → 200까지 남은 일수
  const pts = history.filter((h): h is Snapshot & { favorites: number } => h.favorites != null);
  const remain = SUNJAK_BENCHMARK - favorites;
  let body: React.ReactNode;
  if (pts.length >= 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    const days = Math.max(
      1,
      (new Date(last.collected_at).getTime() - new Date(first.collected_at).getTime()) / 86_400_000,
    );
    const perDay = (last.favorites - first.favorites) / days;
    if (perDay > 0.5) {
      const eta = Math.ceil(remain / perDay);
      body = (
        <>
          최근 하루 <b className="text-foreground">+{Math.round(perDay)}</b> 선작 속도면, 투베 적기(선작 200)까지{" "}
          <b className="text-accent">약 {eta}일</b> 남았어요.
        </>
      );
    } else {
      body = <>최근 선작 증가가 거의 없어요. 유입(제목·홍보)을 늘려야 투베 진입 속도가 붙습니다.</>;
    }
  } else {
    body = (
      <>
        투베 <b className="text-foreground">예상 도달일</b>은 추적 데이터가 2일 이상 쌓이면 계산돼요. 아래{" "}
        <b className="text-accent">매일 추적</b>을 켜두면 자동으로 예측해 드릴게요.
      </>
    );
  }
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
      <p className="text-sm">
        <b>🚀 투베 도달 예상 </b>
        {body}
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
