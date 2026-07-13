import type { Metadata } from "next";
import Link from "next/link";
import { fetchBest100WithViews, type RankItem } from "@/lib/munpia";
import { fetchTop100 } from "@/lib/novelpia";
import { analyzeBest } from "@/lib/analyze";

export const revalidate = 3600; // 1시간마다 갱신(ISR)

export const metadata: Metadata = {
  title: "문피아·노벨피아 오늘 베스트 TOP100 + 제목 패턴 분석",
  description:
    "문피아 투데이베스트·노벨피아 TOP100 실시간 순위와, 상위작 제목에 가장 많이 쓰인 후킹 키워드·장르 분포를 데이터로 분석합니다.",
};

function fmt(n: number | null | undefined) {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}

type Props = { searchParams: Promise<{ p?: string }> };

export default async function BestPage({ searchParams }: Props) {
  const { p } = await searchParams;
  const platform = p === "novelpia" ? "novelpia" : "munpia";

  let items: RankItem[] = [];
  let failed = false;
  try {
    items = platform === "novelpia" ? await fetchTop100() : await fetchBest100WithViews();
  } catch {
    failed = true;
  }
  const a = analyzeBest(items);
  const hookLift =
    a.avgViewsNoHook > 0 ? Math.round((a.avgViewsWithHook / a.avgViewsNoHook) * 10) / 10 : null;
  const isNovelpia = platform === "novelpia";

  return (
    <main className="mx-auto max-w-4xl flex-1 px-5 py-10">
      <a href="/" className="text-sm text-muted hover:text-foreground">
        ← 노블메트릭
      </a>
      <h1 className="mt-3 text-2xl font-bold md:text-3xl">오늘 베스트 TOP100 · 제목 패턴 분석</h1>
      <p className="mt-1.5 text-muted">
        {isNovelpia ? "노벨피아 TOP100" : "문피아 투데이베스트 TOP100"}을 수집해, 잘 팔리는 제목의
        공통점을 데이터로 보여드립니다. (1시간마다 갱신)
      </p>

      {/* 플랫폼 탭 */}
      <div className="mt-5 flex gap-2">
        <Link
          href="/best"
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
            !isNovelpia
              ? "border-accent bg-accent/15 text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          문피아
        </Link>
        <Link
          href="/best?p=novelpia"
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
            isNovelpia
              ? "border-accent bg-accent/15 text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          노벨피아
        </Link>
      </div>

      {failed && (
        <p className="mt-6 rounded-lg border border-accent-2/40 bg-accent-2/10 p-4 text-sm">
          지금은 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {!failed && (
        <>
          {/* 인사이트 요약 */}
          <section className="mt-7 grid gap-3 sm:grid-cols-3">
            <Card title="상위작이 가장 많이 쓴 후킹">
              {a.hooks[0]?.label ?? "-"}{" "}
              <span className="text-sm text-muted">({a.hooks[0]?.pct ?? 0}%)</span>
            </Card>
            <Card title="가장 흔한 장르">
              {a.genres[0]?.name ?? "-"}{" "}
              <span className="text-sm text-muted">({a.genres[0]?.count ?? 0}작)</span>
            </Card>
            {hookLift ? (
              <Card title="후킹 키워드 있는 제목의 조회수">
                평균 {hookLift}배
                <span className="block text-xs font-normal text-muted">후킹 없는 제목 대비</span>
              </Card>
            ) : (
              <Card title="분석 표본">
                TOP {a.total}
                <span className="block text-xs font-normal text-muted">
                  {isNovelpia ? "노벨피아 실시간 랭킹" : "문피아 투데이베스트"}
                </span>
              </Card>
            )}
          </section>

          {/* 후킹 클리셰 빈도 */}
          <section className="mt-8">
            <h2 className="text-lg font-bold">🪝 상위작 제목 후킹 키워드 빈도</h2>
            <div className="mt-3 space-y-2">
              {a.hooks
                .filter((h) => h.count > 0)
                .map((h) => (
                  <div key={h.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm">{h.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-card">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                        style={{ width: `${Math.max(h.pct, 4)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-muted">{h.pct}%</span>
                  </div>
                ))}
            </div>
          </section>

          {/* 제목 키워드 */}
          {a.topKeywords.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold">🔑 자주 등장한 제목 단어</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.topKeywords.map((k) => (
                  <span
                    key={k.word}
                    className="rounded-full border border-border px-3 py-1 text-sm"
                    style={{ fontSize: `${Math.min(0.8 + k.count * 0.12, 1.4)}rem` }}
                  >
                    {k.word} <span className="text-xs text-muted">{k.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 베스트 표 */}
          <section className="mt-9">
            <h2 className="text-lg font-bold">
              📈 {isNovelpia ? "노벨피아" : "문피아"} 베스트 TOP {items.length}
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card/60 text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">제목</th>
                    <th className="px-3 py-2 text-left">장르</th>
                    <th className="px-3 py-2 text-left">작가</th>
                    {isNovelpia ? (
                      <th className="px-3 py-2 text-right">선호</th>
                    ) : (
                      <th className="px-3 py-2 text-right">조회수</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.rank} className="border-t border-border/60">
                      <td className="px-3 py-2 font-bold text-accent">{it.rank}</td>
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2 text-muted">{it.genre}</td>
                      <td className="px-3 py-2 text-muted">{it.author}</td>
                      <td className="px-3 py-2 text-right">
                        {isNovelpia ? fmt(it.favorites) : fmt(it.views)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isNovelpia && (
              <p className="mt-2 text-xs text-muted">* 조회수는 상위 10위까지 제공됩니다.</p>
            )}
          </section>

          <div className="mt-10 rounded-2xl border border-border bg-card/40 p-6 text-center">
            <p className="font-bold">내 작품 제목은 몇 점일까?</p>
            <p className="mt-1 text-sm text-muted">상위작 패턴 기준으로 클릭률을 무료 진단해 보세요.</p>
            <a
              href="/#top"
              className="mt-4 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 font-bold text-background"
            >
              무료 제목 진단하기 →
            </a>
          </div>
        </>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-1 text-lg font-extrabold">{children}</p>
    </div>
  );
}
