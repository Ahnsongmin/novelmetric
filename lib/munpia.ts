// 문피아(munpia) 공개 데이터 수집 모듈
// - 베스트/랭킹 리스트: mm.munpia.com (모바일, 서버렌더 HTML)
// - 개별 작품 지표: novel.munpia.com/{novelId}
// robots.txt 준수(랭킹/작품 페이지는 차단 대상 아님) · 요청 throttle · 공개 데이터만.

import { parse, type HTMLElement } from "node-html-parser";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type RankItem = {
  rank: number;
  novelId: number | null;
  title: string;
  genre: string;
  author: string;
  episodes: number | null; // 연재 화수
  views: number | null; // 조회수
  recommends: number | null; // 추천수
  synopsis: string;
  cover: string | null;
};

export type NovelStats = {
  novelId: number;
  title: string;
  genre: string;
  author: string;
  authorId: number | null;
  episodes: number | null; // 연재수
  views: number | null; // 조회수
  recommends: number | null; // 추천수
  chars: number | null; // 글자수
  favorites: number | null; // 선호작수
  registeredAt: string | null; // 작품등록일
  lastUpdatedAt: string | null; // 최근연재일
  collectedAt: string; // 수집 시각(ISO)
};

const BEST_SECTIONS = ["today", "week", "month", "total"] as const;
export type BestSection = (typeof BEST_SECTIONS)[number];

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/** 베스트 랭킹 리스트 수집 (기본: 오늘 무료 베스트) */
export async function fetchBest(section: BestSection = "today"): Promise<RankItem[]> {
  const url = `https://mm.munpia.com/?menu=best&action=list&section=${section}`;
  const root = parse(await fetchHtml(url));
  const lis = root.querySelectorAll("li.novel-list-template");

  return lis.map((li, i): RankItem => {
    const onclick = li.getAttribute("onclick") || "";
    const idMatch = onclick.match(/view_novel\((\d+)/);
    const inquirySpans = li.querySelectorAll(".inquiry span");
    const inq = (label: string) =>
      inquirySpans.find((s) => s.text.includes(label))?.querySelector("em")?.text ?? null;

    const titleEl = li.querySelector(".title");
    const title = titleEl
      ? titleEl.text.replace(titleEl.querySelector("span")?.text ?? "", "").trim()
      : "";
    const authorRaw = li.querySelector(".author")?.text ?? "";

    return {
      rank: i + 1,
      novelId: idMatch ? parseInt(idMatch[1], 10) : null,
      title,
      genre: li.querySelector(".genre")?.text.trim() ?? "",
      author: authorRaw.split(/\s{2,}|총/)[0].trim(),
      episodes: toInt(inq("연재")),
      views: toInt(inq("조회수")),
      recommends: toInt(inq("추천수")),
      synopsis: li.querySelector(".detail p")?.text.trim() ?? "",
      cover: li.querySelector("img")?.getAttribute("src") ?? null,
    };
  });
}

/** 개별 작품 지표 수집 */
export async function fetchNovel(novelId: number): Promise<NovelStats> {
  const root = parse(await fetchHtml(`https://novel.munpia.com/${novelId}`));

  // 라벨(dt) → 값(dd) 매핑
  const labelMap = new Map<string, string>();
  for (const dl of root.querySelectorAll("dl.meta-etc")) {
    const dts = dl.querySelectorAll("dt");
    const dds = dl.querySelectorAll("dd");
    dts.forEach((dt, idx) => {
      const v = dds[idx]?.text.trim();
      if (v) labelMap.set(dt.text.replace(/[:\s]/g, ""), v);
    });
  }

  const authorEl = root.querySelector("dl.meta-author dd a");
  const favEl: HTMLElement | undefined = root
    .querySelectorAll(".subscribe")
    .find((s) => s.text.includes("선호작"));
  const favorites = favEl?.parentNode?.querySelector("b")?.text ?? null;

  const titleEl = root.querySelector(".title-wrap a");
  const title = titleEl
    ? titleEl.text.replace(titleEl.querySelector("span")?.text ?? "", "").trim()
    : "";

  return {
    novelId,
    title,
    genre: root.querySelector(".meta-path strong")?.text.trim() ?? "",
    author: root.querySelector("dl.meta-author strong")?.text.trim() ?? "",
    authorId: toInt(authorEl?.getAttribute("data-no")),
    episodes: toInt(labelMap.get("연재수")),
    views: toInt(labelMap.get("조회수")),
    recommends: toInt(labelMap.get("추천수")),
    chars: toInt(labelMap.get("글자수")),
    favorites: toInt(favorites),
    registeredAt: labelMap.get("작품등록일") ?? null,
    lastUpdatedAt: labelMap.get("최근연재일") ?? null,
    collectedAt: new Date().toISOString(),
  };
}

// ---------- 작품 검색 (제목으로) ----------

export type SearchHit = {
  novelId: number;
  title: string;
  author: string;
  genre: string;
  cover: string | null;
};

/** 제목 키워드로 문피아 작품 검색 → 후보 목록 */
export async function searchNovels(keyword: string, limit = 20): Promise<SearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const url = `https://www.munpia.com/search?keyword=${encodeURIComponent(kw)}`;
  const root = parse(await fetchHtml(url));
  const anchors = root.querySelectorAll("a.item, a.hero-item");
  const seen = new Set<number>();
  const hits: SearchHit[] = [];
  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const id = Number(href.match(/novel\.munpia\.com\/(\d+)/)?.[1]);
    if (!id || seen.has(id)) continue;
    const title = a.querySelector(".title")?.text.trim() ?? "";
    if (!title) continue;
    seen.add(id);
    hits.push({
      novelId: id,
      title,
      author: a.querySelector(".author")?.text.trim() ?? "",
      genre: a.querySelector(".genre")?.text.trim().replace(/\s+/g, " ") ?? "",
      cover: a.querySelector("img")?.getAttribute("src") ?? null,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

// ---------- 연독률 (회차별 조회수 기반) ----------

export type Episode = { no: number; title: string; date: string; views: number | null };

export type Retention = {
  episodes: Episode[]; // 1화 → 최신화 순서
  firstViews: number | null;
  latestViews: number | null;
  cumulativeRate: number | null; // 누적 연독률 = 최신화/1화 ×100
  adjustedRate: number | null; // 보정 연독률 = (최신-3화)/3화 ×100  (작가들이 쓰는 기준)
  grade: string; // 매우 좋음 / 좋음 / 보통 / 주의
};

/** 작품의 전체 회차별 조회수 수집 (페이지네이션). 1화→최신화 순으로 반환.
 *  문피아는 범위 밖 페이지를 마지막 페이지로 클램프하므로, 고유 neSrl로 중복 제거하고
 *  새 회차가 없으면 중단한다. */
export async function fetchEpisodes(novelId: number, maxPages = 12): Promise<Episode[]> {
  const seen = new Set<string>();
  const collected: { key: string; title: string; date: string; views: number | null }[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const root = parse(await fetchHtml(`https://novel.munpia.com/${novelId}/page/${p}`));
    const rows = root.querySelectorAll("#ENTRIES tbody tr");
    let added = 0;
    for (const r of rows) {
      if ((r.getAttribute("class") || "").includes("notice")) continue;
      const a = r.querySelector("td.subject a");
      const title = a?.text.trim() ?? "";
      if (!title) continue;
      const href = a?.getAttribute("href") ?? "";
      const key = (href.match(/neSrl\/(\d+)/)?.[1]) ?? `${title}|${r.querySelector("td.date")?.text.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const nums = r.querySelectorAll("td.number");
      collected.push({
        key,
        title,
        date: r.querySelector("td.date")?.text.trim() ?? "",
        views: toInt(nums[0]?.text), // 첫 번째 number = 조회수
      });
      added++;
    }
    if (added === 0) break; // 새 회차 없으면 끝(클램프된 중복 페이지)
    if (p < maxPages) await sleep(500); // throttle
  }
  collected.reverse(); // 최신→과거 → 1화→최신
  return collected.map((e, i) => ({ no: i + 1, title: e.title, date: e.date, views: e.views }));
}

/** 회차별 조회수로 연독률 계산 */
export function computeRetention(eps: Episode[]): Retention {
  const valid = eps.filter((e): e is Episode & { views: number } => e.views !== null);
  const first = valid[0]?.views ?? null;
  const latest = valid.length ? valid[valid.length - 1].views : null;
  const cumulative = first && latest ? Math.round((latest / first) * 100) : null;

  // 보정: 3화 기준, 최신-3화 대비 (앞 2화·최신 3화 변동 제외)
  const e3 = valid[2]?.views ?? null;
  const eLatestMinus3 = valid.length >= 4 ? valid[valid.length - 4].views : null;
  const adjusted = e3 && eLatestMinus3 ? Math.round((eLatestMinus3 / e3) * 100) : null;

  const r = adjusted ?? cumulative ?? 0;
  const grade = r >= 70 ? "매우 좋음" : r >= 60 ? "좋음" : r >= 45 ? "보통" : "주의";
  return {
    episodes: eps,
    firstViews: first,
    latestViews: latest,
    cumulativeRate: cumulative,
    adjustedRate: adjusted,
    grade,
  };
}

/** 문피아 작품 URL 또는 숫자ID 문자열에서 novelId 추출 */
export function parseNovelId(input: string): number | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/munpia\.com\/(?:novel\/)?(\d+)/) || s.match(/novelno=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export { BEST_SECTIONS };
