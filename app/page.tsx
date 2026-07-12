"use client";

import { useState } from "react";

type DiagnoseResult = {
  score: number;
  grade: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  titleSuggestions: { title: string; reason: string }[];
  keywords: string[];
  engine: "claude" | "heuristic";
};

const GENRES = [
  "로맨스판타지",
  "현대판타지",
  "판타지",
  "무협",
  "로맨스",
  "미스터리/스릴러",
  "라이트노벨",
  "기타",
];

const EXAMPLES: { title: string; synopsis: string; genre: string }[] = [
  {
    title: "재벌집 막내아들로 회귀했다",
    synopsis: "망한 인생, 재벌가 막내로 회귀했다. 이번엔 다 가진다.",
    genre: "현대판타지",
  },
  {
    title: "악역 영애지만 살고 싶어",
    synopsis: "소설 속 처형당하는 악역에 빙의했다. 엔딩만은 바꾼다.",
    genre: "로맨스판타지",
  },
  {
    title: "천재 검사",
    synopsis: "",
    genre: "현대판타지",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <ValueProps />
        <Comparison />
        <Roadmap />
        <FAQ />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
        <a href="#top" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm text-background">
            N
          </span>
          노블메트릭
        </a>
        <nav className="flex items-center gap-1 text-sm">
          <a href="/best" className="hidden rounded-full px-3 py-1.5 text-muted transition hover:text-foreground sm:block">
            베스트 분석
          </a>
          <a href="/insights" className="hidden rounded-full px-3 py-1.5 text-muted transition hover:text-foreground sm:block">
            트렌드
          </a>
          <a href="/dashboard" className="rounded-full px-3 py-1.5 text-muted transition hover:text-foreground">
            대시보드
          </a>
          <a href="/pro" className="rounded-full px-3 py-1.5 font-semibold text-accent transition hover:text-foreground">
            Pro
          </a>
          <a
            href="#waitlist"
            className="rounded-full border border-border px-4 py-1.5 text-muted transition hover:border-accent hover:text-foreground"
          >
            출시 알림
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-5xl px-5 pt-14 pb-8 md:pt-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
          웹소설 작가를 위한 노출·성장 분석
        </p>
        <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          썼는데 <span className="text-accent-2">왜 안 뜨지?</span>
          <br />
          제목부터 데이터로 점검하세요.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted md:text-lg">
          독자는 0.5초 만에 제목으로 클릭을 결정합니다. 내 제목·소개글의
          <b className="text-foreground"> 클릭률(후킹) 점수</b>를 무료로 진단하고,
          더 잘 팔리는 제목 5개를 받아보세요.
        </p>
      </div>
      <div className="mt-10">
        <DiagnoseTool />
      </div>
    </section>
  );
}

