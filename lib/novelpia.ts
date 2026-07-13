// 노벨피아(novelpia) 공개 데이터 수집 모듈
// - 작품 지표: novelpia.com/novel/{id} (서버렌더 HTML)
// - 회차 리스트: POST /proc/episode_list (HTML 조각) + 회차별 조회수 POST /proc/novel(get_episode_count_view, JSON)
// - 검색: GET /proc/novel?cmd=novel_search (JSON — block_out=0 등 숫자 파라미터 필수)
// robots 준수 · 요청 throttle · 공개 데이터만. 성인(19금) 작품은 미지원(로그인 계정 공유는 약관 위반).

import { parse } from "node-html-parser";
import type { NovelStats, Episode, SearchHit, RankItem } from "./munpia";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BASE = "https://novelpia.com";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

// cacheSecs: Next fetch 데이터 캐시(초). top100 등 트래픽 몰리는 페이지만 사용 — 작품 지표는 실시간 유지.
async function fetchHtml(url: string, cacheSecs?: number): Promise<string> {
  const init: RequestInit = { headers: { "User-Agent": UA } };
  if (cacheSecs) (init as { next?: { revalidate: number } }).next = { revalidate: cacheSecs };
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function postForm(path: string, form: Record<string, string | string[]>): Promise<string> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (Array.isArray(v)) v.forEach((x) => body.append(`${k}[]`, x));
    else body.append(k, v);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
}

