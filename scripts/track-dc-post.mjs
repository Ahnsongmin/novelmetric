// 디시 웹연갤 홍보 글(no=1294715) 반응 추적 스크립트.
//   목록 검색 페이지에서 조회수·추천·댓글수를 파싱해 scripts/dc-post-metrics.json에 누적 기록.
//   출력: 직전 기록과의 변화량 포함 JSON.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const POST_NO = 1294715;
const LIST_URL =
  "https://gall.dcinside.com/mgallery/board/lists/?id=tgijjdd&s_type=name&s_keyword=%EB%85%B8%EB%B8%94%EB%A9%94%ED%8A%B8%EB%A6%AD";
const metricsPath = join(here, "dc-post-metrics.json");

const res = await fetch(LIST_URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
  },
});
if (!res.ok) {
  console.error(JSON.stringify({ error: `HTTP ${res.status}` }));
  process.exit(1);
}
const html = await res.text();

// 글 행 추출: data-no="1294715" 를 포함한 <tr> 블록
const rowMatch = html.match(
  new RegExp(`<tr[^>]*data-no="${POST_NO}"[\\s\\S]*?</tr>`)
);
if (!rowMatch) {
  console.error(JSON.stringify({ error: `글 ${POST_NO} 행을 찾지 못함 (삭제/차단 여부 확인 필요)` }));
  process.exit(1);
}
const row = rowMatch[0];

const num = (re) => {
  const m = row.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};
const views = num(/gall_count[^>]*>([\d,]+)</);
const recos = num(/gall_recommend[^>]*>([\d,]+)</);
const cmtM = row.match(/reply_num[^>]*>\[([\d,]+)\]/);
const comments = cmtM ? Number(cmtM[1].replace(/,/g, "")) : 0;

const history = existsSync(metricsPath)
  ? JSON.parse(readFileSync(metricsPath, "utf8"))
  : [];
const prev = history.length ? history[history.length - 1] : null;
const entry = { at: new Date().toISOString(), views, recos, comments };
history.push(entry);
writeFileSync(metricsPath, JSON.stringify(history, null, 2));

console.log(
  JSON.stringify(
    {
      postUrl: `https://gall.dcinside.com/mgallery/board/view/?id=tgijjdd&no=${POST_NO}`,
      current: entry,
      delta: prev
        ? {
            views: views - prev.views,
            recos: recos - prev.recos,
            comments: comments - prev.comments,
            sincePrev: prev.at,
          }
        : "첫 기록",
    },
    null,
    2
  )
);
