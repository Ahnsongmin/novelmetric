// 네이버 시리즈(series.naver.com) 공개 데이터 수집 모듈
// - 회차별 조회수·별점은 비공개(API가 0으로 내려줌) → 연독률 계산 불가
// - 작품 단위 지표(다운로드 수·평점·연재 화수)는 상세 페이지에 서버 렌더됨
//   단, 쿠키 없는 첫 요청엔 지표가 빠진 변형이 내려와 쿠키 수집 후 재요청이 필요
// robots.txt 준수(/novel/detail.series 허용 확인) · 공개 데이터만.

import type { NovelStats, RankItem } from "./munpia";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

// ---------- 웹소설 TOP100 (일간 랭킹) ----------

const TOP100_URL = "https://series.naver.com/novel/top100List.series";
// 장르 라벨: TOP100 페이지의 카테고리 탭 코드 기준 (2026-07 확인)
const GENRE_TABS: { code: string; name: string }[] = [
  { code: "201", name: "로맨스" },
  { code: "207", name: "로판" },
  { code: "202", name: "판타지" },
  { code: "208", name: "현판" },
  { code: "206", name: "무협" },
  { code: "203", name: "미스터리" },
  { code: "205", name: "라이트노벨" },
  { code: "209", name: "BL" },
];

async function fetchTopPage(categoryCode: string, page: number): Promise<string> {
  const url = `${TOP100_URL}?rankingTypeCode=DAILY&categoryCode=${categoryCode}&page=${page}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** 일간 TOP100 (전체장르 5페이지 ×20작). 장르는 장르별 랭킹 1페이지들과 대조해 채운다(views는 미제공). */
export async function fetchTop100(): Promise<RankItem[]> {
  const items: RankItem[] = [];
  for (let page = 1; page <= 5; page++) {
    const html = await fetchTopPage("ALL", page);
    const chunks = html.split(/class="top_numb"/).slice(1);
    for (const chunk of chunks) {
      const idM = chunk.match(/detail\.series\?productNo=(\d+)/);
      if (!idM) continue;
      // 순위는 자릿수마다 <em class="noN">숫자</em>로 쪼개져 있어 span 전체를 이어붙인다
      const numSpan = chunk.match(/class="top_num">([\s\S]*?)<\/span>/)?.[1] ?? "";
      const rank = parseInt(strip(numSpan).replace(/\D/g, ""), 10);
      const titleM = chunk.match(/<h3>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      items.push({
        rank: isNaN(rank) ? items.length + 1 : rank,
        novelId: parseInt(idM[1], 10),
        title: titleM ? strip(titleM[1]) : "",
        genre: "",
        author: strip(chunk.match(/class="author">([\s\S]*?)<\/span>/)?.[1] ?? ""),
        episodes: parseInt(chunk.match(/총([\d,]+)화/)?.[1]?.replace(/,/g, "") ?? "", 10) || null,
        views: null,
        recommends: null,
        synopsis: strip(chunk.match(/<p class="dsc">([\s\S]*?)<\/p>/)?.[1] ?? ""),
        cover: chunk.match(/<img src="([^"]+)"/)?.[1] ?? null,
      });
    }
    if (chunks.length === 0) break;
    await sleep(150);
  }

  // 장르 채우기: 장르별 일간 랭킹 1~2페이지(상위 40작)에 나오면 그 장르로 표시
  const genreOf = new Map<number, string>();
  for (const tab of GENRE_TABS) {
    for (const page of [1, 2]) {
      try {
        const html = await fetchTopPage(tab.code, page);
        for (const m of html.matchAll(/detail\.series\?productNo=(\d+)/g)) {
          const id = parseInt(m[1], 10);
          if (!genreOf.has(id)) genreOf.set(id, tab.name);
        }
      } catch {
        // 장르 한 탭 실패는 무시 — 해당 작품만 "기타"로 남는다
      }
      await sleep(150);
    }
  }
  for (const it of items) {
    if (it.novelId != null) it.genre = genreOf.get(it.novelId) ?? "";
  }
  return items;
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
