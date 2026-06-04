import type { Metadata } from "next";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <a href="/" className="mb-6 flex items-center gap-2 font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm text-background">
          N
        </span>
        노블메트릭
      </a>
      <p className="text-5xl font-extrabold text-accent">404</p>
      <h1 className="mt-3 text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-sm text-muted">주소가 바뀌었거나 사라진 페이지일 수 있어요.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <a href="/" className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-bold text-background">
          홈으로
        </a>
        <a href="/dashboard" className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent">
          대시보드
        </a>
        <a href="/best" className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent">
          베스트 분석
        </a>
      </div>
    </main>
  );
}