function DiagnoseTool() {
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState(GENRES[1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const [proRequired, setProRequired] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    setError("");
    setProRequired(false);
    setLoading(true);
    setResult(null);
    try {
      let passCode: string | undefined;
      try {
        passCode = (JSON.parse(localStorage.getItem("nm_pass") ?? "null") as { code?: string } | null)?.code;
      } catch {}
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, synopsis, genre, platform: "문피아", passCode }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setProRequired(true);
        setError(data.message || "무료 진단 횟수를 모두 썼어요.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "진단 실패");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      {/* 입력 */}
      <form
        onSubmit={run}
        className="rounded-2xl border border-border bg-card/60 p-5 shadow-xl shadow-black/20"
      >
        <label className="block text-sm font-semibold">작품 제목 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 회귀한 천재 헌터의 정산은 다르다"
          aria-label="작품 제목"
          maxLength={80}
          className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />

        <label className="mt-4 block text-sm font-semibold">소개글 (선택)</label>
        <textarea
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder="1~2줄로 상황과 떡밥을 던져보세요."
          rows={3}
          maxLength={1000}
          className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />

        <label className="mt-4 block text-sm font-semibold">장르</label>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        >
          {GENRES.map((g) => (
            <option key={g} value={g} className="bg-card">
              {g}
            </option>
          ))}
        </select>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">예시로 채우기:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={() => {
                setTitle(ex.title);
                setSynopsis(ex.synopsis);
                setGenre(ex.genre);
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              {ex.title}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent-2">
            {error}
            {proRequired && (
              <a href="/pro" className="ml-2 font-bold text-accent underline">
                Pro 패스 보기 →
              </a>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "분석 중…" : "무료로 제목 진단하기"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          가입 없이 즉시 결과 확인 · 무료
        </p>
      </form>

      {/* 결과 */}
      <div className="rounded-2xl border border-border bg-card/40 p-5">
        {!result && !loading && <ResultPlaceholder />}
        {loading && <ResultSkeleton />}
        {result && <ResultView result={result} title={title} />}
      </div>
    </div>
  );
}

function ResultPlaceholder() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center text-muted">
      <div className="mb-3 text-4xl">📊</div>
      <p className="text-sm">
        제목을 입력하고 진단하면
        <br />
        클릭률 점수와 개선안이 여기에 표시됩니다.
      </p>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="min-h-[280px] animate-pulse space-y-3">
      <div className="mx-auto h-24 w-24 rounded-full bg-border/50" />
      <div className="h-4 w-3/4 rounded bg-border/50" />
      <div className="h-3 w-full rounded bg-border/40" />
      <div className="h-3 w-5/6 rounded bg-border/40" />
      <div className="h-3 w-2/3 rounded bg-border/40" />
    </div>
  );
}

function ResultView({ result, title }: { result: DiagnoseResult; title: string }) {
  const color =
    result.score >= 80
      ? "#34d399"
      : result.score >= 65
        ? "#5b9bfd"
        : result.score >= 50
          ? "#fbbf24"
          : "#2dd4bf";
  return (
    <div className="animate-fadeUp space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={result.score} color={color} grade={result.grade} />
        <div>
          <p className="text-xs text-muted">클릭률(후킹) 점수</p>
          <p className="text-sm font-medium leading-snug">{result.summary}</p>
        </div>
      </div>

      <Section title="💪 강점" items={result.strengths} />
      <Section title="⚠️ 개선 포인트" items={result.weaknesses} accent />

      {result.titleSuggestions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold">✨ 클릭률 높은 대안 제목</p>
          <ul className="space-y-2">
            {result.titleSuggestions.map((s, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40 p-2.5">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted">{s.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.keywords.map((k) => (
            <span key={k} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
              #{k}
            </span>
          ))}
        </div>
      )}

      <ShareButtons title={title} result={result} />

      <p className="pt-1 text-center text-[11px] text-muted">
        {result.engine === "claude" ? "특화 AI 정밀 진단" : "샘플 진단(데모)"} · 더 깊은
        분석은 출시 후 제공됩니다 →{" "}
        <a href="#waitlist" className="text-accent underline">
          알림 신청
        </a>
      </p>
    </div>
  );
}

function ShareButtons({ title, result }: { title: string; result: DiagnoseResult }) {
  const [copied, setCopied] = useState<"" | "text" | "link">("");

  const shareText =
    `📊 웹소설 제목 클릭률 진단\n` +
    `"${title}" → ${result.score}점 (${result.grade}등급)\n` +
    (result.titleSuggestions[0] ? `추천 제목 예: ${result.titleSuggestions[0].title}\n` : "") +
    `무료 진단 👉 https://novelmetric.vercel.app`;

  const shareLink = `https://novelmetric.vercel.app/result?t=${encodeURIComponent(title)}&s=${result.score}&g=${encodeURIComponent(result.grade)}`;

  async function copy(kind: "text" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "text" ? shareText : shareLink);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={() => copy("text")}
        className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold transition hover:border-accent"
      >
        {copied === "text" ? "✓ 복사됨" : "📋 결과 텍스트 복사"}
      </button>
      <button
        onClick={() => copy("link")}
        className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold transition hover:border-accent"
      >
        {copied === "link" ? "✓ 복사됨" : "🔗 공유 링크 복사"}
      </button>
    </div>
  );
}

function ScoreRing({ score, color, grade }: { score: number; color: string; grade: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold leading-none">{score}</span>
        <span className="text-[10px] font-bold" style={{ color }}>
          {grade}등급
        </span>
      </div>
    </div>
  );
}

function Section({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`text-xs leading-relaxed ${accent ? "text-foreground" : "text-muted"}`}>
            · {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ValueProps() {
  const items = [
    {
      icon: "🎯",
      title: "집필 툴이 아닙니다",
      desc: "노벨라·펜시브가 '쓰기'를 돕는다면, 노블메트릭은 '쓴 다음'을 돕습니다. 노출·순위·성장 전담.",
    },
    {
      icon: "📈",
      title: "연독률·투베·선작을 한눈에",
      desc: "작가가 손으로 계산하던 연독률을 자동으로. 선작 게이지로 투베 진입 적기까지 — /dashboard에서.",
    },
    {
      icon: "⚡",
      title: "작가의 시간을 아낌",
      desc: "플랫폼마다 흩어진 지표를 매일 자동 수집. 주간 리포트로 핵심만.",
    },
  ];
  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <h2 className="text-center text-2xl font-bold">왜 노블메트릭인가</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="text-2xl">{it.icon}</div>
            <h3 className="mt-3 font-bold">{it.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{it.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ["연독률 자동 계산", true, true],
    ["회차별 조회수 차트", true, true],
    ["매일 자동 추적 · 추이 기록", true, false],
    ["투베 진입 게이지(선작)", true, false],
    ["경쟁작(장르 베스트) 비교", true, false],
    ["제목 클릭률 AI 진단", true, false],
    ["급변 알림(이메일/카톡)", true, false],
    ["설치 불필요(웹)", true, false],
  ] as const;
  return (
    <section className="mx-auto max-w-3xl px-5 py-14">
      <h2 className="text-center text-2xl font-bold">기존 연독률 계산기와 뭐가 다른가</h2>
      <p className="mt-2 text-center text-sm text-muted">
        크롬 확장은 ‘지금 이 순간의 숫자’만 보여줍니다. 노블메트릭은 <b className="text-foreground">변화를 추적</b>해요.
      </p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted">기능</th>
              <th className="px-3 py-3 text-center font-bold text-accent">노블메트릭</th>
              <th className="px-3 py-3 text-center font-medium text-muted">크롬 확장</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className="border-t border-border/60">
                <td className="px-4 py-2.5">{label}</td>
                <td className="px-3 py-2.5 text-center">{a ? "✅" : "—"}</td>
                <td className="px-3 py-2.5 text-center text-muted">{b ? "✅" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      q: "연독률이 뭔가요? 어떻게 계산하나요?",
      a: "독자가 1화부터 최신화까지 얼마나 따라오는지의 비율입니다. 노블메트릭은 회차별 조회수를 모아 (최신-3화)/3화 기준으로 자동 계산하고 60~70% 기준으로 등급을 매겨줍니다. 손으로 엑셀에 옮길 필요 없어요.",
    },
    {
      q: "투베(투데이베스트) 진입은 어떻게 도와주나요?",
      a: "작가 통념상 '선작 200'이 투베를 노릴 적기입니다. 대시보드의 투베 게이지가 현재 선작이 200에 얼마나 가까운지, 매일 얼마나 느는지 보여줍니다.",
    },
    {
      q: "어떤 플랫폼을 지원하나요?",
      a: "현재 문피아 공개 데이터를 지원합니다. 작품 URL이나 작품 ID만 넣으면 됩니다. (노벨피아·기타 플랫폼은 순차 확장 예정)",
    },
    {
      q: "무료인가요?",
      a: "제목 진단과 작품 지표·연독률 조회는 무료로 써볼 수 있습니다. 매일 자동 추적·알림 등은 추후 Pro로 제공될 예정입니다.",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-5 py-10">
      <h2 className="text-center text-2xl font-bold">자주 묻는 질문</h2>
      <div className="mt-6 space-y-3">
        {items.map((it) => (
          <details key={it.q} className="group rounded-xl border border-border bg-card/40 p-4">
            <summary className="cursor-pointer list-none font-semibold marker:content-none">
              <span className="text-accent">Q. </span>
              {it.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Roadmap() {
  const items = [
    {
      tag: "지금",
      on: true,
      title: "제목·소개글 클릭률 진단",
      desc: "AI가 후킹 점수와 대안 제목을 제시 (무료 체험 중)",
    },
    {
      tag: "지금",
      on: true,
      title: "순위·조회수 추적 대시보드",
      desc: "문피아 작품 지표 조회 + 추적 등록 (매일 자동 수집) — /dashboard",
    },
    {
      tag: "출시 예정",
      on: false,
      title: "트렌드 키워드 리포트",
      desc: "지금 뜨는 소재·클리셰·키워드를 주간으로",
    },
    {
      tag: "출시 예정",
      on: false,
      title: "댓글 이탈 분석 + 주간 알림",
      desc: "몇 화에서 독자가 떨어지는지, 순위 급변 알림",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-5 py-10">
      <h2 className="text-center text-2xl font-bold">로드맵</h2>
      <div className="mt-8 space-y-3">
        {items.map((it) => (
          <div
            key={it.title}
            className={`flex gap-4 rounded-2xl border p-4 ${
              it.on ? "border-accent/60 bg-accent/10" : "border-border bg-card/30"
            }`}
          >
            <span
              className={`mt-0.5 h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                it.on ? "bg-accent text-background" : "bg-border text-muted"
              }`}
            >
              {it.tag}
            </span>
            <div>
              <h3 className="font-semibold">{it.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{it.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Waitlist() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="waitlist" className="mx-auto max-w-3xl px-5 py-16">
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-card/30 p-8 text-center md:p-10">
        <h2 className="text-2xl font-bold md:text-3xl">정식 출시 알림 받기</h2>
        <p className="mx-auto mt-2 max-w-md text-muted">
          순위 추적 대시보드·트렌드 리포트가 준비되면 가장 먼저 알려드릴게요.
          <br />
          초기 신청자에게는 <b className="text-foreground">Pro 무료 체험</b>을 드립니다.
        </p>
        {done ? (
          <p className="mx-auto mt-6 max-w-sm rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
            🎉 신청 완료! 출시되면 가장 먼저 연락드릴게요.
          </p>
        ) : (
          <form onSubmit={submit} className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              className="flex-1 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-3 font-bold text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "등록 중…" : "신청"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-accent-2">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-xs text-muted">
      <nav className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <a href="/dashboard" className="hover:text-foreground">대시보드</a>
        <a href="/compare" className="hover:text-foreground">작품 비교</a>
        <a href="/best" className="hover:text-foreground">베스트 분석</a>
        <a href="/insights" className="hover:text-foreground">트렌드 리포트</a>
        <a href="/guide" className="hover:text-foreground">작가 지표 가이드</a>
        <a href="/pro" className="hover:text-foreground">Pro 패스</a>
      </nav>
      <p>© 2026 노블메트릭(NovelMetric). 웹소설 작가를 위한 노출·성장 분석.</p>
    </footer>
  );
}
