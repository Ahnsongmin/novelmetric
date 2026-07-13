import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0b1220",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://novelmetric.vercel.app"),
  title: {
    default: "노블메트릭 — 웹소설 연독률·제목 클릭률 무료 분석",
    template: "%s | 노블메트릭",
  },
  description:
    "내 웹소설의 연독률·선작·조회수를 자동 분석하고, 제목 클릭률(후킹)을 무료 진단. 투베 진입 게이지와 경쟁작 비교까지 — 웹소설 작가용 성장 대시보드.",
  keywords: [
    "웹소설",
    "연독률",
    "연독률 계산",
    "투데이베스트",
    "투베",
    "선작",
    "문피아",
    "노벨피아",
    "웹소설 제목",
    "웹소설 작가 도구",
  ],
  openGraph: {
    title: "노블메트릭 — 웹소설 연독률·제목 무료 분석",
    description:
      "연독률 자동계산 · 투베 진입 게이지 · 경쟁작 비교 · 제목 클릭률 진단. 설치 없이 웹에서.",
    type: "website",
    url: "/",
    siteName: "노블메트릭",
  },
  twitter: { card: "summary_large_image", title: "노블메트릭 — 웹소설 작가 성장 분석" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
