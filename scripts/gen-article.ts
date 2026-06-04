// 실데이터 기반 마케팅 글 자동 생성
//   npx tsx scripts/gen-article.ts
// 문피아 오늘 베스트 → 분석 → 커뮤니티/블로그용 마크다운 글 생성
import { fetchBest } from "../lib/munpia";
import { analyzeBest } from "../lib/analyze";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

async function main() {
  const items = await fetchBest("today");
  const a = analyzeBest(items);
  const date = new Date().toISOString().slice(0, 10);
  const lift =
    a.avgViewsNoHook > 0 ? (a.avgViewsWithHook / a.avgViewsNoHook).toFixed(1) : "-";

  const topHooks = a.hooks.filter((h) => h.count > 0).slice(0, 5);

  const md = `# 연독률만 보지 말고 '제목'부터 — 문피아 베스트 ${items.length}작 데이터 (${date})

연독률(최신화/3화 조회수 유지율)이 작가들이 가장 신경 쓰는 지표죠. 그런데 **연독률 이전에 클릭이 안 되면(=제목)** 1화 조회수 자체가 안 나옵니다. 그래서 오늘(${date}) 문피아 무료 투데이 베스트 상위 ${items.length}작의 **제목**을 데이터로 뜯어봤습니다.

> 참고: 내 작품 **연독률·선작(투베 게이지)·회차별 조회수**를 자동 계산해주는 무료 대시보드도 만들었습니다 → https://novelmetric.vercel.app/dashboard (문피아 작품 ID만 넣으면 됨)

## 1. 상위작이 가장 많이 쓴 후킹 키워드

${topHooks.map((h, i) => `${i + 1}. **${h.label}** — 상위작의 ${h.pct}% (${h.count}작)`).join("\n")}

> 1위 후킹은 **${topHooks[0]?.label ?? "-"}**. 상위권일수록 제목 첫 부분에서 장르·클리셰가 바로 읽히는 게 공통점입니다.

## 2. 후킹 키워드, 진짜 효과 있나?

- 후킹 키워드가 **있는** 제목 평균 조회수: **${fmt(a.avgViewsWithHook)}**
- 후킹 키워드가 **없는** 제목 평균 조회수: **${fmt(a.avgViewsNoHook)}**
- → 후킹 있는 제목이 평균 **${lift}배** 더 높았습니다. (오늘 베스트 기준)

## 3. 장르 분포

${a.genres.map((g) => `- ${g.name}: ${g.count}작`).join("\n")}

## 4. 제목에 자주 등장한 단어

${a.topKeywords.map((k) => `\`${k.word}\``).join(" · ") || "(반복 단어 적음)"}

## 5. 오늘의 베스트 TOP 10

| # | 제목 | 장르 | 조회수 | 추천수 |
|---|------|------|-------:|-------:|
${items
  .slice(0, 10)
  .map((it) => `| ${it.rank} | ${it.title} | ${it.genre} | ${fmt(it.views ?? 0)} | ${fmt(it.recommends ?? 0)} |`)
  .join("\n")}

---

### 정리: 클릭률 높은 제목 체크리스트
- [ ] 첫 단어에서 장르/클리셰가 읽히는가 (${topHooks.slice(0, 3).map((h) => h.label).join(", ")})
- [ ] 구체성(숫자·신분·직업)이 있는가
- [ ] 모바일 목록에서 안 잘리게 22자 내외인가

> 내 작품 제목은 몇 점인지 **무료로 진단**해 보세요 → https://novelmetric.vercel.app
> (제목·소개글 넣으면 클릭률 점수 + 대안 제목 5개)

*데이터: 문피아 무료 투데이 베스트, ${date} 수집. 분석: 노블메트릭.*
`;

  const dir = join(process.cwd(), "content", "insights");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${date}-munpia-title-patterns.md`);
  writeFileSync(file, md, "utf8");
  console.log(`✅ 글 생성 완료: ${file}\n`);
  console.log(md);
}

main().catch((e) => {
  console.error("❌ 실패:", e);
  process.exit(1);
});
