// 네이버 시리즈(series.naver.com) 공개 데이터 수집 모듈
// - 회차별 조회수·별점은 비공개(API가 0으로 내려줌) → 연독률 계산 불가
// - 작품 단위 지표(다운로드 수·평점·연재 화수)는 상세 페이지에 서버 렌더됨
//   단, 쿠키 없는 첫 요청엔 지표가 빠진 변형이 내려와 쿠키 수집 후 재요청이 필요
// robots.txt 준수(/novel/detail.series 허용 확인) · 공개 데이터만.

import type { NovelStats } from "./munpia";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** "893.4만" · "1.2억" · "1,234" 표기를 숫자로 */
function parseKoreanNum(s: string | undefined | null): number | null {
  if (!s) return null;
  const t = s.replace(/,/g, "").trim();
  const m = t.match(/^([\d.]+)(억|만)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  return Math.round(n * (m[2] === "억" ? 100_000_000 : m[2] === "만" ? 10_000 : 1));
}

async function fetchDetailHtml(productNo: number): Promise<string> {
  const url = `https://series.naver.com/novel/detail.series?productNo=${productNo}`;
  const r1 = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
  let html = await r1.text();
  if (!html.includes("btn_download")) {
    // 지표 없는 변형 → 첫 응답 쿠키를 실어 재요청
    const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const r2 = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...(cookie ? { Cookie: cookie } : {}) },
    });
    html = await r2.text();
  }
  if (!html.includes("og:title")) throw new Error(`시리즈 상세 파싱 실패 (productNo=${productNo})`);
  return html;
}

/** 작품 단위 지표. views = 다운로드 수(열람 근사치). 회차별 데이터는 미제공. */
export async function fetchNovel(productNo: number): Promise<NovelStats> {
  const html = await fetchDetailHtml(productNo);

  const title = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1]?.trim() ?? "";
  if (!title) throw new Error(`시리즈 작품 없음 (productNo=${productNo})`);
  const desc = html.match(/property="og:description"\s+content="([^"]*)"/)?.[1] ?? "";
  const episodes = parseKoreanNum(desc.match(/([\d,]+)\s*화/)?.[1]) ?? null;
  const views = parseKoreanNum(html.match(/btn_download"?[^>]*><span>([^<]+)<\/span>/)?.[1]);
  // 장르: 상단 내비게이션에도 장르 링크가 있어, 다운로드 버튼 이후(작품 정보 영역)에서 첫 매치를 잡는다
  const infoStart = html.indexOf("btn_download");
  const infoHtml = infoStart >= 0 ? html.slice(infoStart) : html;
  const genre = infoHtml.match(/categoryTypeCode=genre[^"]*"[^>]*>([^<]+)</)?.[1]?.trim() ?? "";
  const author =
    infoHtml
      .match(/글\s*(?:<\/span>)?\s*<a[^>]*search\.series[^>]*>([^<]+)</)?.[1]
      ?.trim() ?? "";

  return {
    novelId: productNo,
    title,
    genre,
    author,
    authorId: null,
    episodes,
    views: views ?? null,
    recommends: null,
    chars: null,
    favorites: null,
    registeredAt: null,
    lastUpdatedAt: null,
    collectedAt: new Date().toISOString(),
  };
}
