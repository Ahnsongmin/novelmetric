import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NovelMetric — webnovel author growth analytics";

// 한글 폰트 이슈 회피를 위해 기본 OG 카드는 로고 + 영문/숫자만 사용
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b1220 0%, #111a2c 100%)",
          color: "#f5f3ff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: 30,
              background: "linear-gradient(135deg, #5b9bfd, #2dd4bf)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 88,
              fontWeight: 800,
              color: "#0b1220",
            }}
          >
            N
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>NovelMetric</div>
            <div style={{ fontSize: 30, color: "#8ca0bd" }}>webnovel author growth analytics</div>
          </div>
        </div>
        <div
          style={{
            marginTop: 44,
            fontSize: 30,
            color: "#c4b5fd",
            display: "flex",
            gap: 18,
          }}
        >
          <span>Read-through rate</span>
          <span>·</span>
          <span>Today Best gauge</span>
          <span>·</span>
          <span>Title score</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
