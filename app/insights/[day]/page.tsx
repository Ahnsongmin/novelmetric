// 일별 베스트 분석 리포트 — nm_best_daily에서 그날 데이터를 읽어 렌더.
// Cron이 데이터만 쌓으면 페이지는 자동 생성(ISR), 사람 손 불필요.
// 2026-07-14부터 문피아·노벨피아 분리 저장 — 이전 날짜는 문피아만 표시.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBestDaily, listBestDays } from "@/lib/db";
import { analyzeBest, type BestAnalysis } from "@/lib/analyze";
import type { RankItem } from "@/lib/munpia";

export const revalidate = 86400;

type Props = { params: Promise<{ day: string }> };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  return {
    title: `${day} 문피아·노벨피아 베스트 제목 패턴 분석`,
    description: `${day} 문피아 투데이베스트·노벨피아 TOP100의 후킹 클리셰 순위, 장르 분포, 제목 키워드 분석 리포트.`,
  };
}

export default async function InsightDayPage({ params }: Props) {
  const { day } = await params;
  if (!DAY_RE.test(day)) notFound();
  const data = await getBestDaily(day);
  if (!data || (!data.munpia.length && !data.novelpia.length)) notFound();

  const days = await listBestDays(90);
  const idx = days.indexOf(day);
  const prev = idx >= 0 ? days[idx + 1] : undefined; // days는 최신순
  const next = idx > 0 ? days[idx - 1] : undefined;

  const sections = [
    { key: "munpia", label: "문피아 투데이베스트", items: data.munpia },
    { key: "novelpia", label: "노벨피아 TOP100", items: data.novelpia },
  ].filter((s) => s.items.length > 0);

  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 py-12">
      <Link href="/insights" className="text-sm text-muted hover:text-foreground">← 트렌드 리포트</Link>
      <h1 className="mt-3 text-2xl font-bold md:text-3xl">{day} 베스트 제목 패턴 분석</h1>
      <p className="mt-2 text-sm text-muted">
        {sections.map((s) => `${s.label} ${s.items.length}작`).join(" · ")} 자동 분석 · 노블메트릭
      </p>

      {sections.map((s) => (
        <PlatformReport key={s.key} label={s.label} items={s.items} analysis={analyzeBest(s.items)} />
      ))}

      <div className="mt-8 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center text-sm">
        <p className="font-semibold">내 작품 제목도 베스트 기준으로 진단해 보세요</p>
        <Link href="/" className="mt-2 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 font-bold text-background transition hover:opacity-90">
          무료 제목 진단 →
        </Link>
      </div>

      <nav className="mt-8 flex justify-between text-sm">
        {prev ? <Link href={`/insights/${prev}`} className="text-accent hover:underline">← {prev}</Link> : <span />}
        {next ? <Link href={`/insights/${next}`} className="text-accent hover:underline">{next} →</Link> : <span />}
      </nav>
    </main>
  );
}

function PlatformReport({
  label,
  items,
  analysis: a,
}: {
  label: string;
  items: RankItem[];
  analysis: BestAnalysis;
}) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-extrabold">
        <span className="mr-2 rounded-lg bg-accent/15 px-2.5 py-1 text-sm text-accent">{label}</span>
      </h2>

      <section className="mt-4 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-bold">🔥 후킹 클리셰 순위</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          {a.hooks.filter((h) => h.count > 0).map((h) => (
            <li key={h.label} className="flex justify-between">
              <span>{h.label}</span>
              <span className="text-muted">{h.count}작품 ({h.pct}%)</span>
            </li>
          ))}
        </ul>
        {a.avgViewsWithHook > 0 && a.avgViewsNoHook > 0 && (
          <p className="mt-3 text-xs text-muted">
            후킹 요소가 있는 제목 평균 조회수 {a.avgViewsWithHook.toLocaleString()} vs 없는 제목{" "}
            {a.avgViewsNoHook.toLocaleString()}
          </p>
        )}
      </section>

      {a.curiosity && (
        <section className="mt-5 rounded-2xl border border-border bg-card/60 p-5">
          <h3 className="font-bold">🤔 제목 궁금증 지수</h3>
          <p className="mt-1 text-xs text-muted">
            클리셰 키워드가 아니라, 제목이 &lsquo;왜? 뭐지?&rsquo; 하는 질문을 만드는 정도(AI 채점).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
              <div className="text-xs text-muted">궁금증 상위 {Math.round(a.curiosity.quantile * 100)}%</div>
              <div className="mt-1 text-lg font-extrabold text-accent">
                {a.curiosity.avgViewsHigh.toLocaleString()}
              </div>
              <div className="text-xs text-muted">평균 조회수</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted">궁금증 하위 {Math.round(a.curiosity.quantile * 100)}%</div>
              <div className="mt-1 text-lg font-extrabold">
                {a.curiosity.avgViewsLow.toLocaleString()}
              </div>
              <div className="text-xs text-muted">평균 조회수</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{a.curiosity.scored}작 채점 기준.</p>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-bold">📚 장르 분포</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          {a.genres.slice(0, 8).map((g) => (
            <li key={g.name} className="flex justify-between">
              <span>{g.name}</span>
              <span className="text-muted">{g.count}작품</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-bold">🏷️ 제목 빈출 키워드</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {a.topKeywords.slice(0, 20).map((k) => (
            <span key={k.word} className="rounded-full border border-border px-3 py-1 text-xs">
              {k.word} <span className="text-muted">{k.count}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-bold">🏆 TOP {Math.min(10, items.length)}</h3>
        <ol className="mt-3 space-y-2 text-sm">
          {items.slice(0, 10).map((it) => (
            <li key={it.rank} className="flex gap-2.5">
              <span className="w-5 shrink-0 text-right font-bold text-accent">{it.rank}</span>
              <span>
                {it.title} <span className="text-muted">— {it.genre}{it.author ? ` · ${it.author}` : ""}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
