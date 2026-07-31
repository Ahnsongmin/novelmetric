// 전역 푸터. 원래 홈(app/page.tsx)에만 있어서 대시보드·Pro·로그인 등 나머지 페이지에는 문의할 곳이
// 아예 없었다(결제 지연 화면의 mailto 하나가 전부였다). 유료 고객이 생긴 뒤로는 "연락할 방법이 없는
// 상태"가 그 자체로 제품 결함이라, 레이아웃에 붙여 모든 페이지에 노출한다.
// 상단 네비(SiteNav)에서 좁은 화면일 때 숨는 링크들도 여기서 전부 닿는다.

import Link from "next/link";

const LINKS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/compare", label: "작품 비교" },
  { href: "/best", label: "베스트 분석" },
  { href: "/insights", label: "트렌드 리포트" },
  { href: "/guide", label: "작가 지표 가이드" },
  { href: "/pro", label: "Pro 패스" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-xs text-muted">
      <nav className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
        <Link href="/contact" className="font-semibold text-accent hover:underline">
          문의하기
        </Link>
      </nav>
      <p>© 2026 노블메트릭(NovelMetric). 웹소설 작가를 위한 노출·성장 분석.</p>
    </footer>
  );
}
