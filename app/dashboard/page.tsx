"use client";

import { useEffect, useState } from "react";

type Stats = {
  novelId: number;
  platform?: "munpia" | "novelpia" | "naverseries" | "kakaopage";
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
type Episode = { no: number; title: string; date: string; views: number | null; paid?: boolean };
type Dropoff = { no: number; title: string; dropPct: number; from: number; to: number };
type Retention = {
  episodes: Episode[];
  firstViews: number | null;
  latestViews: number | null;
  cumulativeRate: number | null;
  adjustedRate: number | null;
  grade: string;
  dropoffs: Dropoff[];
  paidStartNo: number | null;
  freeRate: number | null;
  paidRate: number | null;
  paidPassRate: number | null;
};
type Benchmark = {
  genre: string;
  sampleSize: number;
  avgViews: number;
  avgRecommends: number;
  avgViewsPerEp: number | null;
  myViews: number | null;
  myRecommends: number | null;
  myViewsPerEp: number | null;
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
type GenreBench = {
  sampleSize: number;
  median: number;
  rank: number;
  scope: "genre" | "platform";
};
type Resp = {
  stats: Stats;
  retention: Retention | null;
  cadence: Cadence | null;
  benchmark: Benchmark | null;
  genreBench: GenreBench | null;
  history: Snapshot[];
  dbEnabled: boolean;
};

type SearchHit = {
  novelId: number;
  platform?: "munpia" | "novelpia" | "naverseries" | "kakaopage";
  title: string;
  author: string;
  genre: string;
  cover: string | null;
};

const NOVELPIA_ID_BASE = 1_000_000_000;
const SERIES_ID_BASE = 2_000_000_000;
const KAKAO_ID_BASE = 3_000_000_000;
const PLATFORM_LABEL = {
  munpia: "문피아",
  novelpia: "노벨피아",
  naverseries: "네이버시리즈",
  kakaopage: "카카오페이지",
} as const;

function displayId(id: number) {
  if (id >= KAKAO_ID_BASE) return id - KAKAO_ID_BASE;
  if (id >= SERIES_ID_BASE) return id - SERIES_ID_BASE;
  if (id >= NOVELPIA_ID_BASE) return id - NOVELPIA_ID_BASE;
  return id;
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
  const [channel, setChannel] = useState<"none" | "email" | "kakao">("email");
  const [contact, setContact] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [recents, setRecents] = useState<{ id: number; title: string }[]>([]);

  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem("nm_recents") || "[]"));
    } catch {
      /* ignore */
    }
    // Pro 패스 유효 여부 (게이트 꺼짐 = 전부 무료 = Pro 취급)
    try {
      const code = (JSON.parse(localStorage.getItem("nm_pass") ?? "null") as { code?: string } | null)?.code;
      fetch(`/api/gate${code ? `?code=${encodeURIComponent(code)}` : ""}`)
        .then((r) => r.json())
        .then((g: { enabled: boolean; passValidUntil: string | null }) =>
          setIsPro(!g.enabled || Boolean(g.passValidUntil)),
        )
        .catch(() => {});
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
    // ID(숫자) 또는 플랫폼 URL이면 바로 분석, 아니면 제목 검색 (제목 검색은 문피아·노벨피아만)
    if (
      /^\d+$/.test(term) ||
      /munpia\.com\/.*\d+/.test(term) ||
      /novelpia\.com\/novel\/\d+/.test(term) ||
      /series\.naver\.com\/.*productNo=\d+/.test(term) ||
      /page\.kakao\.com\/(?:content|home\/[^/]+)\/\d+/.test(term)
    ) {
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
        <b className="text-foreground">작품 제목</b>으로 검색하거나 문피아·노벨피아·네이버시리즈·카카오페이지 URL을
        넣으면, 연독률·선작·조회수를 자동 계산하고 투베 진입 게이지·추이를 보여줍니다. (연독률은 문피아·노벨피아 지원)
      </p>

      <form onSubmit={lookup} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="작품 제목 검색  또는  문피아·노벨피아·시리즈·카카페 URL"
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
      <p className="mt-2 text-xs text-muted">
        제목 검색: 문피아 · 노벨피아 · 카카오페이지 —{" "}
        <b className="text-foreground">네이버시리즈는 제목 검색이 안 돼요.</b> 작품 페이지 URL
        (series.naver.com/novel/detail.series?productNo=…)을 복사해 붙여넣어 주세요.
      </p>
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

          <div className="flex flex-wrap gap-2">
            <CopySummary data={data} />
            <CsvExport data={data} />
          </div>

          <Prescription data={data} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="연재 화수" value={data.stats.episodes} unit="화" />
            <Metric
              label={data.stats.platform === "naverseries" ? "다운로드 수" : "조회수"}
              value={data.stats.views}
            />
            <Metric label="추천수" value={data.stats.recommends} />
            <Metric label="선호작수" value={data.stats.favorites} highlight />
            <Metric label="글자수" value={data.stats.chars} />
          </div>

          {data.benchmark && <BenchmarkCard b={data.benchmark} />}

          {data.stats.platform !== "novelpia" && <SunjakBenchmark favorites={data.stats.favorites} />}

          {data.stats.platform !== "novelpia" && <MilestoneCard favorites={data.stats.favorites} />}

          {data.retention && <RetentionPanel r={data.retention} />}

          {data.genreBench && data.retention?.adjustedRate != null && (
            <GenreBenchCard
              gb={data.genreBench}
              myRate={data.retention.adjustedRate}
              genre={data.stats.genre}
              platform={data.stats.platform ?? "munpia"}
              isPro={isPro}
            />
          )}

          {!data.retention &&
            (data.stats.platform === "naverseries" || data.stats.platform === "kakaopage") && (
              <PlatformLimitNotice platform={data.stats.platform} />
            )}

          <ConversionCard favorites={data.stats.favorites} firstViews={data.retention?.firstViews ?? null} />

          {data.cadence && <CadencePanel c={data.cadence} />}

          <TubePrediction favorites={data.stats.favorites} history={data.history} />

          <TrendChart history={data.history} />

          <ProTrendPanel
            history={data.history}
            platform={data.stats.platform}
            favorites={data.stats.favorites}
            isPro={isPro}
          />

          <TrackBox
            tracked={tracked}
            tracking={tracking}
            channel={channel}
            setChannel={setChannel}
            contact={contact}
            setContact={setContact}
            onTrack={track}
            dbEnabled={data.dbEnabled}
            novelId={data.stats.novelId}
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

  if (data.stats.platform === "naverseries" || data.stats.platform === "kakaopage") {
    text = `이 플랫폼은 회차별 데이터가 비공개라 일일 추적 추이가 핵심 지표예요. 아래에서 매일 추적을 켜 두면 성장 속도를 보여드립니다.`;
  } else if (ret !== null && ret < 50) {
    tone = "warn";
    text = hasDrop
      ? `연독률이 낮습니다(${ret}%). 이탈 구간(${data.retention!.dropoffs[0].no}화)의 전개·끊은 지점을 먼저 손보세요.`
      : `연독률이 낮습니다(${ret}%). 초반 회차 몰입도와 연참 주기를 점검해 보세요.`;
  } else if (vr !== null && vr < 0.8 && ret !== null && ret >= 60) {
    tone = "info";
    text = `연독률(${ret}%)은 괜찮은데 유입이 약해요(투베 누적 평균의 ${Math.round(vr * 100)}%). 제목 클릭률부터 점검하세요 → 무료 진단.`;
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
        {(vr !== null && vr < 0.8) || (ret !== null && ret < 50) ? (
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
  novelId,
}: {
  tracked: boolean;
  tracking: boolean;
  channel: "none" | "email" | "kakao";
  setChannel: (c: "none" | "email" | "kakao") => void;
  contact: string;
  setContact: (s: string) => void;
  onTrack: () => void;
  dbEnabled: boolean;
  novelId: number;
}) {
  if (tracked) {
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm">
        <p>
          ✅ 추적 등록 완료! 매일 자동 수집되고, 선작 이정표 돌파·급증 같은 변화가 있으면{" "}
          {channel === "email" ? "이메일로 알려드릴게요." : "대시보드에서 확인할 수 있어요."}
        </p>
        <p className="mt-1.5 text-xs text-muted">
          📅 다음 수집은 매일 새벽 3시 — 내일 이 작품을 다시 검색하면 첫 변화 추이가 보입니다.
        </p>
        {channel !== "email" && <EmailNudge novelId={novelId} />}
      </div>
    );
  }
  // 카카오 알림톡은 발송 인프라(사전 승인 템플릿)가 아직 없어 선택지에서 제외 — 준비되면 복구
  const opts: { key: "none" | "email" | "kakao"; label: string; disabled?: boolean }[] = [
    { key: "email", label: "📧 이메일" },
    { key: "kakao", label: "💬 카카오톡 (준비 중)", disabled: true },
    { key: "none", label: "알림 안 받음" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="text-sm font-bold">📈 이 작품 매일 추적 + 변화 알림</p>
      <p className="mt-0.5 text-xs text-muted">
        연독률·선작·조회수를 매일 자동 수집하고, 변화가 있는 날(선작 50·100·200 돌파, 급증·급감)에만 알려드립니다.
        매일 접속하지 않아도 이메일로 받아보세요. (스팸·광고 없음)
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => !o.disabled && setChannel(o.key)}
            disabled={o.disabled}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              o.disabled
                ? "cursor-not-allowed border-border text-muted opacity-50"
                : channel === o.key
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {channel !== "none" ? (
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === "email" ? "이메일 주소" : "휴대폰 번호 (010...)"}
          className="mt-3 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      ) : (
        <p className="mt-2 text-xs text-muted">* 이메일을 남기면 변화가 있는 날에만 알려드려요. 스팸·광고는 없습니다.</p>
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

// 알림 없이 추적 등록한 유저에게 이메일을 부드럽게 권유 — 등록 시 같은 작품에 이메일 알림을 추가
function EmailNudge({ novelId }: { novelId: number }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  if (state === "done") {
    return <p className="mt-2 text-xs text-emerald-300">📧 이메일 알림이 등록되었어요. 변화가 있는 날에만 보내드립니다.</p>;
  }
  async function save() {
    if (!email.trim()) return;
    setState("saving");
    try {
      let passCode: string | undefined;
      try {
        passCode = (JSON.parse(localStorage.getItem("nm_pass") ?? "null") as { code?: string } | null)?.code;
      } catch {}
      const res = await fetch("/api/novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: String(novelId), channel: "email", contact: email.trim(), passCode }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="mt-2.5 border-t border-emerald-400/20 pt-2.5">
      <p className="text-xs text-muted">
        이메일을 남기면 매일 접속하지 않아도 선작 이정표 돌파·급증 같은 변화가 있는 날 알려드려요. (스팸·광고 없음)
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소 (선택)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-accent"
        />
        <button
          onClick={save}
          disabled={state === "saving" || !email.trim()}
          className="shrink-0 rounded-lg border border-emerald-400/40 px-3 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-50"
        >
          {state === "saving" ? "등록 중…" : "알림 받기"}
        </button>
      </div>
      {state === "error" && <p className="mt-1.5 text-xs text-amber-300">등록에 실패했어요. 잠시 후 다시 시도해 주세요.</p>}
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
          <p className="text-xs text-muted">누적 조회수</p>
          <p className="mt-0.5 text-lg font-extrabold" style={{ color: ratioColor(b.viewsRatio) }}>
            {ratioText(b.viewsRatio)}
          </p>
          <p className="text-[11px] text-muted">
            투베 평균(누적) {b.avgViews.toLocaleString("ko-KR")}
            {b.avgViewsPerEp !== null && ` · 화당 ~${b.avgViewsPerEp.toLocaleString("ko-KR")}`}
          </p>
          {b.myViewsPerEp !== null && (
            <p className="text-[11px] text-muted">내 화당 평균 {b.myViewsPerEp.toLocaleString("ko-KR")}</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted">누적 추천수</p>
          <p className="mt-0.5 text-lg font-extrabold" style={{ color: ratioColor(b.recommendsRatio) }}>
            {ratioText(b.recommendsRatio)}
          </p>
          <p className="text-[11px] text-muted">투베 평균(누적) {b.avgRecommends.toLocaleString("ko-KR")}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        * 투베 상위 {b.sampleSize}작의 <b>작품 누적 총조회수</b> 기준입니다 (화당 조회수 아님). 화당 평균 = 누적조회 ÷ 연재화수.
      </p>
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
          ? "✅ 선작 200 돌파 — 작가 커뮤니티에서 투데이베스트를 노려볼 적기로 통하는 구간입니다."
          : `투베 도전 적기(선작 200, 커뮤니티 통설)까지 ${(SUNJAK_BENCHMARK - favorites).toLocaleString("ko-KR")} 남음.`}
      </p>
    </div>
  );
}

// 유료화·컨택 이정표 — 작가 커뮤니티·자료 사이트에서 통용되는 비공식 참고치.
// 점수·판정·권고를 만들지 않는다: 통설 수치와 내 위치를 나란히 보여주는 것까지가 진실의 선.
const MILESTONES = [
  { label: "투베 도전 적기", threshold: 200, desc: "이 무렵부터 투데이베스트를 노려볼 만하다고 통용" },
  { label: "나홀로 유료화 통용선", threshold: 1000, desc: "출판사 없이 유료 전환을 고려하는 구간으로 통용" },
  { label: "유료화 신청 통과 통용선", threshold: 3000, desc: "문피아 유료화 신청이 승인되는 수준으로 통용" },
];

function MilestoneCard({ favorites }: { favorites: number | null }) {
  if (favorites === null) return null;
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="text-sm font-bold">💼 유료화·컨택 이정표 (커뮤니티 통설 대비 내 위치)</p>
      <div className="mt-3 space-y-3">
        {MILESTONES.map((m) => {
          const pct = Math.min(Math.round((favorites / m.threshold) * 100), 100);
          const reached = favorites >= m.threshold;
          return (
            <div key={m.label}>
              <div className="flex items-baseline justify-between text-xs">
                <p>
                  <b className="text-foreground">{m.label}</b>{" "}
                  <span className="text-muted">선작 {m.threshold.toLocaleString("ko-KR")}</span>
                </p>
                <p className={reached ? "font-bold text-emerald-300" : "text-muted"}>
                  {reached ? "✅ 도달" : `${pct}%`}
                </p>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${reached ? "bg-emerald-400" : "bg-gradient-to-r from-accent to-accent-2"}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{m.desc}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 rounded-lg border border-border bg-background/40 p-2.5 text-[11px] text-muted">
        ⚠️ 전부 <b className="text-foreground">공식 기준이 아닌</b> 작가 커뮤니티·자료 사이트(웹소설 연재 갤러리,
        탄마 등)에서 통용되는 참고치입니다. 장르·시기·작품에 따라 크게 달라지며, 실제 유료화·계약 판단의 근거가
        아니라 이정표 참고용으로만 봐주세요.
      </p>
    </div>
  );
}

function CsvExport({ data }: { data: Resp }) {
  const eps = data.retention?.episodes?.filter((e) => e.views !== null) ?? [];
  if (eps.length === 0 && data.history.length === 0) return null;

  function download() {
    const base = eps[3]?.views ?? null; // 연독률 기준(4화)
    const lines: string[] = [];
    if (eps.length > 0) {
      lines.push("회차,제목,연재일,조회수,연독률(4화 대비 %)");
      for (const e of eps) {
        const r = base && e.views ? Math.round((e.views / base) * 1000) / 10 : "";
        lines.push(`${e.no},"${e.title.replace(/"/g, '""')}",${e.date},${e.views},${r}`);
      }
    }
    if (data.history.length > 0) {
      if (lines.length) lines.push("");
      lines.push("추적일시,조회수,추천수,선호작수");
      for (const h of data.history) {
        lines.push(`${h.collected_at},${h.views ?? ""},${h.recommends ?? ""},${h.favorites ?? ""}`);
      }
    }
    // BOM을 붙여야 엑셀이 한글을 안 깨뜨린다
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `노블메트릭_${data.stats.title.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <button
      onClick={download}
      className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
    >
      ⬇️ CSV 내보내기 (엑셀용)
    </button>
  );
}

const PAID_COLOR = "#a78bfa"; // 유료 구간 표시색

function rateColor(v: number | null): string {
  return v === null ? "#8ca0bd" : v >= 80 ? "#34d399" : v >= 60 ? "#5b9bfd" : v >= 50 ? "#fbbf24" : "#f87171";
}

function RetentionPanel({ r }: { r: Retention }) {
  const rate = r.adjustedRate ?? r.cumulativeRate;
  const color = rateColor(rate);
  const eps = r.episodes.filter((e): e is Episode & { views: number } => e.views !== null);

  // 유료 전환 경계 (조회수 있는 회차 기준 인덱스)
  const paidIdx = r.paidStartNo != null ? eps.findIndex((e) => e.paid === true) : -1;
  const hasPaid = paidIdx > 0;

  // 회차별 조회수 라인 (유료 전환작은 무료/유료 구간을 색으로 분리)
  const W = 720, H = 160, P = 26;
  let path = "", paidPath = "";
  let boundaryX: number | null = null;
  if (eps.length >= 2) {
    const vals = eps.map((e) => e.views);
    const min = Math.min(...vals), max = Math.max(...vals);
    const x = (i: number) => P + (i / (eps.length - 1)) * (W - 2 * P);
    const y = (v: number) => H - P - ((v - min) / Math.max(max - min, 1)) * (H - 2 * P);
    const toPath = (arr: typeof eps, offset: number) =>
      arr.map((e, i) => `${i === 0 ? "M" : "L"} ${x(offset + i)} ${y(e.views)}`).join(" ");
    if (hasPaid) {
      path = toPath(eps.slice(0, paidIdx), 0);
      paidPath = toPath(eps.slice(paidIdx - 1), paidIdx - 1); // 경계 낙폭 구간부터 유료색
      boundaryX = x(paidIdx);
    } else {
      path = toPath(eps, 0);
    }
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
            <b className="text-foreground">연독률</b>은 작가들이 가장 중요하게 보는 지표예요.{" "}
            {r.adjustedRate != null ? (
              <>
                작가 커뮤니티 통용 방식대로 <b className="text-foreground">4화 조회수를 100%</b>로 놓고 최신화(갓
                올라온 최신 3개 회차 제외)의 유지율을 계산했습니다.
              </>
            ) : (
              <>아직 회차가 적어 보정 계산(4화 기준) 대신 1화 대비 누적 유지율을 표시합니다.</>
            )}
          </p>
          <p className="mt-1">
            해석 눈금(커뮤니티 통용, 비공식): <span className="text-foreground">80%+ 상위권 · 60% 무난 · 50% 방어 ·
            40% 미만 위기</span>
          </p>
          <p className="mt-1">
            1화 {r.firstViews?.toLocaleString("ko-KR")} → 최신 {r.latestViews?.toLocaleString("ko-KR")} (누적{" "}
            {r.cumulativeRate ?? "-"}%)
          </p>
        </div>
      </div>
      {hasPaid && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: `${PAID_COLOR}66`, background: `${PAID_COLOR}14` }}>
          <p className="text-xs font-bold" style={{ color: PAID_COLOR }}>
            💰 유료 전환 감지 — {r.paidStartNo}화부터 유료
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-muted">무료 구간 연독률</p>
              <p className="text-lg font-extrabold" style={{ color: rateColor(r.freeRate) }}>
                {r.freeRate === null ? "-" : `${r.freeRate}%`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">전환 통과율</p>
              <p className="text-lg font-extrabold" style={{ color: PAID_COLOR }}>
                {r.paidPassRate === null ? "-" : `${r.paidPassRate}%`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">유료 구간 연독률</p>
              <p className="text-lg font-extrabold" style={{ color: rateColor(r.paidRate) }}>
                {r.paidRate === null ? "-" : `${r.paidRate}%`}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            무료 구간은 4화 대비 마지막 무료화, 전환 통과율은 마지막 무료화 대비 유료 첫 화, 유료 구간은 유료 첫 화
            대비 최신화(최신 3화 제외) 기준입니다. 유료 전환 낙폭은 이탈 의심 구간에서 제외했어요.
          </p>
        </div>
      )}
      {path && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted">
            회차별 조회수 (1화 → 최신)
            {hasPaid && (
              <>
                {" · "}
                <span style={{ color }}>■ 무료</span> <span style={{ color: PAID_COLOR }}>■ 유료</span>
              </>
            )}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {boundaryX !== null && (
              <>
                <line x1={boundaryX} y1={6} x2={boundaryX} y2={H - 6} stroke={PAID_COLOR} strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
                <text
                  x={boundaryX + (boundaryX > W / 2 ? -6 : 6)}
                  y={14}
                  textAnchor={boundaryX > W / 2 ? "end" : "start"}
                  fontSize="11"
                  fill={PAID_COLOR}
                >
                  유료 전환 {r.paidStartNo}화
                </text>
              </>
            )}
            <path d={path} fill="none" stroke={color} strokeWidth="2" />
            {paidPath && <path d={paidPath} fill="none" stroke={PAID_COLOR} strokeWidth="2" />}
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

function PlatformLimitNotice({ platform }: { platform: "naverseries" | "kakaopage" }) {
  const label = PLATFORM_LABEL[platform];
  const viewsLabel = platform === "naverseries" ? "다운로드 수" : "누적 열람수";
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="text-sm font-bold">📉 {label}는 회차별 조회수를 공개하지 않아요</p>
      <p className="mt-1.5 text-sm text-muted">
        회차별 데이터가 없어 <b className="text-foreground">연독률·이탈 구간 분석은 제공되지 않습니다.</b> 대신
        아래에서 <b className="text-foreground">이 작품 매일 추적</b>을 켜면 {viewsLabel}를 매일 수집해{" "}
        <b className="text-foreground">하루하루 얼마나 읽히는지 추이</b>로 보여드려요. 문피아·노벨피아에 같은 작품을
        연재 중이라면 그쪽 URL로 조회하면 연독률까지 볼 수 있습니다.
      </p>
    </div>
  );
}

function ConversionCard({ favorites, firstViews }: { favorites: number | null; firstViews: number | null }) {
  if (!favorites || !firstViews) return null;
  const rate = Math.round((favorites / firstViews) * 1000) / 10; // 1화 유입 대비 선작률(%)
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">🎯 선작 전환율 (1화 조회 대비)</p>
        <p className="text-2xl font-extrabold text-accent">{rate}%</p>
      </div>
      <p className="mt-1 text-xs text-muted">
        1화 조회 {firstViews.toLocaleString("ko-KR")} 중 선작 {favorites.toLocaleString("ko-KR")}. 공인된 기준치가
        있는 지표는 아니에요 — 제목·소개글·1화를 수정한 <b className="text-foreground">전후 비교용</b>으로 쓰면 가장
        유용합니다. 수치가 오르면 후킹 개선이 먹힌 겁니다.
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
          최근 하루 <b className="text-foreground">+{Math.round(perDay)}</b> 선작 속도가 유지된다면, 투베 도전
          적기(선작 200, 커뮤니티 통설)까지 <b className="text-accent">약 {eta}일</b> — 최근 추세를 그대로 늘린 단순
          추정이에요.
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

// Pro 심화 추이 — 일별 증감·성장 속도·이정표 예상 (전부 실측 스냅샷 기반, 추정은 가정 명시)
// 장르 벤치마크(Pro) — 상위권 스캔 풀의 연독률 분포 대비 내 위치
function GenreBenchCard({
  gb,
  myRate,
  genre,
  platform,
  isPro,
}: {
  gb: GenreBench;
  myRate: number;
  genre: string;
  platform: keyof typeof PLATFORM_LABEL;
  isPro: boolean;
}) {
  const scopeLabel =
    gb.scope === "genre" ? `${PLATFORM_LABEL[platform]} ${genre} 상위권` : `${PLATFORM_LABEL[platform]} 상위권`;

  if (!isPro) {
    return (
      <div className="rounded-xl border border-accent/40 bg-card/40 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold">📊 장르 벤치마크</p>
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">Pro</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {scopeLabel} <b className="text-foreground">{gb.sampleSize}작품</b>의 연독률 분포가 준비돼 있어요. Pro
          패스를 적용하면 <b className="text-foreground">내 연독률이 상위권 몇 위 수준인지</b> 바로 볼 수 있어요.
        </p>
        <a
          href="/pro"
          className="mt-3 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-bold text-background transition hover:opacity-90"
        >
          Pro 패스 보기 →
        </a>
      </div>
    );
  }

  const above = myRate >= gb.median;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <p className="text-sm font-bold">📊 장르 벤치마크 — {scopeLabel}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-muted">상위권 중앙값</p>
          <p className="mt-1 text-xl font-bold">{gb.median}%</p>
        </div>
        <div>
          <p className="text-xs text-muted">내 연독률</p>
          <p className={`mt-1 text-xl font-bold ${above ? "text-emerald-300" : "text-amber-300"}`}>{myRate}%</p>
        </div>
        <div>
          <p className="text-xs text-muted">내 위치</p>
          <p className="mt-1 text-xl font-bold">
            {gb.sampleSize}작품 중 {gb.rank}위
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        최근 90일간 자동 스캔한 {scopeLabel} 작품의 보정 연독률 분포와 비교한 위치예요.
        {above ? " 상위권 기준으로도 독자를 잘 붙잡고 있어요." : " 중앙값과의 차이는 이탈 구간 점검부터 시작해 보세요."}
      </p>
    </div>
  );
}

function ProTrendPanel({
  history,
  platform,
  favorites,
  isPro,
}: {
  history: Snapshot[];
  platform?: "munpia" | "novelpia" | "naverseries" | "kakaopage";
  favorites: number | null;
  isPro: boolean;
}) {
  const pts = history.filter((h) => h.collected_at);
  if (pts.length < 3) return null; // 증감 표는 3일 이상 쌓여야 의미가 있다

  if (!isPro) {
    return (
      <div className="rounded-xl border border-accent/40 bg-card/40 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold">🔬 심화 추이 분석</p>
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">Pro</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          추적 데이터 {pts.length}일치가 쌓여 있어요. Pro 패스를 적용하면 <b className="text-foreground">일별
          증감표 · 하루 평균 성장 속도 · 이정표 도달 예상</b>을 볼 수 있고, 매주 월요일{" "}
          <b className="text-foreground">주간 성장 리포트</b>와 추적 작품끼리의{" "}
          <b className="text-foreground">경쟁작 워치 비교 메일</b>도 받아요.
        </p>
        <a
          href="/pro"
          className="mt-3 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-bold text-background transition hover:opacity-90"
        >
          Pro 패스 보기 →
        </a>
      </div>
    );
  }

  // 일별 증감 (최근 14구간)
  const rows: { date: string; dViews: number | null; dFav: number | null; dRec: number | null }[] = [];
  for (let i = Math.max(1, pts.length - 14); i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    rows.push({
      date: b.collected_at.slice(5, 10),
      dViews: a.views != null && b.views != null ? b.views - a.views : null,
      dFav: a.favorites != null && b.favorites != null ? b.favorites - a.favorites : null,
      dRec: a.recommends != null && b.recommends != null ? b.recommends - a.recommends : null,
    });
  }

  // 최근 7일 하루 평균 속도
  const last = pts[pts.length - 1];
  const weekAgoMs = new Date(last.collected_at).getTime() - 7 * 86_400_000;
  const weekPts = pts.filter((p) => new Date(p.collected_at).getTime() >= weekAgoMs);
  const first = weekPts[0] ?? pts[0];
  const spanDays = Math.max(
    1,
    (new Date(last.collected_at).getTime() - new Date(first.collected_at).getTime()) / 86_400_000,
  );
  const favPerDay =
    first.favorites != null && last.favorites != null ? (last.favorites - first.favorites) / spanDays : null;
  const viewsPerDay = first.views != null && last.views != null ? (last.views - first.views) / spanDays : null;

  // 다음 이정표 예상 (문피아 선작 통설 기준)
  let eta: { label: string; threshold: number; days: number } | null = null;
  if (platform !== "novelpia" && favorites != null && favPerDay != null && favPerDay > 0.5) {
    const next = MILESTONES.find((m) => favorites < m.threshold);
    if (next) eta = { label: next.label, threshold: next.threshold, days: Math.ceil((next.threshold - favorites) / favPerDay) };
  }

  const d = (n: number | null) =>
    n == null ? "-" : n >= 0 ? `+${n.toLocaleString("ko-KR")}` : n.toLocaleString("ko-KR");

  return (
    <div className="rounded-xl border border-accent/40 bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">🔬 심화 추이 분석</p>
        <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">Pro</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="최근 7일 하루 평균 선작" value={favPerDay == null ? null : Math.round(favPerDay * 10) / 10} />
        <Metric label="최근 7일 하루 평균 조회" value={viewsPerDay == null ? null : Math.round(viewsPerDay)} />
      </div>
      {eta && (
        <p className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs">
          🚩 <b>{eta.label}</b>(선작 {eta.threshold.toLocaleString("ko-KR")}, 커뮤니티 통설)까지 현재 속도 유지 시{" "}
          <b className="text-accent">약 {eta.days}일</b> — 최근 추세를 그대로 늘린 단순 추정입니다.
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-3 font-semibold">날짜</th>
              <th className="py-1.5 pr-3 font-semibold">Δ조회</th>
              <th className="py-1.5 pr-3 font-semibold">Δ선작</th>
              <th className="py-1.5 font-semibold">Δ추천</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1.5 pr-3 text-muted">{r.date}</td>
                <td className="py-1.5 pr-3">{d(r.dViews)}</td>
                <td className={`py-1.5 pr-3 ${(r.dFav ?? 0) < 0 ? "text-accent-2" : ""}`}>{d(r.dFav)}</td>
                <td className="py-1.5">{d(r.dRec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">매일 자동 수집된 실측 스냅샷 간 증감입니다.</p>
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