/** 개별 작품 지표 수집 (novelId = 노벨피아 원본 novel_no) */
export async function fetchNovel(novelId: number): Promise<NovelStats> {
  const html = await fetchHtml(`${BASE}/novel/${novelId}`);
  const root = parse(html);

  const title = root.querySelector(".epnew-novel-title")?.text.trim();
  if (!title) throw new Error(`노벨피아 작품 ${novelId} 정보 없음(삭제·성인작품 가능성)`);

  const author = root.querySelector(".epnew-writer .writer-name")?.text.trim() ?? "";
  const tags = root
    .querySelectorAll(".writer-tag .tag")
    .map((t) => t.text.trim().replace(/^#/, ""))
    .filter((t) => t && !t.startsWith("+"));

  // <p><span class="category-title">조회</span><span>160,744</span></p> 형태
  const counter = (label: string): number | null => {
    const p = root
      .querySelectorAll(".info-count1 p")
      .find((el) => el.querySelector(".category-title")?.text.trim() === label);
    const spans = p?.querySelectorAll("span") ?? [];
    return spans.length >= 2 ? toInt(spans[1].text) : null;
  };

  const favorites = toInt(root.querySelector(".btn-like .bottom-txt")?.text);
  const episodes = toInt(html.match(/([\d,]+)\s*회차/)?.[1]);

  return {
    novelId,
    title,
    genre: tags.slice(0, 2).join(" "),
    author,
    authorId: toInt(root.querySelector(".epnew-writer .writer-name")?.getAttribute("href")?.match(/\/user\/(\d+)/)?.[1]),
    episodes,
    views: counter("조회"),
    recommends: counter("추천"),
    chars: null, // 노벨피아는 글자수 미공개
    favorites,
    registeredAt: null,
    lastUpdatedAt: null,
    collectedAt: new Date().toISOString(),
  };
}

/** 작품의 전체 회차별 조회수 수집. 1화→최신화 순으로 반환. (페이지당 20화) */
export async function fetchEpisodes(novelId: number, maxPages = 30): Promise<Episode[]> {
  const eps: Episode[] = [];
  for (let p = 0; p < maxPages; p++) {
    const html = await postForm("/proc/episode_list", {
      novel_no: String(novelId),
      sort: "DOWN", // 1화부터
      page: String(p),
    });
    // node-html-parser가 이 HTML 조각의 tr을 인식하지 못해 정규식으로 파싱
    const rows = html.split(/<tr\b/).slice(1);
    const pageEps = rows
      .map((chunk) => {
        const episodeNo = chunk.match(/data-episode-no="(\d+)"/)?.[1];
        if (!episodeNo) return null;
        const bInner = chunk.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? "";
        const title = bInner
          .replace(/<span[^>]*>[\s\S]*?<\/span>/g, "") // 무료/PLUS 등 배지 제거
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const dateMatch = chunk.match(/(\d{2})\.(\d{2})\.(\d{2})/);
        return {
          episodeNo,
          title,
          date: dateMatch ? `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "",
        };
      })
      .filter((e): e is { episodeNo: string; title: string; date: string } => e !== null);
    if (pageEps.length === 0) break;

    // 회차별 조회수 배치 조회 (페이지의 20화 단위)
    const viewJson = await postForm("/proc/novel", {
      cmd: "get_episode_count_view",
      novel_no: String(novelId),
      episode_arr: pageEps.map((e) => e.episodeNo),
    });
    const viewMap = new Map<string, number | null>();
    try {
      const parsed = JSON.parse(viewJson) as { list?: { episode_no: number; count_view: string }[] };
      for (const v of parsed.list ?? []) viewMap.set(String(v.episode_no), toInt(v.count_view));
    } catch {
      // 조회수 조회 실패 시 views=null로 계속
    }

    for (const e of pageEps) {
      eps.push({
        no: eps.length + 1,
        title: e.title,
        date: e.date,
        views: viewMap.get(e.episodeNo) ?? null,
      });
    }

    if (pageEps.length < 20) break;
    await sleep(250); // throttle
  }
  return eps;
}

/** "11.3K" · "1,234" 표기를 숫자로 */
function parseKM(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^([\d.,]+)\s*([KM])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(n)) return null;
  const mul = m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return Math.round(n * mul);
}

/** hash_ED8C90ED8380ECA780 → "판타지" (UTF-8 hex 디코딩) */
function decodeHashTag(hex: string): string {
  try {
    const bytes = hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [];
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return "";
  }
}

/** 노벨피아 TOP100 — novelpia.com/top100 (SSR HTML). 순위·제목·작가·EP·선호·장르태그.
 *  반환 novelId는 노벨피아 원본 ID (오프셋 미적용). */
export async function fetchTop100(): Promise<RankItem[]> {
  const html = await fetchHtml(`${BASE}/top100`, 1800);
  const parts = html.split(/onclick="location='\/novel\/(\d+)';"/).slice(1);

  const seen = new Set<number>();
  const items: RankItem[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const novelId = parseInt(parts[i], 10);
    const chunk = parts[i + 1];
    if (seen.has(novelId)) continue; // PC/모바일 중복 레이아웃 — 첫 블록(PC)만

    const rank = chunk.match(/thumb_s1">\s*(\d+)/)?.[1];
    const title = chunk.match(/class="cut_line_one">\s*([^<]+?)\s*</)?.[1];
    if (!rank || !title) continue;

    seen.add(novelId);
    const hashes = chunk.match(/class="mobile_show((?:\s+hash_[0-9A-F]+)+)/)?.[1] ?? "";
    const tags = [...hashes.matchAll(/hash_([0-9A-F]+)/g)]
      .map((m) => decodeHashTag(m[1]))
      .filter(Boolean);

    items.push({
      rank: parseInt(rank, 10),
      novelId,
      title,
      genre: tags.slice(0, 2).join(" "),
      author: chunk.match(/<font style="font-size:12px[^>]*>\s*([^<]+?)\s*</)?.[1] ?? "",
      episodes: toInt(chunk.match(/thumb_s2">\s*EP\.?([\d,]+)/)?.[1]),
      views: null, // top100 페이지는 조회수 미제공
      recommends: null,
      synopsis: "",
      cover: (() => {
        const src = chunk.match(/<img[^>]*src\s*=\s*"([^"]+)"/)?.[1];
        return src ? (src.startsWith("http") ? src : `https:${src}`) : null;
      })(),
      favorites: parseKM(chunk.match(/thumb_s4">[\s\S]*?<\/i>\s*([\d.,]+[KM]?)/i)?.[1]),
    });
  }
  items.sort((a, b) => a.rank - b.rank);
  return items.slice(0, 100);
}

type NovelpiaSearchItem = {
  novel_no?: number;
  novel_name?: string;
  writer_nick?: string;
  novel_genre_arr?: string[];
  cover_url?: string | null;
  novel_age?: number;
};

/** 제목 키워드로 노벨피아 작품 검색 (성인작품은 열람 불가라 제외). */
export async function searchNovels(keyword: string, limit = 20): Promise<SearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const params = new URLSearchParams({
    cmd: "novel_search",
    page: "1",
    rows: String(limit),
    search_type: "all",
    search_val: kw,
    sort_col: "last_viewdate",
    block_out: "0",
    block_stop: "0",
    is_contest: "0",
    is_challenge: "0",
    list_display: "list",
  });
  const res = await fetch(`${BASE}/proc/novel?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for novelpia search`);
  const json = (await res.json()) as { list?: NovelpiaSearchItem[] };

  return (json.list ?? [])
    .filter(
      (n): n is NovelpiaSearchItem & { novel_no: number; novel_name: string } =>
        Boolean(n.novel_no && n.novel_name) && !n.novel_age // 성인작품 제외
    )
    .map((n) => ({
      novelId: n.novel_no,
      title: n.novel_name,
      author: n.writer_nick ?? "",
      genre: (n.novel_genre_arr ?? []).slice(0, 2).join(" "),
      cover: n.cover_url ? (n.cover_url.startsWith("http") ? n.cover_url : `https:${n.cover_url}`) : null,
    }));
}
