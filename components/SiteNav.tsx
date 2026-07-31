// 전역 상단 네비. 원래 홈에만 헤더가 있어서 /best·/insights 같은 페이지에서 다른 섹션으로 가려면
// 홈으로 되돌아가야 했다("← 노블메트릭" 링크 하나가 전부였다). 이제 어느 페이지에서든 바로 이동한다.
//
// next/link를 쓰는 이유: 프리페치로 이동이 즉시 느껴지고, 페이지 전체 리로드가 없어 스크롤·상태가
// 덜 튄다. (`<a>`로 두면 lint의 no-html-link-for-pages에도 걸린다.)
//
// 좁은 화면 규칙: 링크가 많아 헤더가 넘칠 수 있으므로 부차적인 링크(베스트·트렌드·비교·가이드)는
// lg 미만에서 숨기고 대시보드·Pro·문의·계정만 남긴다. 숨은 링크는 전 페이지 하단 SiteFooter에서 닿는다.

import Link from "next/link";
import AuthBadge from "@/components/AuthBadge";

const LINKS = [
  { href: "/dashboard", label: "대시보드", always: true },
  { href: "/best", label: "베스트 분석", always: false },
  { href: "/insights", label: "트렌드", always: false },
  { href: "/compare", label: "작품 비교", always: false },
  { href: "/guide", label: "지표 가이드", always: false },
];

export default function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm text-background">
            N
          </span>
          노블메트릭
        </Link>
        <nav className="flex items-center gap-0.5 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`${l.always ? "" : "hidden lg:block "}rounded-full px-3 py-1.5 text-muted transition hover:text-foreground`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/pro"
            className="rounded-full border border-border px-3.5 py-1.5 font-semibold text-accent transition hover:border-accent hover:text-foreground"
          >
            Pro
          </Link>
          <Link
            href="/contact"
            className="rounded-full px-3 py-1.5 text-muted transition hover:text-foreground"
          >
            문의
          </Link>
          <AuthBadge />
        </nav>
      </div>
    </header>
  );
}
