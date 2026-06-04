import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "노블메트릭 — 웹소설 작가 성장 분석",
    short_name: "노블메트릭",
    description:
      "내 웹소설의 연독률·선작·조회수를 자동 분석하고, 제목 클릭률을 진단하는 작가용 대시보드.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a14",
    theme_color: "#0b0a14",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
