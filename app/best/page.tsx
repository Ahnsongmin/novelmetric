import type { Metadata } from "next";
import Link from "next/link";
import { fetchBest100WithViews, type RankItem } from "@/lib/munpia";
import { fetchTop100 } from "@/lib/novelpia";
import { fetchTop100 as fetchSeriesTop100 } from "@/lib/naverseries";
import { fetchRanking as fetchKakaoRanking } from "@/lib/kakaopage";
import { analyzeBest } from "@/lib/analyze";

export const revalidate = 3600; // 1시간마다 갱신(ISR)

export const metadata: Metadata = {
  title: "문피아·노벨피아·네이버시리즈·카카오페이지 오늘 베스트 + 제목 패턴 분석",
  description:
    "문피아 투데이베스트·노벨피아 TOP100·네이버시리즈 TOP100·카카오페이지 실시간 랭킹과, 상위작 제목에 가장 많이 쓰인 후킹 키워드·장르 분포를 데이터로 분석합니다.",
};

function fmt(n: number | null | undefined) {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}

type BestPlatform = "munpia" | "novelpia" | "naverseries" | "kakaopage";

const TABS: { key: BestPlatform; label: string; listName: string; fetch: () => Promise<RankItem[]> }[] = [
  { key: "munpia", label: "문피아", listName: "문피아 투데이베스트 TOP100", fetch: fetchBest100WithViews },
  { key: "novelpia", label: "노벨피아", listName: "노벨피아 TOP100", fetch: fetchTop100 },
  { key: "naverseries", label: "네이버시리즈", listName: "네이버시리즈 일간 TOP100", fetch: fetchSeriesTop100 },
  { key: "kakaopage", label: "카카오페이지", listName: "카카오페이지 실시간 랭킹 TOP50", fetch: fetchKakaoRanking },
];

type Props = { searchParams: Promise<{ p?: string }> };

export default async function BestPage({ searchParams }: Props) {
  const { p } = await searchParams;
  const tab = TABS.find((t) => t.key === p) ?? TABS[0];
  const platform = tab.key;

  let items: RankItem[] = [];
  let failed = false;
  try {
    items = await tab.fetch();
  } catch {
    failed = true;
  }
  const a = analyzeBest(items);
  const hookLift =
    a.avgViewsNoHook > 0 ? Math.round((a.avgViewsWithHook / a.avgViewsNoHook) * 10) / 10 : null;
  // 표 마지막 열: 플랫폼별로 제공되는 수치가 다르다
  const valueCol =
    platform === "munpia"
      ? { header: "조회수", of: (it: RankItem) => fmt(it.views) }
      : platform === "novelpia"
        ? { header: "선호", of: (it: RankItem) => fmt(it.favorites) }
        : platform === "naverseries"
          ? { header: "화수", of: (it: RankItem) => (it.episodes == null ? "-" : `${fmt(it.episodes)}화`) }
          : { header: "누적 열람수", of: (it: RankItem) => fmt(it.views) };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
      <a href="/" className="text-sm text-muted hover:text-foreground">
        ← 노블메트릭
      </a>
      <h1 className="mt-3 text-2xl font-bold md:text-3xl">오늘 베스트 · 제목 패턴 분석</h1>
      <p className="mt-1.5 text-muted">
        {tab.listName}을 수집해, 잘 팔리는 제목의 공통점을 데이터로 보여드립니다. (1시간마다 갱신)
      </p>

      {/* 플랫폼 탭 */}
      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "munpia" ? "/best" : `/best?p=${t.key}`}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
              platform === t.key
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
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
                <span className="block text-xs font-normal text-muted">{tab.listName}</span>
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
              📈 {tab.label} 베스트 TOP {items.length}
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card/60 text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">제목</th>
                    <th className="px-3 py-2 text-left">장르</th>
                    <th className="px-3 py-2 text-left">작가</th>
                    <th className="px-3 py-2 text-right">{valueCol.header}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.rank} className="border-t border-border/60">
                      <td className="px-3 py-2 font-bold text-accent">{it.rank}</td>
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2 text-muted">{it.genre || "-"}</td>
                      <td className="px-3 py-2 text-muted">{it.author}</td>
                      <td className="px-3 py-2 text-right">{valueCol.of(it)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {platform === "munpia" && (
              <p className="mt-2 text-xs text-muted">* 조회수는 상위 10위까지 제공됩니다.</p>
            )}
            {platform === "naverseries" && (
              <p className="mt-2 text-xs text-muted">
                * 네이버시리즈는 랭킹에 조회수를 제공하지 않아요. 장르는 장르별 랭킹 상위와 대조한 값이라 일부는
                &quot;-&quot;로 표시됩니다.
              </p>
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
