// 일일 베스트 리포트 아카이브 — Cron이 매일 적재한 nm_best_daily를 목록으로.
// 글을 사람이 쓰지 않아도 SEO 페이지가 매일 1장씩 쌓인다.

import type { Metadata } from "next";
import Link from "next/link";
import { listBestDays } from "@/lib/db";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "웹소설 트렌드 리포트 — 문피아 베스트 일일 분석 | 노블메트릭",
  description: "매일 자동 수집한 문피아 투데이베스트의 제목 패턴·후킹 키워드·장르 분포 분석 아카이브.",
};

export default async function InsightsPage() {
  const days = await listBestDays(90);

  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 py-12">
      <a href="/" className="text-sm text-muted hover:text-foreground">← 노블메트릭</a>
      <h1 className="mt-3 text-3xl font-bold">웹소설 트렌드 리포트</h1>
      <p className="mt-2 text-muted">
        매일 수집한 문피아 투데이베스트를 분석해 제목 패턴·후킹 키워드·장르 분포를 기록합니다.
        오늘의 실시간 분석은 <Link href="/best" className="text-accent hover:underline">베스트 분석</Link>에서.
      </p>

      {days.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-border bg-card/60 p-8 text-center text-muted">
          아직 쌓인 리포트가 없어요. 매일 새벽 자동 수집이 시작되면 여기에 하루 한 장씩 쌓입니다.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {days.map((d) => (
            <li key={d}>
              <Link
                href={`/insights/${d}`}
                className="block rounded-xl border border-border bg-card/60 px-5 py-3.5 text-sm transition hover:border-accent"
              >
                📊 {d} 문피아 베스트 제목 패턴 분석
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
