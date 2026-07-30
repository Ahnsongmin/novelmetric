// 아카라이브 웹소설 연재 채널 글 반응 추적 스크립트.
//   글 페이지에서 조회수·댓글수·댓글 내용을 파싱해 scripts/arca-post-metrics-<글ID>.json에 누적 기록.
//   새 댓글은 newComments 배열로 출력 (id·작성자·본문) — 답글 판단은 호출자가 함.
//   사용법: node scripts/track-arca-post.mjs [--post 글ID]   (기본: 178096419 = 7/27 출시 글)
//   ※ 구버전 데이터 글(177401493) 기록은 arca-post-metrics.json / arca-comment-state.json에 그대로 남아 있음.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const postIdx = argv.indexOf("--post");
const POST_ID = postIdx >= 0 ? argv[postIdx + 1] : "178096419";
const POST_URL = `https://arca.live/b/webfiction/${POST_ID}`;
const metricsPath = join(here, `arca-post-metrics-${POST_ID}.json`);
const commentStatePath = join(here, `arca-comment-state-${POST_ID}.json`);

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const res = await fetch(POST_URL, { headers: UA });
if (!res.ok) {
  console.error(JSON.stringify({ error: `HTTP ${res.status} — 글 삭제/차단 여부 브라우저로 확인 필요` }));
  process.exit(1);
}
const html = await res.text();

const num = (re) => {
  const m = html.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};
const views = num(/class="head">조회수<\/span>\s*<span class="body">([\d,]+)/);
const comments = num(/class="body comment-count">([\d,]+)/);
const recos = num(/id="ratingUp"[^>]*>([\d,]+)/) ?? num(/class="head">추천<\/span>\s*<span class="body[^"]*">([\d,]+)/);

if (views === null && comments === null) {
  console.error(JSON.stringify({ error: "수치 파싱 실패 — 페이지 구조 변경 또는 차단 가능성, 브라우저로 확인 필요" }));
  process.exit(1);
}

// 댓글 파싱: id="c_숫자" 블록별로 작성자·본문 추출 (구조가 바뀌면 text가 비어 나올 수 있음 — 그 경우 브라우저로 확인)
const strip = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const commentList = [];
const blocks = html.split(/id="c_(\d+)"/);
for (let i = 1; i < blocks.length; i += 2) {
  const id = blocks[i];
  const chunk = blocks[i + 1] ?? "";
  const authorM = chunk.match(/data-filter="([^"]*)"/) ?? chunk.match(/class="user-info"[^>]*>([\s\S]*?)<\/span>/);
  const textM = chunk.match(/class="text[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? chunk.match(/class="message"[^>]*>([\s\S]*?)<\/div>/);
  commentList.push({
    id,
    author: authorM ? strip(authorM[1]) : "(작성자 파싱 실패)",
    text: textM ? strip(textM[1]) : "(본문 파싱 실패 — 브라우저로 확인)",
  });
}

const knownIds = existsSync(commentStatePath)
  ? JSON.parse(readFileSync(commentStatePath, "utf8").replace(/^﻿/, ""))
  : [];
const newComments = commentList.filter((c) => !knownIds.includes(c.id));
writeFileSync(commentStatePath, JSON.stringify(commentList.map((c) => c.id)));

const history = existsSync(metricsPath)
  ? JSON.parse(readFileSync(metricsPath, "utf8").replace(/^﻿/, ""))
  : [];
const prev = history.length ? history[history.length - 1] : null;
const entry = { at: new Date().toISOString(), views, recos, comments };
history.push(entry);
writeFileSync(metricsPath, JSON.stringify(history, null, 2));

console.log(
  JSON.stringify(
    {
      postUrl: POST_URL,
      current: entry,
      delta: prev
        ? { views: (views ?? 0) - (prev.views ?? 0), comments: (comments ?? 0) - (prev.comments ?? 0), sincePrev: prev.at }
        : "첫 기록",
      newComments,
    },
    null,
    2
  )
);
